import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePracticeScheduleSyncRequest,
  persistPracticeSchedule,
  PracticeScheduleSyncRequestError,
} from "./persist-practice-schedule";
import type { Phrase, SrsItem } from "../../lib/types";

test("persisting practice schedule delegates phrase and schedule together", async () => {
  const calls: Array<{ phrase: Phrase; srsItem: SrsItem }> = [];
  const phrase = makePhrase("phrase-1");
  const srsItem = makeSrsItem("phrase-1");

  await persistPracticeSchedule({
    phrase,
    srsItem,
    storage: {
      savePracticeSchedule: async (input) => {
        calls.push(input);
      },
    },
  });

  assert.deepEqual(calls, [{ phrase, srsItem }]);
});

test("normalizes a practice schedule sync request", () => {
  const phrase = makePhrase("phrase-1");
  const srsItem = makeSrsItem("phrase-1");

  const result = normalizePracticeScheduleSyncRequest({
    ownerKey: " owner ",
    phrase,
    srsItem,
  });

  assert.deepEqual(result, {
    ownerKey: "owner",
    schedule: { phrase, srsItem },
  });
});

test("missing practice schedule sync payload is a no-op", () => {
  assert.deepEqual(normalizePracticeScheduleSyncRequest({ ownerKey: " owner " }), {
    ownerKey: "owner",
    schedule: null,
  });
});

test("rejects malformed practice schedule sync request", () => {
  assert.throws(
    () => normalizePracticeScheduleSyncRequest(null),
    (error) =>
      error instanceof PracticeScheduleSyncRequestError &&
      error.code === "validation_error" &&
      error.status === 400,
  );
});

function makePhrase(id: string): Phrase {
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
    explanation: "",
    audioUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    direction: "ja-to-zh",
    categoryId: null,
    shouldDrill: true,
    source: "manual",
    usedAt: null,
  };
}

function makeSrsItem(id: string): SrsItem {
  return {
    id,
    status: "review",
    nextReviewAt: Date.UTC(2026, 0, 2),
    intervalDays: 3,
    easeFactor: 2.5,
    consecutiveGood: 1,
    lastScore: 2,
    lastReviewedAt: Date.UTC(2026, 0, 1),
  };
}
