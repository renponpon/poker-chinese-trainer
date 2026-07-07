import { isLanguageCode, isSupportedDirection, parseDirection } from "../../lib/languages";
import type { LanguageCode, Phrase, PhraseDirection, PhraseSource, ReadingType } from "../../lib/types";

const MAX_PHRASES_PER_REQUEST = 10;

export class PersistSavedPhrasesRequestError extends Error {
  status = 400;
  code = "validation_error";

  constructor(message: string) {
    super(message);
    this.name = "PersistSavedPhrasesRequestError";
  }
}

export type RawPersistSavedPhrasesRequest = {
  ownerKey?: unknown;
  nickname?: unknown;
  phrases?: unknown;
};

export type NormalizedPersistSavedPhrasesRequest = {
  ownerKey: string;
  nickname: string;
  phrases: Phrase[];
};

export type PersistSavedPhraseStorage = {
  savePhrase: (phrase: Phrase) => Promise<void>;
};

export type PersistSavedPhrasesInput = {
  phrases: Phrase[];
  storage: PersistSavedPhraseStorage;
  onError?: (error: unknown, phrase: Phrase) => void;
};

export type PersistSavedPhrasesResult = {
  attempted: number;
  succeeded: number;
  failedPhraseIds: string[];
};

export function normalizePersistSavedPhrasesRequest(
  value: unknown,
): NormalizedPersistSavedPhrasesRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PersistSavedPhrasesRequestError("Request body must be an object.");
  }

  const raw = value as RawPersistSavedPhrasesRequest;
  return {
    ownerKey: normalizeOptionalText(raw.ownerKey, 80) ?? "",
    nickname: normalizeOptionalText(raw.nickname, 80) ?? "",
    phrases: normalizePhrases(raw.phrases),
  };
}

export async function persistSavedPhrases(
  input: PersistSavedPhrasesInput,
): Promise<PersistSavedPhrasesResult> {
  const failedPhraseIds: string[] = [];
  let succeeded = 0;

  for (const phrase of input.phrases) {
    try {
      await input.storage.savePhrase(phrase);
      succeeded += 1;
    } catch (error) {
      failedPhraseIds.push(phrase.id);
      input.onError?.(error, phrase);
    }
  }

  return {
    attempted: input.phrases.length,
    succeeded,
    failedPhraseIds,
  };
}

function normalizePhrases(value: unknown): Phrase[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_PHRASES_PER_REQUEST
  ) {
    throw new PersistSavedPhrasesRequestError("Saved phrase count is invalid.");
  }

  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new PersistSavedPhrasesRequestError("Saved phrase shape is invalid.");
    }
    const phrase = item as Partial<Phrase>;
    const direction = normalizeDirection(phrase.direction);
    const { sourceLanguage, targetLanguage } = parseDirection(direction);
    const japanese = normalizeOptionalText(phrase.japanese, 500) ?? "";
    const chinese = normalizeOptionalText(phrase.chinese, 500) ?? "";
    const pinyin = normalizeOptionalText(phrase.pinyin, 500) ?? "";

    return {
      id: normalizeText(phrase.id, "id", 80),
      japanese,
      chinese,
      pinyin,
      sourceLanguage: normalizeLanguage(phrase.sourceLanguage, sourceLanguage),
      targetLanguage: normalizeLanguage(phrase.targetLanguage, targetLanguage),
      sourceText:
        normalizeOptionalText(phrase.sourceText, 500) ??
        (sourceLanguage === "ja" ? japanese : chinese),
      targetText:
        normalizeOptionalText(phrase.targetText, 500) ??
        (targetLanguage === "ja" ? japanese : chinese),
      reading: normalizeOptionalText(phrase.reading, 500) ?? pinyin,
      readingType: normalizeReadingType(
        phrase.readingType,
        sourceLanguage === "zh" || targetLanguage === "zh" ? "pinyin" : "none",
      ),
      explanation: normalizeText(phrase.explanation, "explanation", 5000),
      audioUrl: null,
      createdAt: normalizeText(phrase.createdAt, "createdAt", 80),
      direction,
      categoryId: normalizeOptionalText(phrase.categoryId, 64) ?? null,
      shouldDrill: phrase.shouldDrill !== false,
      source: normalizeSource(phrase.source),
      usedAt: normalizeOptionalText(phrase.usedAt, 80) ?? null,
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

function normalizeSource(value: unknown): PhraseSource {
  if (value === "conversation" || value === "manual" || value === "prototype") {
    return value;
  }
  return "prototype";
}

function normalizeText(value: unknown, field: string, maxChars: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new PersistSavedPhrasesRequestError(`${field} is empty.`);
  }
  return value.trim().slice(0, maxChars);
}

function normalizeOptionalText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, maxChars) : undefined;
}
