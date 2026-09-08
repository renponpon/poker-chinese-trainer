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

for (const score of [2, 3] as const) {
  test(`maintenance advances through every stage with score ${score}`, () => {
    let item: DrillItem = { ...createDrillItem({ phraseId: "maintenance", now: NOW }), status: "maintenance", intervalDays: 14, consecutiveGood: 3 };
    for (const days of [45, 120, 180]) {
      const before = { ...item };
      const reviewedAt = item.nextReviewAt;
      const updated = recordPracticeResult(item, { score, reviewedAt });
      assert.deepEqual(item, before);
      assert.equal(updated.intervalDays, days);
      assert.equal(updated.nextReviewAt, reviewedAt + days * DAY_MS);
      assert.equal(updated.status, days === 180 ? "mastered" : "maintenance");
      item = updated;
    }
    assert.equal(isDrillItemDue(item, item.nextReviewAt + DAY_MS), false);
  });
}

test("Bad returns maintenance and mastered items to relearning without changing history", () => {
  for (const status of ["maintenance", "mastered"] as const) {
    const original = { ...createDrillItem({ phraseId: status, now: NOW }), status, intervalDays: 120, consecutiveGood: 7 };
    const updated = recordPracticeResult(original, { score: 1, reviewedAt: NOW });
    assert.equal(updated.status, "learning");
    assert.equal(updated.nextReviewAt, NOW + 10 * 60_000);
    assert.equal(updated.consecutiveGood, 0);
    assert.equal(original.intervalDays, 120);
  }
});

test("legacy maintenance intervals and daylight-saving boundaries use elapsed time", () => {
  const reviewedAt = Date.parse("2026-11-01T01:30:00-07:00");
  const item: DrillItem = { ...createDrillItem({ phraseId: "legacy", now: reviewedAt }), status: "maintenance", intervalDays: 35 };
  const updated = recordPracticeResult(item, { score: 2, reviewedAt });
  assert.equal(updated.intervalDays, 45);
  assert.equal(isDrillItemDue(updated, reviewedAt + 45 * DAY_MS - 1), false);
  assert.equal(isDrillItemDue(updated, reviewedAt + 45 * DAY_MS), true);
});

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
