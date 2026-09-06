import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVICE_BACKUP_KEY, DEVICE_RECOVERY_KEY, captureDeviceData, ensureDeviceBackup,
  isDeviceRecoveryActive, parseDeviceBackup, readDeviceBackup, readPreRestoreBackup, restoreDeviceBackup,
} from "./device-backup";
import { loadLocalPhrases, saveLocalPhrases } from "./phrase-storage";
import { saveLocalSrsItems } from "./srs-storage";

const phraseKey = "poker-chinese-local-phrases-v1";
const ownerKey = "phrabit-account-cache-owner-v1";

function setup() {
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.assign(new EventTarget(), { localStorage: storage, location: { origin: "https://test.example" } }),
  });
  return { storage, values };
}

test("snapshot preserves raw old data before normalization and never overwrites the first copy", () => {
  const { storage } = setup();
  const raw = ' [ { "id": "old", "japanese": "旧データ", "chinese": "旧数据" } ] ';
  storage.setItem(phraseKey, raw);
  loadLocalPhrases();
  assert.equal(new Map(readDeviceBackup()!.entries).get(phraseKey), raw);
  const first = storage.getItem(DEVICE_BACKUP_KEY);
  saveLocalPhrases([]);
  ensureDeviceBackup();
  assert.equal(storage.getItem(DEVICE_BACKUP_KEY), first);
});

test("only learning data and account checkpoints are included, never authentication or API keys", () => {
  const { storage } = setup();
  storage.setItem(phraseKey, "[]");
  storage.setItem("phrabit-account-checkpoint-v1:account-a", "private learning data");
  storage.setItem("sb-project-auth-token", "secret token");
  storage.setItem("GEMINI_API_KEY", "secret key");
  const keys = captureDeviceData().entries.map(([key]) => key);
  assert.deepEqual(keys.sort(), ["phrabit-account-checkpoint-v1:account-a", phraseKey].sort());
});

test("quota failure and silent write failure stop mutations and retain original data", () => {
  for (const silent of [false, true]) {
    const { storage, values } = setup();
    storage.setItem(phraseKey, "original");
    storage.setItem = (key, value) => {
      if (key === DEVICE_BACKUP_KEY) {
        if (silent) return;
        throw new Error("quota");
      }
      values.set(key, value);
    };
    assert.throws(() => saveLocalPhrases([]));
    assert.equal(storage.getItem(phraseKey), "original");
  }
});

test("malformed original data remains recoverable while malformed backup blocks the app", () => {
  const { storage } = setup();
  storage.setItem(phraseKey, "invalid JSON [");
  ensureDeviceBackup();
  assert.equal(new Map(readDeviceBackup()!.entries).get(phraseKey), "invalid JSON [");
  storage.setItem(DEVICE_BACKUP_KEY, "broken backup");
  assert.throws(() => saveLocalPhrases([]));
  assert.equal(storage.getItem(phraseKey), "invalid JSON [");
});

test("restore rescues current data, restores exact old bytes, and pauses subsequent changes", () => {
  const { storage } = setup();
  storage.setItem(phraseKey, "old phrases");
  storage.setItem("sb-project-auth-token", "unchanged token");
  ensureDeviceBackup();
  storage.setItem(phraseKey, "new phrases");
  storage.setItem("poker-chinese-srs-v1", "new schedule");
  restoreDeviceBackup(readDeviceBackup()!);
  assert.equal(storage.getItem(phraseKey), "old phrases");
  assert.equal(storage.getItem("poker-chinese-srs-v1"), null);
  assert.equal(storage.getItem("sb-project-auth-token"), "unchanged token");
  assert.equal(new Map(readPreRestoreBackup()!.entries).get(phraseKey), "new phrases");
  assert.equal(isDeviceRecoveryActive(), true);
  assert.throws(() => saveLocalPhrases([]));
  assert.throws(() => saveLocalSrsItems([]));
  assert.throws(() => restoreDeviceBackup(readDeviceBackup()!));
});

test("rescue write failure cancels restoration without altering data or enabling recovery", () => {
  const { storage, values } = setup();
  storage.setItem(phraseKey, "before");
  ensureDeviceBackup();
  storage.setItem(phraseKey, "now");
  storage.setItem = (key, value) => {
    if (key.startsWith("phrabit-before-device-restore-v1:")) throw new Error("quota");
    values.set(key, value);
  };
  assert.throws(() => restoreDeviceBackup(readDeviceBackup()!));
  assert.equal(storage.getItem(phraseKey), "now");
  assert.equal(isDeviceRecoveryActive(), false);
});

test("partial restore failure retains current rescue and leaves editing and sync blocked", () => {
  const { storage, values } = setup();
  storage.setItem(phraseKey, "before");
  ensureDeviceBackup();
  storage.setItem(phraseKey, "now");
  storage.setItem = (key, value) => {
    if (key === phraseKey) throw new Error("quota during restore");
    values.set(key, value);
  };
  assert.throws(() => restoreDeviceBackup(readDeviceBackup()!));
  assert.equal(new Map(readPreRestoreBackup()!.entries).get(phraseKey), "now");
  assert.equal(isDeviceRecoveryActive(), true);
  assert.throws(ensureDeviceBackup);
});

test("restore rejects foreign origin or account and parser rejects forbidden or duplicate keys", () => {
  const { storage } = setup();
  storage.setItem(ownerKey, "account-a");
  const backup = captureDeviceData();
  assert.throws(() => restoreDeviceBackup({ ...backup, origin: "https://phrabit.com" }));
  storage.setItem(ownerKey, "account-b");
  assert.throws(() => restoreDeviceBackup(backup));
  assert.equal(storage.getItem(DEVICE_RECOVERY_KEY), null);
  assert.throws(() => parseDeviceBackup(JSON.stringify({ ...backup, entries: [["sb-project-auth-token", "token"]] })));
  assert.throws(() => parseDeviceBackup(JSON.stringify({ ...backup, entries: [...backup.entries, ...backup.entries] })));
});
