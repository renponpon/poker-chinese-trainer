import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createId } from "@/lib/id";
import { isLanguageCode, isSupportedDirection, parseDirection } from "@/lib/languages";
import { generatePackExplanations } from "@/lib/pack-explanation";
import {
  assertValidPhrasePackRequest,
  identifyRequestActor,
  PhrasePackRequestError,
  UsageTrackingError,
} from "@/lib/server/usage-limits";
import { RequestValidationError } from "@/lib/server/validation";
import { getBearerToken } from "@/lib/supabase";
import type { LanguageCode, PhraseDirection, ReadingType } from "@/lib/types";

export const runtime = "nodejs";

const MAX_PHRASES_PER_REQUEST = 10;

type ExplainPackPhraseRequest = {
  packRequestId?: unknown;
  phrases?: unknown;
};

type NormalizedPhrase = {
  id: string;
  direction: PhraseDirection;
  japanese: string;
  chinese: string;
  pinyin: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  sourceText: string;
  targetText: string;
  reading: string;
  readingType: ReadingType;
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

  try {
    const accessToken = getBearerToken(req);
    const actor = await identifyRequestActor(req, accessToken);
    const body = await parseRequest(req);
    const packRequestId = normalizeText(body.packRequestId, "packRequestId", 80);
    const phrases = normalizePhrases(body.phrases);

    await assertValidPhrasePackRequest(actor, packRequestId);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ApiRouteError("GEMINI_API_KEY が設定されていません", 500, "missing_gemini_api_key");
    }

    const ai = new GoogleGenAI({ apiKey });
    const explanations = await generatePackExplanations(ai, phrases);

    return NextResponse.json({
      requestId,
      packRequestId,
      explanations: phrases.map((phrase, index) => ({
        id: phrase.id,
        explanation: explanations[index] ?? "",
      })),
    });
  } catch (error) {
    const normalized = normalizeRouteError(error);
    console.error("[/api/phrase/generate-pack/explain] error", {
      requestId,
      code: normalized.code,
      error,
    });
    return NextResponse.json(
      { error: normalized.message, requestId },
      { status: normalized.status },
    );
  }
}

async function parseRequest(req: Request): Promise<ExplainPackPhraseRequest> {
  try {
    const raw = await req.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new RequestValidationError("リクエスト形式が正しくありません");
    }
    return raw as ExplainPackPhraseRequest;
  } catch (error) {
    if (error instanceof RequestValidationError) throw error;
    throw new RequestValidationError("JSON形式のリクエストを送ってください");
  }
}

function normalizePhrases(value: unknown): NormalizedPhrase[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PHRASES_PER_REQUEST) {
    throw new RequestValidationError("解説を作るフレーズ数が正しくありません");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new RequestValidationError(`フレーズ${index + 1}の形式が正しくありません`);
    }
    const phrase = item as Record<string, unknown>;
    const direction = normalizeDirection(phrase.direction);
    const parsedDirection = parseDirection(direction);
    const sourceLanguage = normalizeLanguage(phrase.sourceLanguage, parsedDirection.sourceLanguage);
    const targetLanguage = normalizeLanguage(phrase.targetLanguage, parsedDirection.targetLanguage);
    const japanese = normalizeText(phrase.japanese, "japanese", 120);
    const chinese = normalizeText(phrase.chinese, "chinese", 160);
    const pinyin = normalizeOptionalText(phrase.pinyin, 120) ?? "";
    const sourceText = normalizeOptionalText(phrase.sourceText, 160) ??
      (sourceLanguage === "ja" ? japanese : chinese);
    const targetText = normalizeOptionalText(phrase.targetText, 160) ??
      (targetLanguage === "ja" ? japanese : chinese);
    const readingType = normalizeReadingType(
      phrase.readingType,
      sourceLanguage === "zh" || targetLanguage === "zh" ? "pinyin" : "none",
    );
    const reading = normalizeOptionalText(phrase.reading, 160) ??
      (readingType === "pinyin" ? pinyin : "");
    return {
      id: normalizeText(phrase.id, "id", 80),
      direction,
      japanese,
      chinese,
      pinyin,
      sourceLanguage,
      targetLanguage,
      sourceText,
      targetText,
      reading,
      readingType,
    };
  });
}

function normalizeDirection(value: unknown): PhraseDirection {
  return isSupportedDirection(value) ? value : "ja-to-zh";
}

function normalizeLanguage(value: unknown, fallback: LanguageCode): LanguageCode {
  return isLanguageCode(value) ? value : fallback;
}

function normalizeReadingType(value: unknown, fallback: ReadingType): ReadingType {
  return value === "pinyin" || value === "none" ? value : fallback;
}

function normalizeText(value: unknown, field: string, maxChars: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestValidationError(`${field} が空です`);
  }
  return value.trim().slice(0, maxChars);
}

function normalizeOptionalText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, maxChars);
}

function normalizeRouteError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof RequestValidationError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof UsageTrackingError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof PhrasePackRequestError) {
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
