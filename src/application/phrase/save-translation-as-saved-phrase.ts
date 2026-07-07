import {
  saveTranslationAsPhrase,
  type SavedPhrase,
  type TranslationResult,
} from "../../domain/phrase/phrase";
import type { Phrase } from "../../lib/types";

export type SaveTranslationStorage = {
  addPhrase: (
    input: Omit<Phrase, "createdAt"> & { createdAt?: string },
  ) => Phrase;
};

export type SaveTranslationInput = {
  translation: TranslationResult;
  categoryId: string | null;
  source: SavedPhrase["source"];
  savedAt: string;
  storage: SaveTranslationStorage;
  shouldDrill?: boolean;
  usedAt?: string | null;
  audioUrl?: string | null;
};

export type SaveTranslationResult = {
  savedPhrase: SavedPhrase;
  storedPhrase: Phrase;
};

export function saveTranslationAsSavedPhrase(
  input: SaveTranslationInput,
): SaveTranslationResult {
  const savedPhrase = saveTranslationAsPhrase({
    translation: input.translation,
    categoryId: input.categoryId,
    source: input.source,
    savedAt: input.savedAt,
    usedAt: input.usedAt,
    audioUrl: input.audioUrl,
  });
  const storedPhrase = input.storage.addPhrase(
    savedPhraseToLegacyPhrase(savedPhrase, {
      shouldDrill: input.shouldDrill ?? false,
    }),
  );

  return { savedPhrase, storedPhrase };
}

export function savedPhraseToLegacyPhrase(
  savedPhrase: SavedPhrase,
  input: { shouldDrill: boolean },
): Omit<Phrase, "createdAt"> & { createdAt?: string } {
  return {
    id: savedPhrase.id,
    japanese: savedPhrase.japanese,
    chinese: savedPhrase.chinese,
    pinyin: savedPhrase.pinyin,
    sourceLanguage: savedPhrase.sourceLanguage,
    targetLanguage: savedPhrase.targetLanguage,
    sourceText: savedPhrase.sourceText,
    targetText: savedPhrase.targetText,
    reading: savedPhrase.reading,
    readingType: savedPhrase.readingType,
    explanation: savedPhrase.explanation,
    audioUrl: savedPhrase.audioUrl,
    createdAt: savedPhrase.savedAt,
    direction: savedPhrase.direction,
    categoryId: savedPhrase.categoryId,
    shouldDrill: input.shouldDrill,
    source: savedPhrase.source,
    usedAt: savedPhrase.usedAt,
  };
}
