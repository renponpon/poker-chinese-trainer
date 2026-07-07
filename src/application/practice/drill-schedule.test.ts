import assert from "node:assert/strict";
import test from "node:test";
import {
  countDrillStatuses,
  selectDueDrillPhrases,
  syncDrillSchedule,
} from "./drill-schedule";
import type { Phrase, SrsItem } from "../../lib/types";

const NOW = Date.UTC(2026, 0, 1);

test("syncing a drill schedule persists only when schedule membership changes", () => {
  const saves: SrsItem[][] = [];
  const result = syncDrillSchedule({
    phrases: [makePhrase({ id: "phrase-1", shouldDrill: true })],
    items: [],
    now: NOW,
    storage: {
      saveSrsItems: (items) => saves.push(items),
    },
  });

  assert.equal(result.changed, true);
  assert.equal(result.items[0]?.id, "phrase-1");
  assert.deepEqual(saves, [result.items]);

  const unchanged = syncDrillSchedule({
    phrases: [makePhrase({ id: "phrase-1", shouldDrill: true })],
    items: result.items,
    now: NOW,
    storage: {
      saveSrsItems: (items) => saves.push(items),
    },
  });

  assert.equal(unchanged.changed, false);
  assert.strictEqual(unchanged.items, result.items);
  assert.equal(saves.length, 1);
});

test("selecting due drill phrases excludes library-only and future items", () => {
  const dueItem = makeSrsItem({
    id: "due",
    status: "learning",
    nextReviewAt: NOW - 1,
  });
  const futureItem = makeSrsItem({
    id: "future",
    status: "review",
    nextReviewAt: NOW + 1000,
  });

  const due = selectDueDrillPhrases({
    phrases: [
      makePhrase({ id: "due", shouldDrill: true }),
      makePhrase({ id: "future", shouldDrill: true }),
      makePhrase({ id: "library-only", shouldDrill: false }),
    ],
    items: [dueItem, futureItem],
    now: NOW,
  });

  assert.deepEqual(due.map((phrase) => phrase.id), ["due"]);
});

test("counting drill statuses ignores library-only phrases", () => {
  const counts = countDrillStatuses({
    phrases: [
      makePhrase({ id: "new", shouldDrill: true }),
      makePhrase({ id: "review", shouldDrill: true }),
      makePhrase({ id: "library-only", shouldDrill: false }),
    ],
    items: [
      makeSrsItem({
        id: "review",
        status: "review",
        nextReviewAt: NOW,
      }),
    ],
  });

  assert.equal(counts.new, 1);
  assert.equal(counts.review, 1);
  assert.equal(counts.learning, 0);
});

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

function makeSrsItem(input: Pick<SrsItem, "id" | "status" | "nextReviewAt">): SrsItem {
  return {
    id: input.id,
    status: input.status,
    nextReviewAt: input.nextReviewAt,
    intervalDays: 0,
    easeFactor: 2.5,
    consecutiveGood: 0,
    lastScore: null,
    lastReviewedAt: null,
  };
}
