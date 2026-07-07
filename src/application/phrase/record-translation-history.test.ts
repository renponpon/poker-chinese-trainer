import assert from "node:assert/strict";
import test from "node:test";
import {
  linkTranslationHistoryToSavedPhrase,
  recordTranslationHistory,
} from "./record-translation-history";
import type { TranslationHistoryItem } from "../../domain/phrase/phrase";

test("recording translation history does not save it as a saved phrase", () => {
  const items: TranslationHistoryItem[] = [];

  const history = recordTranslationHistory({
    historyItemId: "history-1",
    translation: makeTranslation("translation-1"),
    source: "add",
    translatedAt: "2026-01-01T00:00:00.000Z",
    storage: {
      addHistoryItem: (item) => {
        items.unshift(item);
        return item;
      },
    },
  });

  assert.equal(history.savedPhraseId, null);
  assert.equal(items[0], history);
});

test("linking translation history records the saved phrase id", () => {
  let items: TranslationHistoryItem[] = [
    {
      id: "history-1",
      translation: makeTranslation("translation-1"),
      source: "conversation",
      createdAt: "2026-01-01T00:00:00.000Z",
      savedPhraseId: null,
    },
  ];

  const linked = linkTranslationHistoryToSavedPhrase({
    historyItemId: "history-1",
    savedPhrase: { id: "saved-1" },
    storage: {
      loadHistoryItems: () => items,
      updateHistoryItem: (id, updates) => {
        items = items.map((item) =>
          item.id === id ? { ...item, ...updates } : item,
        );
        return items;
      },
    },
  });

  assert.equal(linked?.savedPhraseId, "saved-1");
  assert.equal(items[0]?.savedPhraseId, "saved-1");
});

function makeTranslation(id: string) {
  return {
    id,
    direction: "ja-to-zh" as const,
    japanese: "こんにちは",
    chinese: "你好",
    pinyin: "ni hao",
    sourceLanguage: "ja" as const,
    targetLanguage: "zh" as const,
    sourceText: "こんにちは",
    targetText: "你好",
    reading: "ni hao",
    readingType: "pinyin" as const,
    explanation: "",
  };
}
