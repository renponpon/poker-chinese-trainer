import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_CACHE_OWNER_KEY, readAccountCheckpoint, writeAccountCheckpoint } from "./account-cache-storage";
import { loadLocalPhrases, addLocalPhrase, updateLocalPhrase } from "./phrase-storage";
import { STARTER_PHRASES } from "../../lib/starter-phrases";

function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  Object.defineProperty(globalThis, "window", { configurable: true, value: Object.assign(new EventTarget(), { localStorage: storage }) });
  return storage;
}

test("new visitors start empty and existing starter phrases are preserved", () => {
  const storage = setup();
  assert.deepEqual(loadLocalPhrases(), []);
  storage.setItem("poker-chinese-local-phrases-v1", JSON.stringify([STARTER_PHRASES[0]]));
  storage.removeItem("poker-chinese-starter-phrases-v1");
  assert.deepEqual(loadLocalPhrases().map((phrase) => phrase.id), [STARTER_PHRASES[0].id]);
});

test("local changes are checkpointed per account without replacing the last synced baseline", () => {
  const storage = setup();
  const base = { phrases: [STARTER_PHRASES[0]], srsItems: [] };
  storage.setItem(ACCOUNT_CACHE_OWNER_KEY, "account-a");
  writeAccountCheckpoint("account-a", { baseline: base, local: base });
  addLocalPhrase(STARTER_PHRASES[0]);
  addLocalPhrase(STARTER_PHRASES[0]);
  updateLocalPhrase(STARTER_PHRASES[0].id, { explanation: "offline edit" });
  const checkpoint = readAccountCheckpoint("account-a");
  assert.equal(checkpoint?.local.phrases.length, 1);
  assert.equal(checkpoint?.local.phrases[0].explanation, "offline edit");
  assert.deepEqual(checkpoint?.baseline, base);
  assert.equal(readAccountCheckpoint("account-b"), null);
});
