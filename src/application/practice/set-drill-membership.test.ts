import assert from "node:assert/strict";
import test from "node:test";
import {
  addPhraseToDrill,
  removePhraseFromDrill,
  type DrillMembershipStorage,
} from "./set-drill-membership";
import type { Phrase, SrsItem } from "../../lib/types";

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

test("adding a saved phrase to drill creates schedule state", () => {
  const storage = createMemoryStorage([makePhrase({ shouldDrill: false })], []);

  const result = addPhraseToDrill({
    phrase: storage.phrases[0]!,
    storage,
    now: NOW,
  });

  assert.equal(result.phrases[0]?.shouldDrill, true);
  assert.equal(result.srsItems.length, 1);
  assert.equal(result.srsItems[0]?.id, "phrase-1");
  assert.equal(result.srsItems[0]?.nextReviewAt, NOW);
});

test("removing a phrase from drill keeps the saved phrase", () => {
  const storage = createMemoryStorage(
    [makePhrase({ shouldDrill: true })],
    [makeSrsItem()],
  );

  const result = removePhraseFromDrill({
    phrase: storage.phrases[0]!,
    storage,
    now: NOW,
  });

  assert.equal(result.phrases.length, 1);
  assert.equal(result.phrases[0]?.id, "phrase-1");
  assert.equal(result.phrases[0]?.shouldDrill, false);
  assert.deepEqual(result.srsItems, []);
});

function createMemoryStorage(
  initialPhrases: Phrase[],
  initialSrsItems: SrsItem[],
): DrillMembershipStorage & {
  phrases: Phrase[];
  srsItems: SrsItem[];
} {
  return {
    phrases: initialPhrases,
    srsItems: initialSrsItems,
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

function makePhrase(input: Pick<Phrase, "shouldDrill">): Phrase {
  return {
    id: "phrase-1",
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
    audioUrl: null,
    createdAt: new Date(NOW).toISOString(),
    direction: "ja-to-zh",
    categoryId: null,
    shouldDrill: input.shouldDrill,
    source: "manual",
    usedAt: null,
  };
}

function makeSrsItem(): SrsItem {
  return {
    id: "phrase-1",
    status: "review",
    nextReviewAt: NOW,
    intervalDays: 3,
    easeFactor: 2.5,
    consecutiveGood: 1,
    lastScore: 2,
    lastReviewedAt: NOW - 86_400_000,
  };
}
