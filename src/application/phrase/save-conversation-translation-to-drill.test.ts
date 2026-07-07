import assert from "node:assert/strict";
import test from "node:test";
import type { TranslationHistoryItem, TranslationResult } from "../../domain/phrase/phrase";
import type { Phrase, SrsItem } from "../../lib/types";
import {
  saveConversationTranslationToDrill,
  type ConversationTranslationDrillStorage,
} from "./save-conversation-translation-to-drill";

const SAVED_AT = "2026-01-01T12:00:00.000Z";
const NOW = Date.parse(SAVED_AT);

test("saving a new conversation translation to drill saves it as library-only before scheduling drill", () => {
  const storage = createMemoryStorage();
  storage.historyItems = [
    makeHistoryItem({ id: "history-1", savedPhraseId: null }),
  ];

  const result = saveConversationTranslationToDrill({
    translation: makeTranslationResult({ id: "phrase-1", targetText: "alpha" }),
    historyItemId: "history-1",
    savedAt: SAVED_AT,
    storage,
    now: NOW,
  });

  assert.equal(result.savedPhrase?.id, "phrase-1");
  assert.equal(result.linkedHistoryItem?.savedPhraseId, "phrase-1");
  assert.deepEqual(storage.addedPhraseShouldDrillValues, [false]);
  assert.equal(result.storedPhrase.shouldDrill, true);
  assert.equal(result.srsItems[0]?.id, "phrase-1");
});

test("saving an existing conversation translation to drill updates text without creating a duplicate phrase", () => {
  const storage = createMemoryStorage([
    makePhrase({ id: "phrase-1", shouldDrill: false, targetText: "old" }),
  ]);

  const result = saveConversationTranslationToDrill({
    translation: makeTranslationResult({ id: "phrase-1", targetText: "new" }),
    savedAt: SAVED_AT,
    storage,
    now: NOW,
  });

  assert.equal(result.savedPhrase, null);
  assert.equal(storage.addedPhraseShouldDrillValues.length, 0);
  assert.equal(storage.phrases.length, 1);
  assert.equal(result.storedPhrase.targetText, "new");
  assert.equal(result.storedPhrase.shouldDrill, true);
  assert.equal(result.srsItems[0]?.id, "phrase-1");
});

function createMemoryStorage(
  phrases: Phrase[] = [],
): ConversationTranslationDrillStorage & {
  phrases: Phrase[];
  historyItems: TranslationHistoryItem[];
  srsItems: SrsItem[];
  addedPhraseShouldDrillValues: boolean[];
} {
  return {
    phrases,
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
    loadPhrases() {
      return this.phrases;
    },
    updatePhrase(phraseId, updates) {
      this.phrases = this.phrases.map((phrase) =>
        phrase.id === phraseId ? { ...phrase, ...updates } : phrase,
      );
      return this.phrases;
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

function makePhrase(input: {
  id: string;
  shouldDrill: boolean;
  targetText: string;
}): Phrase {
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
    audioUrl: null,
    createdAt: SAVED_AT,
    categoryId: null,
    shouldDrill: input.shouldDrill,
    source: "conversation",
    usedAt: null,
  };
}

function makeTranslationResult(input: {
  id: string;
  targetText: string;
}): TranslationResult {
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
  };
}

function makeHistoryItem(input: {
  id: string;
  savedPhraseId: string | null;
}): TranslationHistoryItem {
  return {
    id: input.id,
    translation: makeTranslationResult({ id: "phrase-1", targetText: "alpha" }),
    source: "conversation",
    createdAt: SAVED_AT,
    savedPhraseId: input.savedPhraseId,
  };
}
