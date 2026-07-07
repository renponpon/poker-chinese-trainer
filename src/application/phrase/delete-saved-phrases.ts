import { syncDrillSchedule } from "../practice/drill-schedule";
import type { Phrase, SrsItem } from "../../lib/types";

export type DeleteSavedPhrasesStorage = {
  loadPhrases: () => Phrase[];
  savePhrases: (phrases: Phrase[]) => void;
  loadSrsItems: () => SrsItem[];
  saveSrsItems: (items: SrsItem[]) => void;
};

export type DeleteSavedPhrasesInput = {
  phraseIds: string[];
  storage: DeleteSavedPhrasesStorage;
  now?: number;
};

export type DeleteSavedPhrasesResult = {
  phrases: Phrase[];
  srsItems: SrsItem[];
  deletedCount: number;
};

export function deleteSavedPhrases(
  input: DeleteSavedPhrasesInput,
): DeleteSavedPhrasesResult {
  const ids = new Set(input.phraseIds);
  const current = input.storage.loadPhrases();
  const phrases = current.filter((phrase) => !ids.has(phrase.id));

  input.storage.savePhrases(phrases);

  const synced = syncDrillSchedule({
    phrases,
    items: input.storage.loadSrsItems(),
    storage: { saveSrsItems: input.storage.saveSrsItems },
    now: input.now,
  });

  return {
    phrases,
    srsItems: synced.items,
    deletedCount: current.length - phrases.length,
  };
}
