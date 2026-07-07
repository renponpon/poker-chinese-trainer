import assert from "node:assert/strict";
import test from "node:test";
import { recordDrillPracticeResult } from "./record-practice-result";
import type { SrsItem } from "../../lib/types";

const NOW = Date.UTC(2026, 0, 1);

test("recording a drill practice result updates and persists the matching item", () => {
  const saves: SrsItem[][] = [];
  const item = makeSrsItem({
    id: "phrase-1",
    status: "new",
    nextReviewAt: NOW,
  });

  const result = recordDrillPracticeResult({
    items: [item],
    phraseId: "phrase-1",
    score: 3,
    reviewedAt: NOW,
    storage: {
      saveSrsItems: (items) => saves.push(items),
    },
  });

  assert.equal(result.updatedItem?.id, "phrase-1");
  assert.equal(result.updatedItem?.lastScore, 3);
  assert.notEqual(result.updatedItem?.nextReviewAt, NOW);
  assert.deepEqual(saves, [result.items]);
});

test("recording practice for a missing drill item leaves saved schedule unchanged", () => {
  const saves: SrsItem[][] = [];
  const item = makeSrsItem({
    id: "phrase-1",
    status: "new",
    nextReviewAt: NOW,
  });

  const result = recordDrillPracticeResult({
    items: [item],
    phraseId: "phrase-2",
    score: 2,
    reviewedAt: NOW,
    storage: {
      saveSrsItems: (items) => saves.push(items),
    },
  });

  assert.equal(result.updatedItem, null);
  assert.strictEqual(result.items, saves[0]);
  assert.deepEqual(result.items, [item]);
});

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
