import type {
  SavedPhrase,
  SavedPhraseSource,
  TranslationHistoryItem,
  TranslationHistorySource,
  TranslationResult,
} from "../../domain/phrase/phrase";
import type { Phrase, SrsItem } from "../../lib/types";
import {
  linkTranslationHistoryToSavedPhrase,
  recordTranslationHistory,
  type TranslationHistoryLinkStorage,
  type TranslationHistoryStorage,
} from "./record-translation-history";
import {
  saveTranslationAsSavedPhrase,
  type SaveTranslationStorage,
} from "./save-translation-as-saved-phrase";
import {
  addPhraseToDrill,
  type DrillMembershipStorage,
} from "../practice/set-drill-membership";

export type SaveGeneratedTranslationStorage =
  & SaveTranslationStorage
  & TranslationHistoryStorage
  & TranslationHistoryLinkStorage
  & DrillMembershipStorage;

export type SaveGeneratedTranslationInput = {
  translation: TranslationResult;
  historyItemId: string;
  historySource: TranslationHistorySource;
  savedPhraseSource: SavedPhraseSource;
  categoryId: string | null;
  savedAt: string;
  storage: SaveGeneratedTranslationStorage;
  addToDrill?: boolean;
  usedAt?: string | null;
  audioUrl?: string | null;
  now?: number;
};

export type SaveGeneratedTranslationResult = {
  historyItem: TranslationHistoryItem;
  linkedHistoryItem: TranslationHistoryItem | null;
  savedPhrase: SavedPhrase;
  storedPhrase: Phrase;
  phrases: Phrase[] | null;
  srsItems: SrsItem[] | null;
};

export function saveGeneratedTranslation(
  input: SaveGeneratedTranslationInput,
): SaveGeneratedTranslationResult {
  const historyItem = recordTranslationHistory({
    historyItemId: input.historyItemId,
    translation: input.translation,
    source: input.historySource,
    translatedAt: input.savedAt,
    storage: input.storage,
  });

  const saved = saveTranslationAsSavedPhrase({
    translation: input.translation,
    categoryId: input.categoryId,
    source: input.savedPhraseSource,
    savedAt: input.savedAt,
    usedAt: input.usedAt,
    audioUrl: input.audioUrl,
    storage: input.storage,
  });

  const linkedHistoryItem = linkTranslationHistoryToSavedPhrase({
    historyItemId: historyItem.id,
    savedPhrase: saved.savedPhrase,
    storage: input.storage,
  });

  if (!input.addToDrill) {
    return {
      historyItem,
      linkedHistoryItem,
      savedPhrase: saved.savedPhrase,
      storedPhrase: saved.storedPhrase,
      phrases: null,
      srsItems: null,
    };
  }

  const drill = addPhraseToDrill({
    phrase: saved.storedPhrase,
    storage: input.storage,
    now: input.now,
  });
  const storedPhrase =
    drill.phrases.find((phrase) => phrase.id === saved.storedPhrase.id) ??
    saved.storedPhrase;

  return {
    historyItem,
    linkedHistoryItem,
    savedPhrase: saved.savedPhrase,
    storedPhrase,
    phrases: drill.phrases,
    srsItems: drill.srsItems,
  };
}
