import assert from "node:assert/strict";
import test from "node:test";
import { STARTER_PHRASES } from "../../lib/starter-phrases";
import type { Phrase, SrsItem } from "../../lib/types";
import { selectDueDrillPhrases, syncDrillSchedule } from "./drill-schedule";
import { manageDrillPhrase, type ManageDrillPhraseStorage } from "./manage-drill-phrase";
import { normalizeAccountPhraseSnapshot } from "../phrase/account-phrase-sync";
import { mergeAccountPhraseData } from "../phrase/merge-account-phrase-data";
import { reconcileAccountPhraseData } from "../phrase/reconcile-account-phrase-data";

const now = Date.parse("2026-10-30T01:00:00Z");
const day = 86400000;
const phrase = (id: string, overrides: Partial<Phrase> = {}): Phrase => ({ ...STARTER_PHRASES[0], id, shouldDrill: true, source: "manual", ...overrides });
const item = (id: string, overrides: Partial<SrsItem> = {}): SrsItem => ({ id, status: "review", nextReviewAt: now - 1, intervalDays: 1, easeFactor: 2.5, consecutiveGood: 1, lastScore: 3, lastReviewedAt: now - day, ...overrides });
const ids = (phrases: Phrase[]) => phrases.map((entry) => entry.id);

test("due order is priority, previous-day Bad, Good, others; recent weak reviews come first", () => {
  const phrases = ["perfect", "good", "old-bad", "recent-bad", "priority", "new", "today-bad"].map((id) => phrase(id, { drillPriority: id === "priority" }));
  const items = [item("perfect"), item("good", { lastScore: 2 }), item("old-bad", { lastScore: 1, lastReviewedAt: now - 3 * day }), item("recent-bad", { lastScore: 1 }), item("priority"), item("today-bad", { lastScore: 1, lastReviewedAt: now - 1000 })];
  const original = structuredClone({ phrases, items });
  const result = selectDueDrillPhrases({ phrases, items, now, timeZone: "Asia/Tokyo" });
  assert.deepEqual(ids(result).slice(0, 4), ["priority", "recent-bad", "old-bad", "good"]);
  assert.deepEqual({ phrases, items }, original);
  assert.deepEqual(ids(selectDueDrillPhrases({ phrases: [...phrases].reverse(), items, now, timeZone: "Asia/Tokyo" })), ids(result));
});

test("priority never pulls future, mastered, or paused phrases into the due queue", () => {
  const phrases = [phrase("future", { drillPriority: true }), phrase("paused", { shouldDrill: false, drillPriority: true }), phrase("mastered", { drillPriority: true }), phrase("normal")];
  const items = [item("future", { lastScore: 2, nextReviewAt: now + day }), item("paused"), item("mastered", { status: "mastered" })];
  assert.deepEqual(ids(selectDueDrillPhrases({ phrases, items, now })), ["normal"]);
  assert.deepEqual(ids(selectDueDrillPhrases({ phrases, items, now: now + day })), ["future", "normal"]);
});

test("previous day follows the learning timezone, including midnight and daylight saving", () => {
  const phrases = [phrase("ordinary"), phrase("weak")];
  const items = [item("weak", { lastScore: 1, lastReviewedAt: Date.parse("2026-10-29T15:30:00Z") })];
  assert.deepEqual(ids(selectDueDrillPhrases({ phrases, items, now, timeZone: "UTC" })), ["weak", "ordinary"]);
  assert.deepEqual(ids(selectDueDrillPhrases({ phrases, items, now, timeZone: "Asia/Tokyo" })), ["ordinary", "weak"]);
  const dstNow = Date.parse("2026-11-01T01:30:00-08:00");
  const dstItems = [item("weak", { lastScore: 2, lastReviewedAt: Date.parse("2026-10-31T23:50:00-07:00") })];
  assert.deepEqual(ids(selectDueDrillPhrases({ phrases, items: dstItems, now: dstNow, timeZone: "America/Los_Angeles" })), ["weak", "ordinary"]);
});

test("only the latest score matters; Perfect replaces earlier weakness", () => {
  const phrases = [phrase("ordinary"), phrase("was-bad")];
  const items = [item("was-bad", { lastScore: 3 })];
  assert.deepEqual(ids(selectDueDrillPhrases({ phrases, items, now })), ["ordinary", "was-bad"]);
});

function storageFor(phrases: Phrase[], items: SrsItem[]) {
  const state = { phrases: structuredClone(phrases), items: structuredClone(items) };
  const storage: ManageDrillPhraseStorage = {
    loadPhrases: () => state.phrases,
    savePhrases: (next) => { state.phrases = next; },
    loadSrsItems: () => state.items,
    saveSrsItems: (next) => { state.items = next; },
    updatePhrase: (id, updates) => { state.phrases = state.phrases.map((entry) => entry.id === id ? { ...entry, ...updates } : entry); return state.phrases; },
  };
  return { state, storage };
}

test("priority, pause, resume and delete preserve unrelated phrases and do not review", () => {
  const phrases = [phrase("target"), phrase("other")];
  const items = [item("target"), item("other")];
  const { state, storage } = storageFor(phrases, items);
  manageDrillPhrase({ phraseId: "target", action: "toggle-priority", storage });
  assert.equal(state.phrases[0].drillPriority, true);
  manageDrillPhrase({ phraseId: "target", action: "pause", storage });
  assert.equal(state.phrases[0].shouldDrill, false);
  assert.deepEqual(state.items, items);
  assert.deepEqual(ids(selectDueDrillPhrases({ phrases: state.phrases, items: state.items, now })), ["other"]);
  manageDrillPhrase({ phraseId: "target", action: "resume", storage, now: now + day });
  assert.equal(state.phrases[0].shouldDrill, true);
  assert.deepEqual(state.items, items);
  manageDrillPhrase({ phraseId: "target", action: "toggle-priority", storage });
  assert.equal(state.phrases[0].drillPriority, false);
  manageDrillPhrase({ phraseId: "target", action: "pause", storage });
  manageDrillPhrase({ phraseId: "target", action: "delete", storage });
  assert.deepEqual(state.phrases, [phrases[1]]);
  assert.deepEqual(state.items, [items[1]]);
});

test("a missing phrase or unreadable schedule does not write", () => {
  const { state, storage } = storageFor([phrase("target")], [item("target")]);
  const original = structuredClone(state);
  assert.throws(() => manageDrillPhrase({ phraseId: "deleted", action: "toggle-priority", storage }));
  storage.loadSrsItems = () => { throw new Error("unreadable"); };
  assert.throws(() => manageDrillPhrase({ phraseId: "target", action: "delete", storage }));
  assert.deepEqual(state, original);
});

test("schedule synchronization retains learning receipts on paused phrases", () => {
  const reviewed = item("paused", { learningReceipt: { version: 1, operationId: "11111111-1111-4111-8111-111111111111", owner: "guest", occurredAt: new Date(now).toISOString(), timeZone: "Asia/Tokyo" } });
  const result = syncDrillSchedule({ phrases: [phrase("paused", { shouldDrill: false }), phrase("new")], items: [reviewed], now });
  assert.strictEqual(result.items[0], reviewed);
  assert.equal(result.items.length, 2);
});

test("API normalization retains paused progress and explicit priority; rejects invalid priority", () => {
  for (const drillPriority of [true, false]) {
    const snapshot = normalizeAccountPhraseSnapshot({ phrases: [phrase("target", { shouldDrill: false, drillPriority })], srsItems: [item("target")] });
    assert.equal(snapshot.phrases[0].drillPriority, drillPriority);
    assert.equal(snapshot.phrases[0].shouldDrill, false);
    assert.equal(snapshot.srsItems.length, 1);
  }
  assert.throws(() => normalizeAccountPhraseSnapshot({ phrases: [{ ...phrase("target"), drillPriority: "true" }], srsItems: [] }));
});

test("fresh-device merge respects cloud pause and priority without dropping a newer review", () => {
  const local = { phrases: [phrase("target", { drillPriority: false })], srsItems: [item("target")] };
  const cloud = { phrases: [phrase("target", { shouldDrill: false, drillPriority: true })], srsItems: [] };
  const merged = mergeAccountPhraseData(local, cloud);
  assert.equal(merged.phrases[0].shouldDrill, false);
  assert.equal(merged.phrases[0].drillPriority, true);
  assert.deepEqual(merged.srsItems, local.srsItems);
});

test("offline pause and priority merge with the other device's latest review", () => {
  const baseline = { phrases: [phrase("target", { drillPriority: false })], srsItems: [item("target")] };
  const local = { ...baseline, phrases: [phrase("target", { shouldDrill: false, drillPriority: true })] };
  const cloud = { ...baseline, srsItems: [item("target", { lastReviewedAt: now, lastScore: 1 })] };
  const result = reconcileAccountPhraseData(baseline, local, cloud);
  assert.equal(result.snapshot.phrases[0].shouldDrill, false);
  assert.equal(result.snapshot.phrases[0].drillPriority, true);
  assert.deepEqual(result.snapshot.srsItems, cloud.srsItems);
  assert.equal(result.mutations.length, 1);
  assert.equal(result.mutations[0].kind, "save");
});
