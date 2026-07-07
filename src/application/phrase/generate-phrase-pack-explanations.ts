import {
  generatePackExplanations,
  type PackExplanationInput,
  type PackExplanationTextGenerator,
} from "../../lib/pack-explanation";
import { isLanguageCode, isSupportedDirection, parseDirection } from "../../lib/languages";
import type { LanguageCode, PhraseDirection, ReadingType } from "../../lib/types";

const MAX_PHRASES_PER_REQUEST = 10;

export class PhrasePackExplanationRequestError extends Error {
  status = 400;
  code = "validation_error";

  constructor(message: string) {
    super(message);
    this.name = "PhrasePackExplanationRequestError";
  }
}

export type RawPhrasePackExplanationRequest = {
  packRequestId?: unknown;
  phrases?: unknown;
};

export type NormalizedPhrasePackExplanationRequest = {
  packRequestId: string;
  phrases: PhrasePackExplanationPhrase[];
};

export type PhrasePackExplanationPhrase = PackExplanationInput & {
  id: string;
};

export type GeneratePhrasePackExplanationsInput = {
  phrases: PhrasePackExplanationPhrase[];
  generateText: PackExplanationTextGenerator;
};

export type PhrasePackExplanation = {
  id: string;
  explanation: string;
};

export function normalizePhrasePackExplanationRequest(
  value: unknown,
): NormalizedPhrasePackExplanationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PhrasePackExplanationRequestError("リクエスト形式が正しくありません");
  }

  const raw = value as RawPhrasePackExplanationRequest;
  return {
    packRequestId: normalizeText(raw.packRequestId, "packRequestId", 80),
    phrases: normalizePhrases(raw.phrases),
  };
}

export async function generatePhrasePackExplanationList(
  input: GeneratePhrasePackExplanationsInput,
): Promise<PhrasePackExplanation[]> {
  const explanations = await generatePackExplanations(input.generateText, input.phrases);
  return input.phrases.map((phrase, index) => ({
    id: phrase.id,
    explanation: explanations[index] ?? "",
  }));
}

function normalizePhrases(value: unknown): PhrasePackExplanationPhrase[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PHRASES_PER_REQUEST) {
    throw new PhrasePackExplanationRequestError(
      "解説を作るフレーズ数が正しくありません",
    );
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new PhrasePackExplanationRequestError(
        `フレーズ${index + 1}の形式が正しくありません`,
      );
    }
    const phrase = item as Record<string, unknown>;
    const direction = normalizeDirection(phrase.direction);
    const parsedDirection = parseDirection(direction);
    const sourceLanguage = normalizeLanguage(phrase.sourceLanguage, parsedDirection.sourceLanguage);
    const targetLanguage = normalizeLanguage(phrase.targetLanguage, parsedDirection.targetLanguage);
    const japanese = normalizeText(phrase.japanese, "japanese", 120);
    const chinese = normalizeText(phrase.chinese, "chinese", 160);
    const pinyin = normalizeOptionalText(phrase.pinyin, 120) ?? "";
    const sourceText =
      normalizeOptionalText(phrase.sourceText, 160) ??
      (sourceLanguage === "ja" ? japanese : chinese);
    const targetText =
      normalizeOptionalText(phrase.targetText, 160) ??
      (targetLanguage === "ja" ? japanese : chinese);
    const readingType = normalizeReadingType(
      phrase.readingType,
      sourceLanguage === "zh" || targetLanguage === "zh" ? "pinyin" : "none",
    );
    const reading =
      normalizeOptionalText(phrase.reading, 160) ?? (readingType === "pinyin" ? pinyin : "");
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
    throw new PhrasePackExplanationRequestError(`${field} が空です`);
  }
  return value.trim().slice(0, maxChars);
}

function normalizeOptionalText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, maxChars);
}
