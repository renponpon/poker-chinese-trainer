import type { GeneratedPhrasePackItem, Phrase, SrsItem } from "../../lib/types";
import {
  addPhraseToDrill,
  type DrillMembershipStorage,
} from "../practice/set-drill-membership";
import {
  saveTranslationAsSavedPhrase,
  type SaveTranslationStorage,
} from "./save-translation-as-saved-phrase";

export type GeneratedPhrasePackSelectionItem = GeneratedPhrasePackItem & {
  id: string;
};

export type SaveGeneratedPhrasePackSelectionStorage =
  & SaveTranslationStorage
  & DrillMembershipStorage;

export type SaveGeneratedPhrasePackSelectionInput = {
  items: GeneratedPhrasePackSelectionItem[];
  selectedIds: Iterable<string>;
  savedAt: string;
  storage: SaveGeneratedPhrasePackSelectionStorage;
  now?: number;
};

export type SaveGeneratedPhrasePackSelectionResult = {
  savedPhrases: Phrase[];
  phrases: Phrase[] | null;
  srsItems: SrsItem[] | null;
};

export function saveGeneratedPhrasePackSelection(
  input: SaveGeneratedPhrasePackSelectionInput,
): SaveGeneratedPhrasePackSelectionResult {
  const selectedIds = new Set(input.selectedIds);
  const selected = input.items.filter((item) => selectedIds.has(item.id));
  const savedPhrases: Phrase[] = [];
  let phrases: Phrase[] | null = null;
  let srsItems: SrsItem[] | null = null;

  for (const item of [...selected].reverse()) {
    const saved = saveTranslationAsSavedPhrase({
      translation: {
        id: item.id,
        japanese: item.japanese,
        chinese: item.targetText,
        pinyin: item.readingType === "pinyin" ? item.reading : "",
        sourceLanguage: item.sourceLanguage,
        targetLanguage: item.targetLanguage,
        sourceText: item.sourceText,
        targetText: item.targetText,
        reading: item.reading,
        readingType: item.readingType,
        explanation: "",
        direction: item.direction,
      },
      categoryId: item.categoryId,
      source: "prototype",
      savedAt: input.savedAt,
      storage: input.storage,
    });
    const drill = addPhraseToDrill({
      phrase: saved.storedPhrase,
      storage: input.storage,
      now: input.now,
    });
    savedPhrases.push(
      drill.phrases.find((phrase) => phrase.id === saved.storedPhrase.id) ??
        saved.storedPhrase,
    );
    phrases = drill.phrases;
    srsItems = drill.srsItems;
  }

  return {
    savedPhrases: savedPhrases.reverse(),
    phrases,
    srsItems,
  };
}
