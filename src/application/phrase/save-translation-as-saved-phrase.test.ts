import assert from "node:assert/strict";
import test from "node:test";
import {
  saveTranslationAsSavedPhrase,
  type SaveTranslationStorage,
} from "./save-translation-as-saved-phrase";
import type { TranslationResult } from "../../domain/phrase/phrase";
import type { Phrase } from "../../lib/types";

const SAVED_AT = "2026-01-01T12:00:00.000Z";

test("saving a translation stores a legacy phrase with drill disabled by default", () => {
  const storage = createMemoryStorage();

  const result = saveTranslationAsSavedPhrase({
    translation: makeTranslationResult(),
    categoryId: null,
    source: "manual",
    savedAt: SAVED_AT,
    storage,
  });

  assert.equal(result.savedPhrase.id, "translation-1");
  assert.equal(result.storedPhrase.shouldDrill, false);
  assert.equal(storage.phrases.length, 1);
});

test("saving can explicitly opt into drill during the legacy transition", () => {
  const storage = createMemoryStorage();

  const result = saveTranslationAsSavedPhrase({
    translation: makeTranslationResult(),
    categoryId: "restaurant",
    source: "conversation",
    savedAt: SAVED_AT,
    storage,
    shouldDrill: true,
    usedAt: SAVED_AT,
  });

  assert.equal(result.storedPhrase.shouldDrill, true);
  assert.equal(result.storedPhrase.categoryId, "restaurant");
  assert.equal(result.storedPhrase.source, "conversation");
  assert.equal(result.storedPhrase.usedAt, SAVED_AT);
});

function createMemoryStorage(): SaveTranslationStorage & { phrases: Phrase[] } {
  return {
    phrases: [],
    addPhrase(input) {
      const phrase: Phrase = {
        ...input,
        createdAt: input.createdAt ?? SAVED_AT,
      };
      this.phrases = [phrase, ...this.phrases];
      return phrase;
    },
  };
}

function makeTranslationResult(): TranslationResult {
  return {
    id: "translation-1",
    direction: "ja-to-zh",
    japanese: "支払いはどこですか？",
    chinese: "在哪里付款？",
    pinyin: "zai nali fukuan",
    sourceLanguage: "ja",
    targetLanguage: "zh",
    sourceText: "支払いはどこですか？",
    targetText: "在哪里付款？",
    reading: "zai nali fukuan",
    readingType: "pinyin",
    explanation: "",
  };
}
