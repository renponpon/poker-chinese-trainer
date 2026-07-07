import assert from "node:assert/strict";
import test from "node:test";
import { deleteSavedPhrases } from "./delete-saved-phrases";
import type { Phrase, SrsItem } from "../../lib/types";

const NOW = Date.UTC(2026, 0, 1);

test("deleting a saved phrase removes its drill schedule item", () => {
  const storage = createMemoryStorage(
    [
      makePhrase({ id: "keep", shouldDrill: true }),
      makePhrase({ id: "delete", shouldDrill: true }),
    ],
    [
      makeSrsItem({ id: "keep", nextReviewAt: NOW }),
      makeSrsItem({ id: "delete", nextReviewAt: NOW }),
    ],
  );

  const result = deleteSavedPhrases({
    phraseIds: ["delete"],
    storage,
    now: NOW,
  });

  assert.equal(result.deletedCount, 1);
  assert.deepEqual(result.phrases.map((phrase) => phrase.id), ["keep"]);
  assert.deepEqual(result.srsItems.map((item) => item.id), ["keep"]);
});

test("deleting a library-only saved phrase keeps existing drill schedule intact", () => {
  const storage = createMemoryStorage(
    [
      makePhrase({ id: "keep", shouldDrill: true }),
      makePhrase({ id: "library-only", shouldDrill: false }),
    ],
    [makeSrsItem({ id: "keep", nextReviewAt: NOW })],
  );

  const result = deleteSavedPhrases({
    phraseIds: ["library-only"],
    storage,
    now: NOW,
  });

  assert.equal(result.deletedCount, 1);
  assert.deepEqual(result.phrases.map((phrase) => phrase.id), ["keep"]);
  assert.deepEqual(result.srsItems.map((item) => item.id), ["keep"]);
});

function createMemoryStorage(phrases: Phrase[], srsItems: SrsItem[]) {
  let currentPhrases = phrases;
  let currentSrsItems = srsItems;
  return {
    loadPhrases: () => currentPhrases,
    savePhrases: (next: Phrase[]) => {
      currentPhrases = next;
    },
    loadSrsItems: () => currentSrsItems,
    saveSrsItems: (next: SrsItem[]) => {
      currentSrsItems = next;
    },
  };
}

function makePhrase(input: Pick<Phrase, "id" | "shouldDrill">): Phrase {
  return {
    id: input.id,
    japanese: input.id,
    chinese: input.id,
    pinyin: "",
    sourceLanguage: "ja",
    targetLanguage: "zh",
    sourceText: input.id,
    targetText: input.id,
    reading: "",
    readingType: "pinyin",
    explanation: "",
    audioUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    direction: "ja-to-zh",
    categoryId: null,
    shouldDrill: input.shouldDrill,
    source: "manual",
    usedAt: null,
  };
}

function makeSrsItem(input: Pick<SrsItem, "id" | "nextReviewAt">): SrsItem {
  return {
    id: input.id,
    status: "review",
    nextReviewAt: input.nextReviewAt,
    intervalDays: 3,
    easeFactor: 2.5,
    consecutiveGood: 1,
    lastScore: 2,
    lastReviewedAt: NOW - 1000,
  };
}
