import { NextResponse } from "next/server";
import { generatePersonalPhrasePackForProfile } from "@/application/phrase/generate-personal-phrase-pack-for-profile";
import {
  createPhrasePackCandidateGenerator,
  PhrasePackCandidateParseError,
} from "@/infrastructure/server/phrase-pack-candidate-parser";
import { buildPhrasePackPrompt } from "@/infrastructure/server/phrase-pack-prompt";
import { createId } from "@/lib/id";
import { buildDirection, isLanguageCode } from "@/lib/languages";
import { sanitizePhrasePackProfile } from "@/lib/personal-phrase-pack";
import { recordAiUsageEvent } from "@/infrastructure/server/usage-event-recorder";
import {
  assertWithinPhrasePackDailyLimit,
  identifyRequestActor,
  PhrasePackLimitError,
  UsageLimitError,
  UsageTrackingError,
  type RequestActor,
} from "@/infrastructure/server/usage-limits";
import { RequestValidationError } from "@/lib/server/validation";
import { getBearerToken } from "@/infrastructure/server/request-auth";
import type { LanguageCode, PhrasePackProfile, PhraseDirection } from "@/lib/types";

export const runtime = "nodejs";

const ENDPOINT = "/api/phrase/generate-pack";
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const PHRASE_MAX_OUTPUT_TOKENS = 4096;
const EXISTING_TARGET_LIMIT = 80;
const CATEGORY_IDS = new Set([
  "poker-table",
  "floor",
  "restaurant",
  "transport",
  "hotel",
  "shopping",
  "work",
  "hospital",
  "other",
]);

type GeneratePackRequest = {
  profile?: unknown;
  targetLanguage?: unknown;
  existingTargets?: unknown;
  existingChinese?: unknown;
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
  let outputChars = 0;

  try {
    const accessToken = getBearerToken(req);
    actor = await identifyRequestActor(req, accessToken);
    const body = await parseRequest(req);
    const profile = parseProfile(body.profile);
    const targetLanguage = parseTargetLanguage(body.targetLanguage);
    const existingTargets = parseExistingTargets(body.existingTargets ?? body.existingChinese);
    const payload = { profile, targetLanguage, existingTargets };
    inputChars = JSON.stringify(payload).length;

    await assertWithinPhrasePackDailyLimit(actor);

    const generatedPack = await generatePhrasesOnly(profile, existingTargets, targetLanguage);
    outputChars = generatedPack.outputChars;

    await recordUsage({
      requestId,
      actor,
      inputChars,
      outputChars,
      direction: buildDirection("ja", targetLanguage),
      success: true,
      errorCode: null,
    });

    return NextResponse.json({
      requestId,
      provider: "gemini",
      model: GEMINI_MODEL,
      phrases: generatedPack.phrases,
    });
  } catch (error) {
    const normalized = normalizeRouteError(error);
    console.error("[/api/phrase/generate-pack] error", {
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
        direction: null,
        success: false,
        errorCode: normalized.code,
      });
    }

    return NextResponse.json(
      { error: normalized.message, requestId },
      { status: normalized.status },
    );
  }
}

async function parseRequest(req: Request): Promise<GeneratePackRequest> {
  try {
    const raw = await req.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new RequestValidationError("リクエスト形式が正しくありません");
    }
    return raw as GeneratePackRequest;
  } catch (error) {
    if (error instanceof RequestValidationError) throw error;
    throw new RequestValidationError("JSON形式のリクエストを送ってください");
  }
}

function parseProfile(value: unknown): PhrasePackProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("質問への回答が正しくありません");
  }
  const profile = sanitizePhrasePackProfile(value as Partial<PhrasePackProfile>);
  if (!profile.scenes.length) {
    throw new RequestValidationError("場面を1つ以上選んでください");
  }
  return profile;
}

function parseTargetLanguage(value: unknown): LanguageCode {
  if (typeof value === "undefined" || value === null) return "zh";
  if (!isLanguageCode(value) || value === "ja") {
    throw new RequestValidationError("対象言語が正しくありません");
  }
  return value;
}

function parseExistingTargets(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, EXISTING_TARGET_LIMIT);
}

async function generatePhrasesOnly(
  profile: PhrasePackProfile,
  existingTargets: string[],
  targetLanguage: LanguageCode,
) {
  return generatePersonalPhrasePackForProfile({
    profile,
    targetLanguage,
    existingTargets,
    createId,
    createInsufficientError,
    normalizeError: wrapParseError,
    onAttemptError: ({ attempt, error, originalError }) => {
      const code = error instanceof ApiRouteError ? error.code : "unknown";
      console.error("[/api/phrase/generate-pack] phrase parse failed", {
        attempt,
        code,
        preview: originalError instanceof Error ? originalError.message : String(originalError),
      });
    },
    createCandidateGenerator: ({ profile, targetLanguage, maxCandidates }) =>
      createPhrasePackCandidateGenerator({
        model: GEMINI_MODEL,
        maxOutputTokens: PHRASE_MAX_OUTPUT_TOKENS,
        maxCandidates,
        profile,
        targetLanguage,
        categoryIds: CATEGORY_IDS,
        buildPrompt: ({ attempt, targetCount, seenTargets }) =>
          buildPhrasePackPrompt(profile, seenTargets, targetLanguage, attempt, targetCount),
        createMissingApiKeyError: () =>
          new ApiRouteError("GEMINI_API_KEY が設定されていません", 500, "missing_gemini_api_key"),
        createEmptyResponseError: () =>
          new ApiRouteError("Gemini から空の応答が返りました", 502, "empty_gemini_response"),
      }),
  });
}

function createInsufficientError(): ApiRouteError {
  return new ApiRouteError(
    "10件のフレーズを作れませんでした。もう一度お試しください。",
    502,
    "invalid_phrase_count",
  );
}

function wrapParseError(error: unknown): ApiRouteError {
  if (error instanceof ApiRouteError) return error;
  if (error instanceof PhrasePackCandidateParseError) {
    return new ApiRouteError(error.message, 502, error.code);
  }
  return new ApiRouteError(
    "生成結果の解析に失敗しました",
    502,
    "invalid_gemini_response",
  );
}

async function recordUsage(input: {
  requestId: string;
  actor: RequestActor;
  inputChars: number;
  outputChars: number;
  direction: PhraseDirection | null;
  success: boolean;
  errorCode: string | null;
}) {
  await recordAiUsageEvent({
    requestId: input.requestId,
    userId: input.actor.userId,
    actorType: input.actor.type,
    ipHash: input.actor.ipHash,
    endpoint: ENDPOINT,
    feature: "translation",
    provider: "gemini",
    mode: "phrase_pack",
    sourcePage: "drill",
    direction: input.direction,
    inputChars: input.inputChars,
    outputChars: input.outputChars,
    audioDurationMs: null,
    success: input.success,
    errorCode: input.errorCode,
    model: GEMINI_MODEL,
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
  if (
    error instanceof UsageLimitError ||
    error instanceof UsageTrackingError ||
    error instanceof PhrasePackLimitError
  ) {
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
