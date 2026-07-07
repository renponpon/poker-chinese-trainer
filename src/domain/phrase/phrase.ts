export type PhraseLanguageCode =
  | "ja"
  | "zh"
  | "en"
  | "ko"
  | "es"
  | "fr"
  | "de"
  | "th"
  | "vi";

export type PhraseDirection = `${PhraseLanguageCode}-to-${PhraseLanguageCode}`;

export type PhraseReadingType = "pinyin" | "none";

export type SavedPhraseSource = "manual" | "conversation" | "prototype";

export type TranslationHistorySource = "add" | "conversation";

export type TranslationResult = {
  id: string;
  direction: PhraseDirection;
  japanese: string;
  chinese: string;
  pinyin: string;
  sourceLanguage: PhraseLanguageCode;
  targetLanguage: PhraseLanguageCode;
  sourceText: string;
  targetText: string;
  reading: string;
  readingType: PhraseReadingType;
  explanation: string;
};

export type TranslationHistoryItem = {
  id: string;
  translation: TranslationResult;
  source: TranslationHistorySource;
  createdAt: string;
  savedPhraseId: string | null;
};

export type SavedPhrase = TranslationResult & {
  categoryId: string | null;
  source: SavedPhraseSource;
  savedAt: string;
  usedAt: string | null;
  audioUrl: string | null;
};

export function createTranslationHistoryItem(input: {
  id: string;
  translation: TranslationResult;
  source: TranslationHistorySource;
  createdAt: string;
}): TranslationHistoryItem {
  return {
    id: input.id,
    translation: input.translation,
    source: input.source,
    createdAt: input.createdAt,
    savedPhraseId: null,
  };
}

export function saveTranslationAsPhrase(input: {
  translation: TranslationResult;
  categoryId: string | null;
  source: SavedPhraseSource;
  savedAt: string;
  usedAt?: string | null;
  audioUrl?: string | null;
}): SavedPhrase {
  return {
    ...input.translation,
    categoryId: input.categoryId,
    source: input.source,
    savedAt: input.savedAt,
    usedAt: input.usedAt ?? null,
    audioUrl: input.audioUrl ?? null,
  };
}

export function markTranslationHistorySaved(
  item: TranslationHistoryItem,
  savedPhrase: Pick<SavedPhrase, "id">,
): TranslationHistoryItem {
  return {
    ...item,
    savedPhraseId: savedPhrase.id,
  };
}

export function isTranslationHistorySaved(item: TranslationHistoryItem): boolean {
  return item.savedPhraseId !== null;
}
