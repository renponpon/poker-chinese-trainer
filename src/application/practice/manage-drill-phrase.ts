import { deleteSavedPhrases, type DeleteSavedPhrasesStorage } from "../phrase/delete-saved-phrases";
import { setPhraseDrillMembership } from "./set-drill-membership";
import type { Phrase } from "../../lib/types";

export type DrillPhraseAction = "toggle-priority" | "pause" | "resume" | "delete";
export type ManageDrillPhraseStorage = DeleteSavedPhrasesStorage & {
  updatePhrase: (id: string, updates: Partial<Phrase>) => Phrase[];
};

export function manageDrillPhrase(input: {
  phraseId: string;
  action: DrillPhraseAction;
  storage: ManageDrillPhraseStorage;
  now?: number;
}) {
  const phrase = input.storage.loadPhrases().find((entry) => entry.id === input.phraseId);
  if (!phrase) throw new Error("フレーズが見つかりません。保存内容を再読み込みしてください。");
  const items = input.storage.loadSrsItems();
  if (input.action === "delete") {
    return deleteSavedPhrases({ phraseIds: [phrase.id], storage: input.storage, now: input.now });
  }
  if (input.action === "toggle-priority") {
    const phrases = input.storage.updatePhrase(phrase.id, { drillPriority: !phrase.drillPriority });
    return { phrases, srsItems: items };
  }
  return setPhraseDrillMembership({
    phrase,
    enabled: input.action === "resume",
    storage: input.storage,
    now: input.now,
  });
}
