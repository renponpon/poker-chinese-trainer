import assert from "node:assert/strict";
import test from "node:test";
import {
  createDrillItem,
  isDrillItemDue,
  recordPracticeResult,
  syncDrillItems,
  type DrillItem,
} from "./practice-schedule";

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const DAY_MS = 86_400_000;

test("saving a phrase does not create a drill item by itself", () => {
  const result = syncDrillItems(
    [{ phraseId: "saved-phrase-1", isDrillEnabled: false }],
    [],
    NOW,
  );

  assert.equal(result.changed, false);
  assert.deepEqual(result.items, []);
});

test("adding a saved phrase to drill creates an item with a next review date", () => {
  const result = syncDrillItems(
    [{ phraseId: "saved-phrase-1", isDrillEnabled: true }],
    [],
    NOW,
  );

  assert.equal(result.changed, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.phraseId, "saved-phrase-1");
  assert.equal(result.items[0]?.status, "new");
  assert.equal(result.items[0]?.nextReviewAt, NOW);
});

test("recording a practice result updates the next review date", () => {
  const item = createDrillItem({ phraseId: "phrase-1", now: NOW });
  const reviewed = recordPracticeResult(item, {
    score: 2,
    reviewedAt: NOW,
  });

  assert.equal(reviewed.status, "learning");
  assert.equal(reviewed.lastScore, 2);
  assert.equal(reviewed.lastReviewedAt, NOW);
  assert.equal(reviewed.nextReviewAt, NOW + DAY_MS);
});

test("removing from drill leaves the saved phrase outside the schedule", () => {
  const existing = createDrillItem({ phraseId: "saved-phrase-1", now: NOW });
  const result = syncDrillItems(
    [{ phraseId: "saved-phrase-1", isDrillEnabled: false }],
    [existing],
    NOW,
  );

  assert.equal(result.changed, true);
  assert.deepEqual(result.items, []);
});

test("mastered drill items are not due", () => {
  const mastered: DrillItem = {
    ...createDrillItem({ phraseId: "phrase-1", now: NOW }),
    status: "mastered",
    nextReviewAt: NOW - DAY_MS,
  };

  assert.equal(isDrillItemDue(mastered, NOW), false);
});
