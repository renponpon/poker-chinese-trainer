import assert from "node:assert/strict";
import test from "node:test";
import { recordLearningPractice } from "./record-learning-practice";
import { loadLearningSnapshot, recoverLearningReceipts, mergeLearningSync, LEARNING_STORAGE_PREFIX, SRS_STORAGE_KEY } from "./learning-days-storage";
import { ACCOUNT_CACHE_OWNER_KEY } from "./account-cache-storage";
import { captureDeviceData, restoreDeviceBackup, DEVICE_RECOVERY_KEY } from "./device-backup";
import { saveLocalSrsItems } from "./srs-storage";
import { syncLearningDays } from "../../lib/learning-days-sync";
import type { SrsItem } from "../../lib/types";

const account = "11111111-1111-4111-8111-111111111111";
const otherAccount = "22222222-2222-4222-8222-222222222222";
const now = Date.parse("2026-10-24T01:00:00Z");
const initial: SrsItem = { id: "phrase", status: "new", nextReviewAt: 0, intervalDays: 0, easeFactor: 2.5, consecutiveGood: 0, lastScore: null, lastReviewedAt: null };

function setup(owner = "guest") {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); }, clear: () => values.clear(),
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: Object.assign(new EventTarget(), { localStorage: storage, location: { origin: "https://test.example" } }) });
  storage.setItem(ACCOUNT_CACHE_OWNER_KEY, owner);
  storage.setItem(SRS_STORAGE_KEY, JSON.stringify([initial]));
  return { values, storage };
}

function answer(owner = "guest", score: 1 | 2 | 3 = 1, reviewedAt = now, eligible = true) {
  return recordLearningPractice({ items: JSON.parse(window.localStorage.getItem(SRS_STORAGE_KEY)!), phraseId: "phrase", owner, score, reviewedAt, eligible });
}

test("Bad counts, repeated answers persist exactly one date across reload and languages", () => {
  setup();
  for (let count = 0; count < 10; count += 1) answer("guest", count % 2 ? 2 : 1);
  recoverLearningReceipts();
  assert.deepEqual(loadLearningSnapshot().days, ["2026-10-24"]);
  assert.equal(loadLearningSnapshot().records.length, 1);
  assert.equal(loadLearningSnapshot().pending, 0);
});

test("samples/prototypes and unsuccessful SRS writes do not count", () => {
  const { storage, values } = setup();
  answer("guest", 1, now, false);
  assert.equal(loadLearningSnapshot().days.length, 0);
  storage.setItem = (key, value) => { if (key === SRS_STORAGE_KEY) throw new Error("quota"); values.set(key, value); };
  assert.throws(() => answer());
  assert.equal(loadLearningSnapshot().days.length, 0);
  storage.setItem = (key, value) => { if (key !== SRS_STORAGE_KEY) values.set(key, value); };
  assert.throws(() => answer());
  assert.equal(loadLearningSnapshot().days.length, 0);
});

test("receipt survives ledger failure; recovery counts once and never reapplies SRS", () => {
  const { storage, values } = setup();
  storage.setItem = (key, value) => { if (key.includes(":event:")) throw new Error("quota"); values.set(key, value); };
  const saved = answer();
  assert.equal(saved.learningPending, true);
  const raw = storage.getItem(SRS_STORAGE_KEY);
  assert.equal(JSON.parse(raw!)[0].lastScore, 1);
  assert.throws(() => saveLocalSrsItems([]), "do not overwrite unflushed receipt");
  assert.equal(storage.getItem(SRS_STORAGE_KEY), raw);
  storage.setItem = (key, value) => { values.set(key, value); };
  recoverLearningReceipts();
  recoverLearningReceipts();
  assert.equal(loadLearningSnapshot().records.length, 1);
  assert.equal(storage.getItem(SRS_STORAGE_KEY), raw);
  saveLocalSrsItems([]);
  assert.equal(loadLearningSnapshot().days.length, 1);
});

test("checkpoint failure after committed SRS is not reported as failed answer", () => {
  const { storage, values } = setup(account);
  storage.setItem = (key, value) => { if (key.startsWith("phrabit-account-checkpoint")) throw new Error("quota"); values.set(key, value); };
  assert.equal(answer(account, 2).updatedItem?.consecutiveGood, 1);
  assert.equal(loadLearningSnapshot().pending, 1);
});

test("account initial offline records wait for shared timezone; guest and other account stay separate", () => {
  const { storage } = setup();
  answer();
  storage.setItem(ACCOUNT_CACHE_OWNER_KEY, account);
  answer(account);
  const state = loadLearningSnapshot();
  assert.equal(state.pending, 1);
  assert.equal(state.days.length, 0);
  const operationId = state.records[0].operationId;
  mergeLearningSync(account, { userId: account, timeZone: "America/Los_Angeles", days: ["2026-10-23"], accepted: [operationId], rejected: [] }, [operationId]);
  assert.deepEqual(loadLearningSnapshot().days, ["2026-10-23"]);
  assert.deepEqual(loadLearningSnapshot("guest").days, ["2026-10-24"]);
  assert.deepEqual(loadLearningSnapshot(otherAccount).days, []);
  assert.equal(loadLearningSnapshot().records[0].timeZone, "America/Los_Angeles");
  storage.setItem(ACCOUNT_CACHE_OWNER_KEY, otherAccount);
  assert.throws(() => mergeLearningSync(account, { userId: account, timeZone: "UTC", days: [], accepted: [], rejected: [] }, []));
});

test("cloud union retains unsynced days, rejects forged acknowledgement and empty cloud does not erase", () => {
  setup(account);
  mergeLearningSync(account, { userId: account, timeZone: "Asia/Tokyo", days: ["2026-10-21"], accepted: [], rejected: [] }, []);
  answer(account);
  mergeLearningSync(account, { userId: account, timeZone: "Asia/Tokyo", days: [], accepted: [], rejected: [] }, []);
  assert.deepEqual(loadLearningSnapshot().days, ["2026-10-21", "2026-10-24"]);
  assert.equal(loadLearningSnapshot().pending, 1);
  assert.throws(() => mergeLearningSync(account, { userId: account, timeZone: "Asia/Tokyo", days: [], accepted: [crypto.randomUUID()], rejected: [] }, []));
});

test("backup includes settings, ledger and pending receipts; restore preserves recovery gate", () => {
  const { storage } = setup(account);
  answer(account);
  const backup = captureDeviceData();
  assert.ok(backup.entries.some(([key]) => key.startsWith(LEARNING_STORAGE_PREFIX)));
  storage.removeItem(SRS_STORAGE_KEY);
  restoreDeviceBackup(backup);
  assert.equal(loadLearningSnapshot().pending, 1);
  assert.ok(storage.getItem(DEVICE_RECOVERY_KEY));
  assert.throws(() => answer(account));
});

test("corrupt ledger is surfaced instead of reset or silently replacing it", () => {
  const { storage } = setup();
  const key = `${LEARNING_STORAGE_PREFIX}guest:event:broken`;
  storage.setItem(key, "broken");
  assert.throws(() => answer());
  assert.equal(storage.getItem(key), "broken");
});

test("network errors, HTTP errors and stale account responses retain pending data", async () => {
  const { storage } = setup(account);
  answer(account);
  await assert.rejects(syncLearningDays(account, "test", async () => { throw new Error("offline"); }));
  await assert.rejects(syncLearningDays(account, "test", async () => Response.json({ ok: true }, { status: 503 })));
  await assert.rejects(syncLearningDays(account, "test", async () => Response.json({ ok: false })));
  const id = loadLearningSnapshot().records[0].operationId;
  await syncLearningDays(account, "test", async () => {
    storage.setItem(ACCOUNT_CACHE_OWNER_KEY, otherAccount);
    return Response.json({ ok: true, userId: account, timeZone: "Asia/Tokyo", days: ["2026-10-24"], accepted: [id], rejected: [] });
  });
  assert.equal(loadLearningSnapshot(account).pending, 1);
  assert.equal(loadLearningSnapshot(otherAccount).days.length, 0);
});

test("successful retry uses same durable id, future rejection keeps receipt without counting", async () => {
  setup(account);
  answer(account);
  let lastId = "";
  const request: typeof fetch = async (_, init) => {
    const body = JSON.parse(String(init?.body));
    lastId = body.events[0].operationId;
    return Response.json({ ok: true, userId: account, timeZone: "Asia/Tokyo", days: [], accepted: [], rejected: [lastId] });
  };
  await syncLearningDays(account, "test", request);
  assert.equal(loadLearningSnapshot().rejected, 1);
  assert.equal(loadLearningSnapshot().days.length, 0);
  assert.equal(loadLearningSnapshot().records[0].operationId, lastId);
});

test("partial merge failure preserves pending receipt; the same response can safely retry", () => {
  const { storage, values } = setup(account);
  answer(account);
  const id = loadLearningSnapshot().records[0].operationId;
  const response = { userId: account, timeZone: "Asia/Tokyo", days: ["2026-10-23", "2026-10-24"], accepted: [id], rejected: [] };
  storage.setItem = (key, value) => { if (key.endsWith(":day:2026-10-24")) throw new Error("quota"); values.set(key, value); };
  assert.throws(() => mergeLearningSync(account, response, [id]));
  assert.equal(loadLearningSnapshot().pending, 1);
  storage.setItem = (key, value) => { values.set(key, value); };
  mergeLearningSync(account, response, [id]);
  assert.deepEqual(loadLearningSnapshot().days, ["2026-10-23", "2026-10-24"]);
  assert.equal(loadLearningSnapshot().pending, 0);
});

test("logout and return to same owner still ignores old in-flight response", async () => {
  setup(account);
  answer(account);
  let active = true;
  await syncLearningDays(account, "test", async () => {
    active = false;
    return Response.json({ ok: true, userId: account, timeZone: "Asia/Tokyo", days: ["2026-10-23"], accepted: [], rejected: [] });
  }, () => active);
  assert.equal(loadLearningSnapshot().timeZone, null);
  assert.equal(loadLearningSnapshot().pending, 1);
});
