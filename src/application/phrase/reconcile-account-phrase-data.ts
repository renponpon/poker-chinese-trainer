import type { Phrase, SrsItem } from "../../lib/types";
import type { SavedPhraseSnapshot } from "./load-saved-phrases";

export type PhraseMutation =
  | { kind: "delete"; id: string }
  | { kind: "save"; phrase: Phrase; srsItem: SrsItem | null; existingOnly: boolean };

export function reconcileAccountPhraseData(
  baseline: SavedPhraseSnapshot,
  local: SavedPhraseSnapshot,
  cloud: SavedPhraseSnapshot,
) {
  const basePhrases = new Map(baseline.phrases.map((phrase) => [phrase.id, phrase]));
  const localPhrases = new Map(local.phrases.map((phrase) => [phrase.id, phrase]));
  const cloudPhrases = new Map(cloud.phrases.map((phrase) => [phrase.id, phrase]));
  const baseItems = new Map(baseline.srsItems.map((item) => [item.id, item]));
  const localItems = new Map(local.srsItems.map((item) => [item.id, item]));
  const cloudItems = new Map(cloud.srsItems.map((item) => [item.id, item]));
  const resultPhrases = new Map(cloudPhrases);
  const resultItems = new Map(cloudItems);
  const mutations: PhraseMutation[] = [];
  const conflicts: string[] = [];

  for (const id of new Set([...basePhrases.keys(), ...localPhrases.keys()])) {
    const basePhrase = basePhrases.get(id);
    const localPhrase = localPhrases.get(id);
    const cloudPhrase = cloudPhrases.get(id);
    if (!localPhrase) {
      resultPhrases.delete(id);
      resultItems.delete(id);
      if (cloudPhrase) mutations.push({ kind: "delete", id });
      continue;
    }
    const baseItem = baseItems.get(id);
    const localItem = localItems.get(id);
    if (equal(basePhrase, localPhrase) && equal(baseItem, localItem)) continue;
    if (basePhrase && !cloudPhrase) {
      conflicts.push(id);
      resultPhrases.set(id, localPhrase);
      if (localItem) resultItems.set(id, localItem);
      continue;
    }
    const updates = Object.fromEntries(
      Object.entries(localPhrase).filter(([key, value]) =>
        !basePhrase || !equal(value, basePhrase[key as keyof Phrase]),
      ),
    );
    const phrase = { ...(cloudPhrase ?? localPhrase), ...updates } as Phrase;
    const cloudItem = cloudItems.get(id);
    const locallyReviewed = !equal(baseItem, localItem);
    const item = phrase.shouldDrill
      ? locallyReviewed && (localItem?.lastReviewedAt ?? -1) >= (cloudItem?.lastReviewedAt ?? -1)
        ? localItem ?? cloudItem ?? null
        : cloudItem ?? localItem ?? null
      : null;
    resultPhrases.set(id, phrase);
    if (item) resultItems.set(id, item);
    else resultItems.delete(id);
    if (!equal(phrase, cloudPhrase) || !equal(item ?? undefined, cloudItem)) {
      mutations.push({ kind: "save", phrase, srsItem: item, existingOnly: Boolean(basePhrase || cloudPhrase) });
    }
  }
  const snapshot: SavedPhraseSnapshot = {
    phrases: [...resultPhrases.values()],
    srsItems: [...resultItems.values()].filter((item) => resultPhrases.get(item.id)?.shouldDrill),
  };
  return { snapshot, mutations, conflicts };
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
