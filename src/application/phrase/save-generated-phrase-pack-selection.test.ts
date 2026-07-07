import assert from "node:assert/strict";
import test from "node:test";
import type { GeneratedPhrasePackItem, Phrase, SrsItem } from "../../lib/types";
import {
  saveGeneratedPhrasePackSelection,
  type SaveGeneratedPhrasePackSelectionStorage,
} from "./save-generated-phrase-pack-selection";

const SAVED_AT = "2026-01-01T12:00:00.000Z";
const NOW = Date.parse(SAVED_AT);

test("saving a generated phrase pack selection stores phrases before adding them to drill", () => {
  const storage = createMemoryStorage();

  const result = saveGeneratedPhrasePackSelection({
    items: [
      makePackItem({ id: "pack-1", targetText: "alpha" }),
      makePackItem({ id: "pack-2", targetText: "beta" }),
    ],
    selectedIds: ["pack-1", "pack-2"],
    savedAt: SAVED_AT,
    storage,
    now: NOW,
  });

  assert.deepEqual(
    storage.addedPhraseShouldDrillValues,
    [false, false],
  );
  assert.deepEqual(
    result.savedPhrases.map((phrase) => phrase.id),
    ["pack-1", "pack-2"],
  );
  assert.deepEqual(
    storage.phrases.map((phrase) => [phrase.id, phrase.shouldDrill]),
    [
      ["pack-1", true],
      ["pack-2", true],
    ],
  );
  assert.deepEqual(
    result.srsItems?.map((item) => item.id),
    ["pack-1", "pack-2"],
  );
});

test("saving an empty generated phrase pack selection is a no-op", () => {
  const storage = createMemoryStorage();

  const result = saveGeneratedPhrasePackSelection({
    items: [makePackItem({ id: "pack-1", targetText: "alpha" })],
    selectedIds: [],
    savedAt: SAVED_AT,
    storage,
  });

  assert.deepEqual(result.savedPhrases, []);
  assert.equal(result.phrases, null);
  assert.equal(result.srsItems, null);
  assert.equal(storage.phrases.length, 0);
});

function createMemoryStorage(): SaveGeneratedPhrasePackSelectionStorage & {
  phrases: Phrase[];
  srsItems: SrsItem[];
  addedPhraseShouldDrillValues: boolean[];
} {
  return {
    phrases: [],
    srsItems: [],
    addedPhraseShouldDrillValues: [],
    addPhrase(input) {
      const phrase: Phrase = {
        ...input,
        createdAt: input.createdAt ?? SAVED_AT,
      };
      this.addedPhraseShouldDrillValues.push(phrase.shouldDrill);
      this.phrases = [phrase, ...this.phrases];
      return phrase;
    },
    updatePhrase(phraseId, updates) {
      this.phrases = this.phrases.map((phrase) =>
        phrase.id === phraseId ? { ...phrase, ...updates } : phrase,
      );
      return this.phrases;
    },
    loadSrsItems() {
      return this.srsItems;
    },
    saveSrsItems(items) {
      this.srsItems = items;
    },
  };
}

function makePackItem(input: {
  id: string;
  targetText: string;
}): GeneratedPhrasePackItem & { id: string } {
  return {
    id: input.id,
    direction: "ja-to-zh",
    japanese: input.targetText,
    chinese: input.targetText,
    pinyin: input.targetText,
    sourceLanguage: "ja",
    targetLanguage: "zh",
    sourceText: input.targetText,
    targetText: input.targetText,
    reading: input.targetText,
    readingType: "pinyin",
    explanation: "",
    categoryId: "other",
  };
}
