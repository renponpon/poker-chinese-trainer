import assert from "node:assert/strict";
import test from "node:test";
import { mergeAccountPhraseData } from "./merge-account-phrase-data";
import type { Phrase, SrsItem } from "../../lib/types";

test("keeps phrases from both devices without duplicating shared IDs", () => {
  const result = mergeAccountPhraseData(
    { phrases: [makePhrase("local")], srsItems: [] },
    { phrases: [makePhrase("cloud")], srsItems: [] },
  );

  assert.deepEqual(
    result.phrases.map((phrase) => phrase.id).sort(),
    ["cloud", "local"],
  );
});

test("keeps the most recently reviewed schedule for a shared phrase", () => {
  const phrase = makePhrase("shared");
  const localItem = makeSrsItem("shared", 200);
  const cloudItem = makeSrsItem("shared", 100);

  const result = mergeAccountPhraseData(
    { phrases: [phrase], srsItems: [localItem] },
    { phrases: [phrase], srsItems: [cloudItem] },
  );

  assert.deepEqual(result.srsItems, [localItem]);
});

test("preserves drill membership when either device has progress", () => {
  const localPhrase = makePhrase("shared", false);
  const cloudPhrase = makePhrase("shared", false);

  const result = mergeAccountPhraseData(
    { phrases: [localPhrase], srsItems: [makeSrsItem("shared", 100)] },
    { phrases: [cloudPhrase], srsItems: [] },
  );

  assert.equal(result.phrases[0]?.shouldDrill, true);
  assert.equal(result.srsItems.length, 1);
});

function makePhrase(id: string, shouldDrill = false): Phrase {
  return {
    id,
    japanese: id,
    chinese: id,
    pinyin: "",
    sourceLanguage: "ja",
    targetLanguage: "zh",
    sourceText: id,
    targetText: id,
    reading: "",
    readingType: "pinyin",
    explanation: "explanation",
    audioUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    direction: "ja-to-zh",
    categoryId: null,
    shouldDrill,
    source: "manual",
    usedAt: null,
  };
}

function makeSrsItem(id: string, lastReviewedAt: number): SrsItem {
  return {
    id,
    status: "learning",
    nextReviewAt: lastReviewedAt + 100,
    intervalDays: 1,
    easeFactor: 2.5,
    consecutiveGood: 1,
    lastScore: 2,
    lastReviewedAt,
  };
}
