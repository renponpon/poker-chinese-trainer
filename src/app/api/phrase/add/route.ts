import { AiBudgetError } from "@/infrastructure/server/ai-budget";
import { withDeferredBudgetSettlement } from "@/lib/server/with-ai-budget-settlements";
import { RequestStoppedError } from "@/lib/timed-request";

import { after, NextResponse } from "next/server";
import { persistSavedPhrases } from "@/application/phrase/persist-saved-phrases";
import { createPhraseCloudStorage } from "@/infrastructure/server/phrase-cloud-storage";
import { getBearerToken } from "@/infrastructure/server/request-auth";
import { generateQualityPhraseWithGemini } from "@/infrastructure/server/quality-phrase-generator";
import {
  buildQualityPrompt,
  buildQualityRefinementPrompt,
} from "@/infrastructure/server/quality-phrase-prompt";
import { recordAiUsageEvent } from "@/infrastructure/server/usage-event-recorder";
import { createId } from "@/lib/id";
import {
  AiBurstLimitError,
  assertWithinAiBurstLimit,
  identifyRequestActor,
  UsageLimitError,
  UsageTrackingError,
  type RequestActor,
} from "@/infrastructure/server/usage-limits";
import {
  parseJsonObject,
  RequestValidationError,
  validatePhraseAddRequest,
  type ValidatedPhraseAddRequest,
} from "@/lib/server/validation";
import { TRANSLATION_MODE } from "@/lib/generation-mode";
import { toStudyPhraseFields } from "@/lib/study-phrase";

export const runtime = "nodejs";

const ENDPOINT = "/api/phrase/add";
const GEMINI_MODEL = "gemini-3.5-flash-lite";
type UsageRecordInput = {
  requestId: string;
  actor: RequestActor;
  validated: ValidatedPhraseAddRequest | null;
  generationMode: typeof TRANSLATION_MODE | null;
  provider: "gemini" | null;
  outputChars: number;
  success: boolean;
  errorCode: string | null;
};
type RouteTiming = Record<string, number | string | null>;

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

export const POST = withDeferredBudgetSettlement(handlePost);

async function handlePost(req: Request) {
  const requestId = createId();
  let actor: RequestActor | null = null;
  let validated: ValidatedPhraseAddRequest | null = null;
  let generationMode: typeof TRANSLATION_MODE | null = null;
  let outputChars = 0;
  const timingEnabled = isTimingEnabled(req);
  const timingStartedAt = Date.now();
  const timing: RouteTiming = {};
  const measure = async <T>(name: string, task: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    try {
      return await task();
    } finally {
      if (timingEnabled) timing[`${name}Ms`] = Date.now() - startedAt;
    }
  };
  const measureSync = <T>(name: string, task: () => T): T => {
    const startedAt = Date.now();
    try {
      return task();
    } finally {
      if (timingEnabled) timing[`${name}Ms`] = Date.now() - startedAt;
    }
  };

  try {
    const accessToken = getBearerToken(req);
    actor = await measure("identifyActor", () => identifyRequestActor(req, accessToken));

    let rawBody: unknown;
    try {
      rawBody = await measure("parseBody", () => req.json());
    } catch {
      throw new RequestValidationError("JSON形式のリクエストを送ってください");
    }

    const rawRequest = measureSync("parseRequest", () => parseJsonObject(rawBody));
    measureSync("abuseCheck", () => assertWithinAiBurstLimit(actor!));

    if ((rawRequest as { warmup?: unknown }).warmup === true) {
      return NextResponse.json({ ok: true, requestId, results: [] });
    }

    validated = measureSync("validate", () => validatePhraseAddRequest(rawRequest));
    generationMode = TRANSLATION_MODE;
    const persist = measureSync(
      "parsePersist",
      () => (rawBody as { persist?: unknown }).persist !== false,
    );
    const provider = "gemini";
    const generated = await measure("translate", () => generateWithGemini(validated!));
    outputChars =
      generated.japanese.length +
      generated.chinese.length +
      generated.pinyin.length +
      generated.explanation.length;
    generated.direction = validated.direction;
    if (!generated.japanese) {
      generated.japanese = validated.direction === "ja-to-zh" ? validated.inputText : "";
    }
    if (!generated.chinese && validated.direction === "zh-to-ja") {
      generated.chinese = validated.inputText;
    }
    const request = validated;

    queueUsageRecord({
      requestId,
      actor,
      validated: request,
      generationMode,
      provider,
      outputChars,
      success: true,
      errorCode: null,
    }, timingEnabled);

    if (persist) {
      after(async () => {
        try {
          const phrase = toStudyPhraseFields({
            id: request.phraseId,
            japanese: generated.japanese,
            chinese: generated.chinese,
            pinyin: generated.pinyin,
            sourceLanguage: generated.sourceLanguage,
            targetLanguage: generated.targetLanguage,
            sourceText: generated.sourceText,
            targetText: generated.targetText,
            reading: generated.reading,
            readingType: generated.readingType,
            explanation: generated.explanation,
            audioUrl: null,
            direction: request.direction,
            categoryId: null,
            shouldDrill: request.shouldDrill,
            source: request.source,
            createdAt: new Date().toISOString(),
            usedAt: request.source === "conversation" ? new Date().toISOString() : null,
          });
          await persistSavedPhrases({
            phrases: [phrase],
            storage: createPhraseCloudStorage({
              accessToken,
              ownerKey: request.ownerKey ?? "",
              nickname: request.nickname ?? "",
            }),
            onError: (error) => {
              throw error;
            },
          });
        } catch (saveError) {
          console.error("[/api/phrase/add] save error", { requestId, saveError });
        }
      });
    }

    const finalTiming = finishTiming(timingEnabled, timingStartedAt, timing, {
      mode: generationMode,
      provider,
      persist: persist ? "true" : "false",
    });
    if (finalTiming) {
      console.log("[/api/phrase/add] timing", { requestId, ...finalTiming });
    }

    return NextResponse.json({
      id: request.phraseId,
      requestId,
      provider,
      model: GEMINI_MODEL,
      ...generated,
      audioUrl: null,
      ...(finalTiming ? { timing: finalTiming } : {}),
    });
  } catch (error) {
    const normalized = normalizeRouteError(error);
    const finalTiming = finishTiming(timingEnabled, timingStartedAt, timing, {
      mode: generationMode,
      provider: null,
      persist: null,
      errorCode: normalized.code,
    });
    console.error("[/api/phrase/add] error", {
      requestId,
      code: normalized.code,
      timing: finalTiming,
      error,
    });
    if (error instanceof AiBurstLimitError && !error.alert.alreadyBlocked) {
      const alert = error.alert;
      after(async () => {
        const { sendAiBurstLimitAlertEmail } = await import("@/lib/server/security-alerts");
        await sendAiBurstLimitAlertEmail({
          requestId,
          endpoint: ENDPOINT,
          mode: generationMode,
          source: validated?.source ?? null,
          direction: validated?.direction ?? null,
          actorType: alert.actorType,
          userId: alert.userId,
          ipHash: alert.ipHash,
          count: alert.count,
          burstLimit: alert.burstLimit,
          windowSeconds: alert.windowSeconds,
          blockSeconds: alert.blockSeconds,
        });
      });
    }

    if (actor) {
      queueUsageRecord({
        requestId,
        actor,
        validated,
        generationMode,
        provider: null,
        outputChars,
        success: false,
        errorCode: normalized.code,
      }, timingEnabled);
    }

    return NextResponse.json(
      { error: normalized.message, requestId, ...(finalTiming ? { timing: finalTiming } : {}) },
      { status: normalized.status },
    );
  }
}

function queueUsageRecord(input: UsageRecordInput, timingEnabled: boolean): void {
  const queuedAt = Date.now();
  after(async () => {
    const startedAt = Date.now();
    try {
      await recordUsage(input);
    } catch (error) {
      console.error("[/api/phrase/add] usage record error", {
        requestId: input.requestId,
        error,
      });
    } finally {
      if (timingEnabled) {
        console.log("[/api/phrase/add] after timing", {
          requestId: input.requestId,
          usageLogDelayMs: startedAt - queuedAt,
          usageLogMs: Date.now() - startedAt,
        });
      }
    }
  });
}

async function recordUsage(input: UsageRecordInput) {
  await recordAiUsageEvent({
    requestId: input.requestId,
    userId: input.actor.userId,
    actorType: input.actor.type,
    ipHash: input.actor.ipHash,
    endpoint: ENDPOINT,
    feature: "translation",
    provider: input.provider,
    mode: input.generationMode,
    sourcePage: input.validated?.source === "conversation" ? "conversation" : "add",
    direction: input.validated?.direction ?? null,
    inputChars:
      (input.validated?.inputText.length ?? 0) +
      (input.validated?.nuance?.length ?? 0),
    outputChars: input.outputChars,
    audioDurationMs: null,
    success: input.success,
    errorCode: input.errorCode,
    model: input.provider ? GEMINI_MODEL : null,
  });
}

function isTimingEnabled(req: Request): boolean {
  if (process.env.DEBUG_TRANSLATION_TIMING === "1") return true;
  return process.env.NODE_ENV !== "production" && req.headers.get("x-debug-timing") === "1";
}

function finishTiming(
  enabled: boolean,
  startedAt: number,
  timing: RouteTiming,
  extra: Record<string, string | null>,
): RouteTiming | null {
  if (!enabled) return null;
  return {
    totalMs: Date.now() - startedAt,
    ...extra,
    ...timing,
  };
}

function generateWithGemini(validated: ValidatedPhraseAddRequest) {
  return generateQualityPhraseWithGemini({
    model: GEMINI_MODEL,
    direction: validated.direction,
    inputText: validated.inputText,
    prompt: validated.nuance
      ? buildQualityRefinementPrompt(validated.direction, {
          nuance: validated.nuance,
          previousTargetText: validated.previousTargetText,
        })
      : buildQualityPrompt(validated.direction),
    createMissingApiKeyError: () =>
      new ApiRouteError("GEMINI_API_KEY is not configured", 500, "missing_gemini_api_key"),
    createEmptyResponseError: () =>
      new ApiRouteError("Gemini returned an empty response", 502, "empty_gemini_response"),
  });
}

function normalizeRouteError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof AiBudgetError || error instanceof RequestStoppedError) {
    return { status: error.status, code: error.code, message: error.message };
  }
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
    message: error instanceof Error ? error.message : "サーバーエラーが発生しました",
  };
}
