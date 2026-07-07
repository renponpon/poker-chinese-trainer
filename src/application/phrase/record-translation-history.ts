import {
  createTranslationHistoryItem,
  markTranslationHistorySaved,
  type SavedPhrase,
  type TranslationHistoryItem,
  type TranslationHistorySource,
  type TranslationResult,
} from "../../domain/phrase/phrase";

export type TranslationHistoryStorage = {
  addHistoryItem: (item: TranslationHistoryItem) => TranslationHistoryItem;
};

export type TranslationHistoryLinkStorage = {
  loadHistoryItems: () => TranslationHistoryItem[];
  updateHistoryItem: (
    historyItemId: string,
    updates: Pick<TranslationHistoryItem, "savedPhraseId">,
  ) => TranslationHistoryItem[];
};

export function recordTranslationHistory(input: {
  historyItemId: string;
  translation: TranslationResult;
  source: TranslationHistorySource;
  translatedAt: string;
  storage: TranslationHistoryStorage;
}): TranslationHistoryItem {
  return input.storage.addHistoryItem(
    createTranslationHistoryItem({
      id: input.historyItemId,
      translation: input.translation,
      source: input.source,
      createdAt: input.translatedAt,
    }),
  );
}

export function linkTranslationHistoryToSavedPhrase(input: {
  historyItemId: string;
  savedPhrase: Pick<SavedPhrase, "id">;
  storage: TranslationHistoryLinkStorage;
}): TranslationHistoryItem | null {
  const historyItem = input.storage
    .loadHistoryItems()
    .find((item) => item.id === input.historyItemId);
  if (!historyItem) return null;

  const linked = markTranslationHistorySaved(historyItem, input.savedPhrase);
  input.storage.updateHistoryItem(linked.id, {
    savedPhraseId: linked.savedPhraseId,
  });

  return linked;
}
