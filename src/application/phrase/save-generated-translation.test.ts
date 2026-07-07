import assert from "node:assert/strict";
import test from "node:test";
import type { TranslationHistoryItem, TranslationResult } from "../../domain/phrase/phrase";
import type { Phrase, SrsItem } from "../../lib/types";
import {
  saveGeneratedTranslation,
  type SaveGeneratedTranslationStorage,
} from "./save-generated-translation";

const SAVED_AT = "2026-01-01T12:00:00.000Z";
const NOW = Date.parse(SAVED_AT);

test("saving a generated translation records history and keeps the saved phrase out of drill by default", () => {
  const storage = createMemoryStorage();

  const result = saveGeneratedTranslation({
    translation: makeTranslationResult(),
    historyItemId: "history-1",
    historySource: "add",
    savedPhraseSource: "manual",
    categoryId: "other",
    savedAt: SAVED_AT,
    storage,
    now: NOW,
  });

  assert.equal(result.historyItem.savedPhraseId, null);
  assert.equal(result.linkedHistoryItem?.savedPhraseId, "translation-1");
  assert.equal(result.storedPhrase.shouldDrill, false);
  assert.equal(storage.phrases[0]?.shouldDrill, false);
  assert.equal(storage.srsItems.length, 0);
});

test("adding a generated translation to drill updates membership after library save", () => {
  const storage = createMemoryStorage();

  const result = saveGeneratedTranslation({
    translation: makeTranslationResult(),
    historyItemId: "history-1",
    historySource: "add",
    savedPhraseSource: "manual",
    categoryId: "other",
    savedAt: SAVED_AT,
    storage,
    addToDrill: true,
    now: NOW,
  });

  assert.equal(storage.addedPhraseShouldDrillValues[0], false);
  assert.equal(result.storedPhrase.shouldDrill, true);
  assert.equal(storage.phrases[0]?.shouldDrill, true);
  assert.equal(result.srsItems?.[0]?.id, "translation-1");
  assert.equal(result.srsItems?.[0]?.nextReviewAt, NOW);
});

function createMemoryStorage(): SaveGeneratedTranslationStorage & {
  phrases: Phrase[];
  historyItems: TranslationHistoryItem[];
  srsItems: SrsItem[];
  addedPhraseShouldDrillValues: boolean[];
} {
  return {
    phrases: [],
    historyItems: [],
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
    addHistoryItem(item) {
      this.historyItems = [item, ...this.historyItems];
      return item;
    },
    loadHistoryItems() {
      return this.historyItems;
    },
    updateHistoryItem(historyItemId, updates) {
      this.historyItems = this.historyItems.map((item) =>
        item.id === historyItemId ? { ...item, ...updates } : item,
      );
      return this.historyItems;
    },
    loadSrsItems() {
      return this.srsItems;
    },
    saveSrsItems(items) {
      this.srsItems = items;
    },
  };
}

function makeTranslationResult(): TranslationResult {
  return {
    id: "translation-1",
    direction: "ja-to-zh",
    japanese: "where to pay",
    chinese: "zai nali fukuan",
    pinyin: "zai nali fukuan",
    sourceLanguage: "ja",
    targetLanguage: "zh",
    sourceText: "where to pay",
    targetText: "zai nali fukuan",
    reading: "zai nali fukuan",
    readingType: "pinyin",
    explanation: "",
  };
}
