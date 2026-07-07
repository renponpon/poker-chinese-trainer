import { after, NextResponse } from "next/server";
import {
  generateTranslation,
  type TranslationProvider,
} from "@/application/phrase/generate-translation";
import { persistSavedPhrases } from "@/application/phrase/persist-saved-phrases";
import { createPhraseCloudStorage } from "@/infrastructure/server/phrase-cloud-storage";
import { getBearerToken } from "@/infrastructure/server/request-auth";
import {
  createPhraseTranslationProviders,
  getTranslationProviderModel,
  getTranslationTimingErrorMessage,
  warmupTranslationProviders,
} from "@/infrastructure/server/translation-providers";
import { generateQualityPhraseWithGemini } from "@/infrastructure/server/quality-phrase-generator";
import { buildQualityPrompt } from "@/infrastructure/server/quality-phrase-prompt";
import { recordAiUsageEvent } from "@/infrastructure/server/usage-event-recorder";
import { createId } from "@/lib/id";
import { buildDirection, isLanguageCode } from "@/lib/languages";
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
import { parseGenerationMode, type GenerationMode } from "@/lib/generation-mode";
import { toStudyPhraseFields } from "@/lib/study-phrase";
import type { LanguageCode } from "@/lib/types";

export const runtime = "nodejs";

const ENDPOINT = "/api/phrase/add";
const GEMINI_MODEL = "gemini-3.1-flash-lite";
type UsageRecordInput = {
  requestId: string;
  actor: RequestActor;
  validated: ValidatedPhraseAddRequest | null;
  generationMode: GenerationMode | null;
  provider: TranslationProvider | null;
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

export async function POST(req: Request) {
  const requestId = createId();
  let actor: RequestActor | null = null;
  let validated: ValidatedPhraseAddRequest | null = null;
  let generationMode: GenerationMode | null = null;
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
      const targetLanguage = measureSync("parseWarmupTarget", () =>
        parseWarmupTargetLanguage(rawRequest as { targetLanguage?: unknown }),
      );
      const direction = buildDirection("ja", targetLanguage);
      const results = await measure("warmup", () =>
        warmupTranslationProviders(direction, timingEnabled ? timing : null),
      );
      const finalTiming = finishTiming(timingEnabled, timingStartedAt, timing, {
        mode: "warmup",
        provider: null,
        persist: "false",
      });

      return NextResponse.json({
        ok: results.some((result) => result.ok || result.skipped),
        requestId,
        results,
        ...(finalTiming ? { timing: finalTiming } : {}),
      });
    }

    validated = measureSync("validate", () => validatePhraseAddRequest(rawRequest));
    generationMode = measureSync("parseMode", () =>
      parseGenerationMode((rawBody as { generationMode?: unknown }).generationMode),
    );
    const persist = measureSync(
      "parsePersist",
      () => (rawBody as { persist?: unknown }).persist !== false,
    );
    const { generated, provider } = await measure("translate", () =>
      generateTranslation({
        mode: generationMode!,
        request: {
          direction: validated!.direction,
          inputText: validated!.inputText,
        },
        providers: createPhraseTranslationProviders({
          timing: timingEnabled ? timing : null,
          translateWithGemini: () => generateWithGemini(validated!),
        }),
        onProviderFallback: ({ error }) => {
          if (timingEnabled) {
            timing.deeplStatus = "failed";
            timing.deeplError = getTranslationTimingErrorMessage(error);
          }
          console.warn("[/api/phrase/add] DeepL failed, falling back to Azure", {
            error: error instanceof Error ? error.message : error,
          });
        },
      }),
    );
    if (timingEnabled && generationMode === "normal") {
      if (provider === "deepl") timing.normalPrimary = "deepl";
      if (provider === "azure") timing.normalFallback = "azure";
    }
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
            categoryId: request.categoryId,
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
      model: getTranslationProviderModel(provider),
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
    inputChars: input.validated?.inputText.length ?? 0,
    outputChars: input.outputChars,
    audioDurationMs: null,
    success: input.success,
    errorCode: input.errorCode,
    model: input.provider ? getTranslationProviderModel(input.provider) : null,
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

function parseWarmupTargetLanguage(
  raw: { targetLanguage?: unknown },
): Exclude<LanguageCode, "ja"> {
  const targetLanguage = raw.targetLanguage;
  if (isLanguageCode(targetLanguage) && targetLanguage !== "ja") {
    return targetLanguage;
  }
  return "zh";
}

function generateWithGemini(validated: ValidatedPhraseAddRequest) {
  return generateQualityPhraseWithGemini({
    model: GEMINI_MODEL,
    direction: validated.direction,
    inputText: validated.inputText,
    prompt: buildQualityPrompt(validated.direction),
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
