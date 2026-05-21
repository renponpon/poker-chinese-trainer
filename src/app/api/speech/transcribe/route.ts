import { NextResponse } from "next/server";
import { createId } from "@/lib/id";
import { getBearerToken } from "@/lib/supabase";
import { recordAiUsageEvent } from "@/lib/server/supabase-admin";
import {
  assertWithinDailyAiLimit,
  identifyRequestActor,
  UsageLimitError,
  UsageTrackingError,
  type RequestActor,
} from "@/lib/server/usage-limits";
import { RequestValidationError } from "@/lib/server/validation";

export const runtime = "nodejs";

const ENDPOINT = "/api/speech/transcribe";
const DEFAULT_MODEL = "whisper-1";
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_DURATION_MS = 20_000;

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
  let outputChars = 0;
  const startedAt = Date.now();

  try {
    const accessToken = getBearerToken(req);
    actor = await identifyRequestActor(req, accessToken);
    await assertWithinDailyAiLimit(actor);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ApiRouteError("OPENAI_API_KEY が設定されていません", 500, "missing_openai_api_key");
    }

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) {
      throw new RequestValidationError("音声ファイルが見つかりません");
    }
    if (audio.size <= 0) {
      throw new RequestValidationError("音声ファイルが空です");
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      throw new RequestValidationError("音声ファイルが大きすぎます。短く録音してください");
    }

    const durationMs = normalizeDuration(form.get("durationMs"));
    if (durationMs && durationMs > MAX_DURATION_MS + 1500) {
      throw new RequestValidationError("録音時間が長すぎます。20秒以内で試してください");
    }

    const languageHint = normalizeLanguageHint(form.get("languageHint"));
    const sourcePage = normalizeSourcePage(form.get("sourcePage"));
    const model = process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_MODEL;
    inputChars = Math.ceil(audio.size / 4);

    const openAiForm = new FormData();
    openAiForm.set("file", audio);
    openAiForm.set("model", model);
    openAiForm.set("response_format", "json");
    if (languageHint !== "auto") {
      openAiForm.set("language", languageHint === "ja-JP" ? "ja" : "zh");
    }

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: openAiForm,
    });
    const data = (await response.json().catch(() => null)) as { text?: unknown; error?: { message?: string } } | null;
    if (!response.ok) {
      throw new ApiRouteError(
        data?.error?.message || "音声の文字起こしに失敗しました",
        response.status,
        "openai_transcribe_failed",
      );
    }

    const transcript = typeof data?.text === "string" ? data.text.trim() : "";
    if (!transcript) {
      throw new ApiRouteError("音声を文字起こしできませんでした", 502, "empty_transcript");
    }
    outputChars = transcript.length;

    await recordUsage({
      requestId,
      actor,
      inputChars,
      outputChars,
      success: true,
      errorCode: null,
      model,
      durationMs,
      sourcePage,
    });

    return NextResponse.json({
      requestId,
      provider: "openai",
      model,
      language: languageHint,
      transcript,
      durationMs,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    const normalized = normalizeRouteError(error);
    console.error("[/api/speech/transcribe] error", {
      requestId,
      code: normalized.code,
      error,
    });

    if (actor) {
      await recordUsage({
        requestId,
        actor,
        inputChars,
        outputChars,
        success: false,
        errorCode: normalized.code,
        model: process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_MODEL,
        durationMs: null,
        sourcePage: null,
      });
    }

    return NextResponse.json(
      { error: normalized.message, requestId, code: normalized.code },
      { status: normalized.status },
    );
  }
}

function normalizeDuration(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeLanguageHint(value: FormDataEntryValue | null): "ja-JP" | "zh-CN" | "auto" {
  return value === "ja-JP" || value === "zh-CN" ? value : "auto";
}

function normalizeSourcePage(value: FormDataEntryValue | null): "add" | "conversation" | null {
  return value === "add" || value === "conversation" ? value : null;
}

async function recordUsage(input: {
  requestId: string;
  actor: RequestActor;
  inputChars: number;
  outputChars: number;
  success: boolean;
  errorCode: string | null;
  model: string;
  durationMs: number | null;
  sourcePage: "add" | "conversation" | null;
}) {
  await recordAiUsageEvent({
    requestId: input.requestId,
    userId: input.actor.userId,
    actorType: input.actor.type,
    ipHash: input.actor.ipHash,
    endpoint: ENDPOINT,
    feature: "speech_to_text",
    provider: "openai",
    mode: "high_accuracy",
    sourcePage: input.sourcePage,
    direction: null,
    inputChars: input.inputChars,
    outputChars: input.outputChars,
    audioDurationMs: input.durationMs,
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
    message: error instanceof Error ? error.message : "音声の文字起こしに失敗しました",
  };
}
