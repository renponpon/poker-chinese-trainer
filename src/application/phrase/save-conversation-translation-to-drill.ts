import type {
  SavedPhrase,
  TranslationHistoryItem,
  TranslationResult,
} from "../../domain/phrase/phrase";
import type { Phrase, SrsItem } from "../../lib/types";
import {
  addPhraseToDrill,
  type DrillMembershipStorage,
} from "../practice/set-drill-membership";
import {
  linkTranslationHistoryToSavedPhrase,
  type TranslationHistoryLinkStorage,
} from "./record-translation-history";
import {
  saveTranslationAsSavedPhrase,
  type SaveTranslationStorage,
} from "./save-translation-as-saved-phrase";

export type ConversationTranslationDrillStorage =
  & SaveTranslationStorage
  & TranslationHistoryLinkStorage
  & DrillMembershipStorage
  & {
    loadPhrases: () => Phrase[];
    updatePhrase: (phraseId: string, updates: Partial<Phrase>) => Phrase[];
  };

export type SaveConversationTranslationToDrillInput = {
  translation: TranslationResult;
  historyItemId?: string | null;
  savedAt: string;
  storage: ConversationTranslationDrillStorage;
  now?: number;
};

export type SaveConversationTranslationToDrillResult = {
  savedPhrase: SavedPhrase | null;
  linkedHistoryItem: TranslationHistoryItem | null;
  storedPhrase: Phrase;
  phrases: Phrase[];
  srsItems: SrsItem[];
};

export function saveConversationTranslationToDrill(
  input: SaveConversationTranslationToDrillInput,
): SaveConversationTranslationToDrillResult {
  const existing = input.storage
    .loadPhrases()
    .find((phrase) => phrase.id === input.translation.id);

  if (existing) {
    const phrases = input.storage.updatePhrase(
      existing.id,
      translationToPhraseUpdates(input.translation),
    );
    const updatedPhrase =
      phrases.find((phrase) => phrase.id === existing.id) ?? existing;
    const linkedHistoryItem = linkHistory(input, { id: updatedPhrase.id });
    const drill = addPhraseToDrill({
      phrase: updatedPhrase,
      storage: input.storage,
      now: input.now,
    });

    return {
      savedPhrase: null,
      linkedHistoryItem,
      storedPhrase:
        drill.phrases.find((phrase) => phrase.id === updatedPhrase.id) ??
        updatedPhrase,
      phrases: drill.phrases,
      srsItems: drill.srsItems,
    };
  }

  const saved = saveTranslationAsSavedPhrase({
    translation: input.translation,
    categoryId: null,
    source: "conversation",
    savedAt: input.savedAt,
    usedAt: input.savedAt,
    storage: input.storage,
  });
  const linkedHistoryItem = linkHistory(input, saved.savedPhrase);
  const drill = addPhraseToDrill({
    phrase: saved.storedPhrase,
    storage: input.storage,
    now: input.now,
  });

  return {
    savedPhrase: saved.savedPhrase,
    linkedHistoryItem,
    storedPhrase:
      drill.phrases.find((phrase) => phrase.id === saved.storedPhrase.id) ??
      saved.storedPhrase,
    phrases: drill.phrases,
    srsItems: drill.srsItems,
  };
}

function translationToPhraseUpdates(
  translation: TranslationResult,
): Partial<Phrase> {
  return {
    direction: translation.direction,
    japanese: translation.japanese,
    chinese: translation.chinese,
    sourceLanguage: translation.sourceLanguage,
    targetLanguage: translation.targetLanguage,
    sourceText: translation.sourceText,
    targetText: translation.targetText,
    readingType: translation.readingType,
    pinyin: translation.pinyin,
    reading: translation.reading,
    explanation: translation.explanation,
  };
}

function linkHistory(
  input: SaveConversationTranslationToDrillInput,
  savedPhrase: Pick<SavedPhrase, "id">,
): TranslationHistoryItem | null {
  if (!input.historyItemId) return null;
  return linkTranslationHistoryToSavedPhrase({
    historyItemId: input.historyItemId,
    savedPhrase,
    storage: input.storage,
  });
}
