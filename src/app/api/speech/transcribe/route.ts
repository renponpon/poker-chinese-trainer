import { NextResponse } from "next/server";
import { createId } from "@/lib/id";
import { getBearerToken } from "@/infrastructure/server/request-auth";
import {
  getOpenAiTranscriptionModel,
  OpenAiSpeechProviderError,
  transcribeSpeechWithOpenAi,
} from "@/infrastructure/server/openai-speech";
import { recordAiUsageEvent } from "@/infrastructure/server/usage-event-recorder";
import {
  assertWithinDailyAiLimit,
  identifyRequestActor,
  UsageLimitError,
  UsageTrackingError,
  type RequestActor,
} from "@/infrastructure/server/usage-limits";
import { RequestValidationError } from "@/lib/server/validation";
import { LANGUAGE_CONFIGS, isLanguageCode } from "@/lib/languages";

export const runtime = "nodejs";

const ENDPOINT = "/api/speech/transcribe";
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_DURATION_MS = 20_000;

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
    inputChars = Math.ceil(audio.size / 4);

    const { transcript, model } = await transcribeSpeechWithOpenAi({
      audio,
      languageHint,
    });
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
        model: getOpenAiTranscriptionModel(),
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

function normalizeLanguageHint(value: FormDataEntryValue | null): string | "auto" {
  if (typeof value !== "string" || !value) return "auto";
  const language = Object.values(LANGUAGE_CONFIGS).find(
    (config) => config.speechRecognitionCode === value,
  );
  if (language) return language.code;
  const shortCode = value.split("-")[0];
  return isLanguageCode(shortCode) ? shortCode : "auto";
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
  if (error instanceof OpenAiSpeechProviderError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  return {
    status: 500,
    code: "internal_error",
    message: error instanceof Error ? error.message : "音声の文字起こしに失敗しました",
  };
}
