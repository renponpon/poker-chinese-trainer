import assert from "node:assert/strict";
import test from "node:test";
import {
  createTranslationHistoryItem,
  isTranslationHistorySaved,
  markTranslationHistorySaved,
  saveTranslationAsPhrase,
  type TranslationResult,
} from "./phrase";

const TRANSLATED_AT = "2026-01-01T12:00:00.000Z";

test("a translation history item is not saved by default", () => {
  const history = createTranslationHistoryItem({
    id: "history-1",
    translation: makeTranslationResult(),
    source: "conversation",
    createdAt: TRANSLATED_AT,
  });

  assert.equal(history.savedPhraseId, null);
  assert.equal(isTranslationHistorySaved(history), false);
});

test("saving a translation creates a saved phrase explicitly", () => {
  const savedPhrase = saveTranslationAsPhrase({
    translation: makeTranslationResult(),
    categoryId: "restaurant",
    source: "manual",
    savedAt: TRANSLATED_AT,
  });

  assert.equal(savedPhrase.id, "translation-1");
  assert.equal(savedPhrase.categoryId, "restaurant");
  assert.equal(savedPhrase.source, "manual");
  assert.equal(savedPhrase.savedAt, TRANSLATED_AT);
});

test("a history item can be linked to the saved phrase after explicit save", () => {
  const history = createTranslationHistoryItem({
    id: "history-1",
    translation: makeTranslationResult(),
    source: "conversation",
    createdAt: TRANSLATED_AT,
  });
  const savedPhrase = saveTranslationAsPhrase({
    translation: history.translation,
    categoryId: null,
    source: "conversation",
    savedAt: TRANSLATED_AT,
  });

  const linked = markTranslationHistorySaved(history, savedPhrase);

  assert.equal(linked.savedPhraseId, savedPhrase.id);
  assert.equal(isTranslationHistorySaved(linked), true);
});

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
