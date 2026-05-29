import { NextResponse } from "next/server";
import { createId } from "@/lib/id";
import { isLanguageCode, LANGUAGE_CONFIGS } from "@/lib/languages";
import { recordAiUsageEvent } from "@/lib/server/supabase-admin";
import {
  assertWithinDailyAiLimit,
  identifyRequestActor,
  UsageLimitError,
  UsageTrackingError,
  type RequestActor,
} from "@/lib/server/usage-limits";
import { RequestValidationError } from "@/lib/server/validation";
import { getBearerToken } from "@/lib/supabase";

export const runtime = "nodejs";

const ENDPOINT = "/api/speech/synthesize";
const DEFAULT_MODEL = "gpt-4o-mini-tts";
const DEFAULT_VOICE = "marin";
const MAX_TEXT_CHARS = 300;

type SynthesizeRequest = {
  text?: unknown;
  langCode?: unknown;
};

class ApiRouteError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "ApiRouteError";
  }
}

export async function POST(req: Request) {
  const requestId = createId();
  let actor: RequestActor | null = null;
  let inputChars = 0;

  try {
    const accessToken = getBearerToken(req);
    actor = await identifyRequestActor(req, accessToken);
    await assertWithinDailyAiLimit(actor);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ApiRouteError("OPENAI_API_KEY が設定されていません", 500, "missing_openai_api_key");
    }

    const body = await parseRequest(req);
    const text = normalizeText(body.text, "text", MAX_TEXT_CHARS);
    const langCode = normalizeLangCode(body.langCode);
    inputChars = text.length;

    const model = process.env.OPENAI_TTS_MODEL || DEFAULT_MODEL;
    const voice = process.env.OPENAI_TTS_VOICE || DEFAULT_VOICE;
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        voice,
        input: text,
        response_format: "mp3",
        instructions: buildInstructions(langCode),
      }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new ApiRouteError(
        data?.error?.message || "音声の生成に失敗しました",
        response.status,
        "openai_tts_failed",
      );
    }

    const audio = await response.arrayBuffer();

    if (actor) {
      await recordUsage({
        requestId,
        actor,
        inputChars,
        success: true,
        errorCode: null,
        model,
      });
    }

    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=86400",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    const normalized = normalizeRouteError(error);
    console.error("[/api/speech/synthesize] error", {
      requestId,
      code: normalized.code,
      error,
    });

    if (actor) {
      await recordUsage({
        requestId,
        actor,
        inputChars,
        success: false,
        errorCode: normalized.code,
        model: process.env.OPENAI_TTS_MODEL || DEFAULT_MODEL,
      });
    }

    return NextResponse.json(
      { error: normalized.message, requestId, code: normalized.code },
      { status: normalized.status },
    );
  }
}

async function parseRequest(req: Request): Promise<SynthesizeRequest> {
  try {
    const raw = await req.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new RequestValidationError("リクエスト形式が正しくありません");
    }
    return raw as SynthesizeRequest;
  } catch (error) {
    if (error instanceof RequestValidationError) throw error;
    throw new RequestValidationError("JSON形式のリクエストを送ってください");
  }
}

function normalizeText(value: unknown, field: string, maxChars: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestValidationError(`${field} が空です`);
  }
  return value.trim().slice(0, maxChars);
}

function normalizeLangCode(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "en-US";
  const shortCode = value.split("-")[0];
  if (!isLanguageCode(shortCode)) return "en-US";
  return LANGUAGE_CONFIGS[shortCode].speechSynthesisCode;
}

function buildInstructions(langCode: string): string {
  if (langCode.toLowerCase().startsWith("en")) {
    return "Speak clearly in natural American English at a steady learning-friendly pace.";
  }
  return "Speak clearly and naturally at a steady learning-friendly pace.";
}

async function recordUsage(input: {
  requestId: string;
  actor: RequestActor;
  inputChars: number;
  success: boolean;
  errorCode: string | null;
  model: string;
}) {
  await recordAiUsageEvent({
    requestId: input.requestId,
    userId: input.actor.userId,
    actorType: input.actor.type,
    ipHash: input.actor.ipHash,
    endpoint: ENDPOINT,
    feature: "usage_event",
    provider: "openai",
    mode: "text_to_speech",
    sourcePage: null,
    direction: null,
    inputChars: input.inputChars,
    outputChars: 0,
    audioDurationMs: null,
    success: input.success,
    errorCode: input.errorCode,
    model: input.model,
  });
}

function normalizeRouteError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof RequestValidationError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof UsageLimitError || error instanceof UsageTrackingError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof ApiRouteError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  return {
    status: 500,
    code: "internal_error",
    message: error instanceof Error ? error.message : "音声の生成に失敗しました",
  };
}
