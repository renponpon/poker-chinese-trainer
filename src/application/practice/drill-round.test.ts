import assert from "node:assert/strict";
import test from "node:test";
import { availableRoundPhrases, reconcileDrillRound, startDrillRound, validDrillRound } from "./drill-round";
import type { Phrase, SrsItem } from "../../lib/types";

const now = Date.parse("2026-10-30T01:00:00Z");
const phrases = Array.from({ length: 25 }, (_, index) => ({ id: `phrase-${String(index).padStart(2, "0")}`, shouldDrill: true, targetLanguage: "en", source: "manual", createdAt: new Date(now - 86400000).toISOString() } as Phrase));
const items: SrsItem[] = phrases.map((phrase) => ({ id: phrase.id, lastReviewedAt: null, lastScore: null, status: "new", nextReviewAt: now - 1, intervalDays: 0, easeFactor: 2.5, consecutiveGood: 0 }));
const base = { phrases, items, owner: "guest", language: "en" as const, now, timeZone: "Asia/Tokyo", id: "round" };

test("custom and unlimited rounds keep a finite frozen eligible set, Bad retries and restored progress", () => {
  for (const limit of [0, 1, 7, 999]) {
    const round = startDrillRound({ ...base, limit });
    const count = limit === 0 ? 25 : Math.min(limit, 25);
    assert.equal(round.queueIds.length, count);
    assert.equal(validDrillRound(JSON.parse(JSON.stringify(round))), true);
    const failed = items.map((item, index) => index === 0 ? { ...item, lastReviewedAt: now, lastScore: 1 as const } : item);
    const retry = reconcileDrillRound(round, phrases, failed);
    assert.equal(retry.completedIds.length, 0);
    assert.equal(retry.queueIds.length, count);
    assert.equal(retry.queueIds.at(-1), round.queueIds[0]);
    const passed = failed.map((item, index) => index === 0 ? { ...item, lastReviewedAt: now + 1, lastScore: 2 as const } : item);
    const next = reconcileDrillRound(retry, phrases, passed);
    assert.equal(next.completedIds.length, 1);
    assert.equal(validDrillRound(next), true);
    assert.deepEqual(reconcileDrillRound(round, [...phrases, { ...phrases[0], id: "added" }], items).queueIds, round.queueIds);
  }
  const filtered = startDrillRound({ ...base, limit: 0, items: items.map((item, index) => index === 0 ? { ...item, status: "review", nextReviewAt: now + 86400000 } : item) });
  assert.equal(filtered.queueIds.length, 24);
  assert.equal(validDrillRound({ ...filtered, limit: -1 }), false);
  assert.equal(validDrillRound({ ...filtered, limit: 1000 }), false);
  assert.equal(validDrillRound({ ...filtered, limit: 7.5 }), false);
  assert.equal(startDrillRound({ ...base, limit: 0, phrases: [] }).queueIds.length, 0);
  const largeDeck = Array.from({ length: 1005 }, (_, index) => ({ ...phrases[0], id: `large-${index}` }));
  const unlimited = startDrillRound({ ...base, limit: 0, phrases: largeDeck, items: [] });
  assert.equal(unlimited.queueIds.length, 1005);
  assert.equal(validDrillRound(JSON.parse(JSON.stringify(unlimited))), true);
});

test("5/10/20 slices distinct eligible cards, with actual total for short/empty decks", () => {
  for (const limit of [5, 10, 20] as const) {
    const round = startDrillRound({ ...base, limit });
    assert.equal(round.queueIds.length, limit);
    assert.equal(validDrillRound(round), true);
    assert.equal(startDrillRound({ ...base, limit, phrases: phrases.slice(0, 3) }).queueIds.length, 3);
    assert.equal(startDrillRound({ ...base, limit, phrases: [] }).queueIds.length, 0);
  }
});

test("Bad goes to the tail without progress; repeated Bad and last Bad never finish", () => {
  const round = startDrillRound({ ...base, limit: 5 });
  const updated = items.map((item, index) => index === 0 ? { ...item, lastReviewedAt: now, lastScore: 1 as const } : item);
  const next = reconcileDrillRound(round, phrases, updated);
  assert.deepEqual(next.queueIds, [...round.queueIds.slice(1), round.queueIds[0]]);
  assert.equal(next.completedIds.length, 0);
  assert.equal(reconcileDrillRound(next, phrases, updated), next);
  const last = startDrillRound({ ...base, phrases: phrases.slice(0, 1), limit: 5 });
  assert.deepEqual(reconcileDrillRound(last, phrases, updated).queueIds, last.queueIds);
});

test("Good/Perfect count once, Bad→Good counts once, SRS restores a lost progress write", () => {
  const round = startDrillRound({ ...base, limit: 5 });
  const updated = items.map((item, index) => index < 2 ? { ...item, lastReviewedAt: now + index, lastScore: (index ? 3 : 2) as 2 | 3 } : item);
  const restored = reconcileDrillRound(JSON.parse(JSON.stringify(round)), phrases, updated);
  assert.equal(restored.completedIds.length, 2);
  assert.equal(restored.queueIds.length, 3);
  assert.equal(reconcileDrillRound(restored, phrases, updated), restored);
  assert.equal(availableRoundPhrases({ ...base, items: updated }, restored.completedToday).length, 23);
});

test("frozen selection does not admit added, newly prioritized, future, paused or other-language cards", () => {
  const round = startDrillRound({ ...base, limit: 5 });
  const changed = phrases.map((phrase, index) => index === 20 ? { ...phrase, drillPriority: true } : phrase);
  assert.deepEqual(reconcileDrillRound(round, changed, items).queueIds, round.queueIds);
  const next = startDrillRound({ ...base, phrases: changed, limit: 5 });
  assert.equal(next.queueIds[0], phrases[20].id);
  assert.equal(startDrillRound({ ...base, phrases: phrases.map((phrase) => ({ ...phrase, shouldDrill: false })), limit: 5 }).queueIds.length, 0);
  assert.equal(startDrillRound({ ...base, language: "zh", limit: 5 }).queueIds.length, 0);
  assert.equal(startDrillRound({ ...base, items: items.map((item) => ({ ...item, status: "review", nextReviewAt: now + 1000 })), limit: 5 }).queueIds.length, 0);
});

test("removal shrinks only the pending part and does not refill or count answers", () => {
  const round = startDrillRound({ ...base, limit: 5 });
  const next = reconcileDrillRound(round, phrases.slice(1), items);
  assert.equal(next.queueIds.length, 4);
  assert.equal(next.completedIds.length, 0);
  assert.deepEqual(reconcileDrillRound(next, [], items).queueIds, []);
});

test("new day and next round use new preferences; old round does not mutate", () => {
  const first = startDrillRound({ ...base, limit: 5 });
  const completed = reconcileDrillRound(first, phrases, items.map((item, index) => index < 5 ? { ...item, lastReviewedAt: now, lastScore: 2 as const } : item));
  const next = startDrillRound({ ...base, limit: 10, completedToday: completed.completedToday });
  assert.equal(next.queueIds.length, 10);
  assert.equal(next.queueIds[0], phrases[5].id);
  assert.equal(first.limit, 5);
  assert.notEqual(startDrillRound({ ...base, limit: 5, now: now + 86400000 }).day, first.day);
  assert.equal(validDrillRound({ ...first, queueIds: [first.queueIds[0], first.queueIds[0]] }), false);
});
