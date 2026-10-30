import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_CACHE_OWNER_KEY } from "./account-cache-storage";
import { loadDrillPreferences, setDrillLimit, DRILL_PREFERENCES_PREFIX } from "./drill-preferences-storage";
import { syncDrillPreferences } from "../../lib/drill-preferences-sync";
import { loadDrillRound, saveDrillRound } from "./drill-round-storage";
import { startDrillRound } from "../../application/practice/drill-round";
import { captureDeviceData, restoreDeviceBackup, DEVICE_RECOVERY_KEY } from "./device-backup";

function setup(owner = "account-a") {
  const values = new Map<string, string>([[ACCOUNT_CACHE_OWNER_KEY, owner]]);
  const storage: Storage = { get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); }, clear: () => values.clear() };
  Object.defineProperty(globalThis, "window", { configurable: true, value: Object.assign(new EventTarget(), { localStorage: storage, location: { origin: "https://test.invalid" } }) });
  return { values, storage };
}
const response = (limit: number, userId = "account-a") => Response.json({ ok: true, userId, limit });

test("local defaults and account/guest isolation; failing writes are not successful", () => {
  const { storage } = setup("guest");
  assert.equal(loadDrillPreferences("guest").limit, 5);
  setDrillLimit("guest", 20);
  storage.setItem(ACCOUNT_CACHE_OWNER_KEY, "account-a");
  assert.equal(loadDrillPreferences("account-a").limit, 5);
  assert.throws(() => setDrillLimit("guest", 10));
  storage.setItem = () => {};
  assert.throws(() => setDrillLimit("account-a", 10));
});

test("offline settings stay pending; reconnect and a second device receive the limit", async () => {
  const first = setup();
  setDrillLimit("account-a", 20);
  await assert.rejects(syncDrillPreferences("account-a", "token", async () => { throw new Error("offline"); }));
  assert.ok(loadDrillPreferences("account-a").pendingId);
  await syncDrillPreferences("account-a", "token", async (_url, options) => { assert.deepEqual(JSON.parse(String(options?.body)), { limit: 20 }); return response(20); });
  assert.equal(loadDrillPreferences("account-a").pendingId, null);
  setup();
  await syncDrillPreferences("account-a", "token", async (_url, options) => { assert.deepEqual(JSON.parse(String(options?.body)), {}); return response(20); });
  assert.equal(loadDrillPreferences("account-a").limit, 20);
  assert.equal(JSON.parse(first.values.get(DRILL_PREFERENCES_PREFIX + "account-a")!).limit, 20);
});

test("late responses cannot overwrite newer local choices or another account", async () => {
  const { storage } = setup();
  setDrillLimit("account-a", 10);
  await syncDrillPreferences("account-a", "token", async () => { setDrillLimit("account-a", 20); return response(10); });
  assert.equal(loadDrillPreferences("account-a").limit, 20);
  assert.ok(loadDrillPreferences("account-a").pendingId);
  await syncDrillPreferences("account-a", "token", async () => { storage.setItem(ACCOUNT_CACHE_OWNER_KEY, "account-b"); return response(20); });
  assert.equal(loadDrillPreferences("account-b").limit, 5);
});

test("wrong owner, malformed result and rejected request leave pending settings intact", async () => {
  setup(); setDrillLimit("account-a", 10);
  for (const result of [response(10, "account-b"), response(-1), response(1000), response(1.5), Response.json({ ok: false }, { status: 503 })]) {
    await assert.rejects(syncDrillPreferences("account-a", "token", async () => result));
    assert.ok(loadDrillPreferences("account-a").pendingId);
  }
});

test("unlimited and custom settings round trip offline, through sync and backup", async () => {
  for (const limit of [0, 1, 7, 999]) {
    const { storage } = setup();
    setDrillLimit("account-a", limit);
    await assert.rejects(syncDrillPreferences("account-a", "token", async () => { throw new Error("offline"); }));
    assert.equal(loadDrillPreferences("account-a").limit, limit);
    const backup = captureDeviceData();
    setDrillLimit("account-a", 5);
    restoreDeviceBackup(backup);
    storage.removeItem(DEVICE_RECOVERY_KEY);
    assert.equal(loadDrillPreferences("account-a").limit, limit);
    await syncDrillPreferences("account-a", "token", async (_url, options) => {
      assert.deepEqual(JSON.parse(String(options?.body)), { limit });
      return response(limit);
    });
    assert.equal(loadDrillPreferences("account-a").pendingId, null);
    setup();
    await syncDrillPreferences("account-a", "token", async () => response(limit));
    assert.equal(loadDrillPreferences("account-a").limit, limit);
  }
});

test("round storage is scoped, validated and detects silent failures", () => {
  const { storage } = setup();
  const round = startDrillRound({ owner: "account-a", language: "en", timeZone: "Asia/Tokyo", now: Date.now(), limit: 10, id: "round", phrases: [], items: [] });
  saveDrillRound(round);
  assert.deepEqual(loadDrillRound("account-a", "en"), round);
  assert.equal(loadDrillRound("account-a", "zh"), null);
  assert.throws(() => loadDrillRound("account-b", "en"));
  storage.setItem = () => {};
  assert.throws(() => saveDrillRound({ ...round, id: "new" }));
});

test("backup includes round/settings and older backup restore removes stale progress", () => {
  const { storage } = setup();
  const before = captureDeviceData();
  setDrillLimit("account-a", 20);
  saveDrillRound(startDrillRound({ owner: "account-a", language: "en", timeZone: "Asia/Tokyo", now: Date.now(), limit: 20, id: "round", phrases: [], items: [] }));
  const backup = captureDeviceData();
  assert.equal(backup.entries.some(([key]) => key.startsWith("phrabit-drill-round-v1:")), true);
  assert.equal(backup.entries.some(([key]) => key.startsWith(DRILL_PREFERENCES_PREFIX)), true);
  restoreDeviceBackup(before);
  assert.equal(storage.getItem(DRILL_PREFERENCES_PREFIX + "account-a"), null);
  assert.throws(() => setDrillLimit("account-a", 10));
  storage.removeItem(DEVICE_RECOVERY_KEY);
});
