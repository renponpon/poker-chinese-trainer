import assert from "node:assert/strict";
import test from "node:test";
import {
  AccountPhraseSyncRequestError,
  normalizeAccountPhraseIds,
  normalizeAccountPhraseSnapshot,
  normalizeAccountPhraseState,
} from "./account-phrase-sync";

test("normalizes an account snapshot including a drill item", () => {
  const snapshot = normalizeAccountPhraseSnapshot({
    phrases: [makePhrase(true)],
    srsItems: [makeSrsItem()],
  });

  assert.equal(snapshot.phrases.length, 1);
  assert.equal(snapshot.srsItems.length, 1);
  assert.equal(snapshot.srsItems[0]?.id, snapshot.phrases[0]?.id);
});

test("drops a stale SRS item for a library-only phrase", () => {
  const snapshot = normalizeAccountPhraseSnapshot({
    phrases: [makePhrase(false)],
    srsItems: [makeSrsItem()],
  });

  assert.equal(snapshot.srsItems.length, 0);
});

test("normalizes a single phrase state without a schedule", () => {
  const state = normalizeAccountPhraseState({ phrase: makePhrase(false) });
  assert.equal(state.phrase.shouldDrill, false);
  assert.equal(state.srsItem, null);
});

test("deduplicates phrase IDs for account deletion", () => {
  assert.deepEqual(
    normalizeAccountPhraseIds({ phraseIds: ["phrase-1", "phrase-1"] }),
    ["phrase-1"],
  );
});

test("rejects malformed account snapshots", () => {
  assert.throws(
    () => normalizeAccountPhraseSnapshot({ phrases: [], srsItems: [{}] }),
    (error) => error instanceof AccountPhraseSyncRequestError,
  );
});

const phraseId = "123e4567-e89b-12d3-a456-426614174000";

function makePhrase(shouldDrill: boolean) {
  return {
    id: phraseId,
    japanese: "日本語",
    chinese: "中文",
    pinyin: "zhōngwén",
    sourceLanguage: "ja",
    targetLanguage: "zh",
    sourceText: "日本語",
    targetText: "中文",
    reading: "zhōngwén",
    readingType: "pinyin",
    explanation: "",
    audioUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    direction: "ja-to-zh",
    categoryId: null,
    shouldDrill,
    source: "manual",
    usedAt: null,
  };
}

function makeSrsItem() {
  return {
    id: phraseId,
    status: "learning",
    nextReviewAt: 100,
    intervalDays: 1,
    easeFactor: 2.5,
    consecutiveGood: 1,
    lastScore: 2,
    lastReviewedAt: 50,
  };
}
