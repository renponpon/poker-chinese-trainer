import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const root = resolve("src");
const nativeRequire = createRequire(resolve("package.json"));
const modules = new Map();
const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};
Object.defineProperty(globalThis, "window", { value: Object.assign(new EventTarget(), { localStorage: storage }), configurable: true });
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
let session = { user: { id: "account-a" }, access_token: "token-a" };
const sessionB = { user: { id: "account-b" }, access_token: "token-b" };
const sessionA = session;
const backend = new Map([["token-a", { phrases: [], srsItems: [] }], ["token-b", { phrases: [], srsItems: [] }]]);
let failNextWrite = false;
let networkOffline = false;
let intercept = null;
const calls = [];
const deniedPhraseIds = new Set();
const clone = (value) => JSON.parse(JSON.stringify(value));

function loadSource(path) {
  const filename = /\.tsx?$/.test(path) ? path : path + ".ts";
  if (modules.has(filename)) return modules.get(filename).exports;
  const compiledModule = { exports: {} };
  modules.set(filename, compiledModule);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const require = (name) => {
    if (name === "react") return { ...nativeRequire(name), useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot() };
    const target = name.startsWith("@/") ? resolve(root, name.slice(2)) : name.startsWith(".") ? resolve(dirname(filename), name) : null;
    if (target === resolve(root, "lib/supabase")) return { getBrowserSupabase: () => ({ auth: { getSession: async () => ({ data: { session } }) } }) };
    return target ? loadSource(target) : nativeRequire(name);
  };
  runInThisContext("(function(require,module,exports){" + code + "\n})", { filename })(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

globalThis.fetch = async (url, options = {}) => {
  assert.equal(url, "/api/phrases", "this test must never contact an external service");
  const token = options.headers.Authorization?.replace("Bearer ", "");
  assert.ok(backend.has(token));
  const method = options.method ?? "GET";
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ token, method, body });
  if (networkOffline) throw new TypeError("Failed to fetch");
  if (intercept && method === intercept.method) {
    const gate = intercept;
    intercept = null;
    gate.entered.resolve();
    await gate.release.promise;
  }
  if (method !== "GET" && failNextWrite) {
    failNextWrite = false;
    return Response.json({ error: "offline" }, { status: 503 });
  }
  const cloud = backend.get(token);
  if (method === "GET") return Response.json(clone(cloud));
  if ((method === "PATCH" && deniedPhraseIds.has(body.phrase.id)) || (method === "DELETE" && body.phraseIds.some((id) => deniedPhraseIds.has(id)))) {
    return Response.json({ error: "permission denied" }, { status: 500 });
  }
  if (method === "DELETE") {
    cloud.phrases = cloud.phrases.filter((phrase) => !body.phraseIds.includes(phrase.id));
    cloud.srsItems = cloud.srsItems.filter((item) => !body.phraseIds.includes(item.id));
  } else if (method === "PATCH") {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.phrase.id)) {
      return Response.json({ error: "invalid phrase ID" }, { status: 400 });
    }
    const exists = cloud.phrases.some((phrase) => phrase.id === body.phrase.id);
    if (body.existingOnly && !exists) return Response.json({ error: "deleted" }, { status: 409 });
    cloud.phrases = [...cloud.phrases.filter((phrase) => phrase.id !== body.phrase.id), clone(body.phrase)];
    cloud.srsItems = cloud.srsItems.filter((item) => item.id !== body.phrase.id);
    if (body.srsItem && body.phrase.shouldDrill) cloud.srsItems.push(clone(body.srsItem));
  } else assert.fail("unexpected method " + method);
  return Response.json({ ok: true });
};

const sync = loadSource(resolve(root, "lib/account-phrase-sync"));
const AccountSyncNotice = loadSource(resolve(root, "components/AccountSyncNotice.tsx")).default;
assert.equal(AccountSyncNotice({ hideSyncedStatus: true }), null);
const local = loadSource(resolve(root, "infrastructure/local/phrase-storage"));
const srs = loadSource(resolve(root, "infrastructure/local/srs-storage"));
const cache = loadSource(resolve(root, "infrastructure/local/account-cache-storage"));
const starters = loadSource(resolve(root, "lib/starter-phrases"));
const phrase = { ...starters.STARTER_PHRASES[0], explanation: "base" };
const starterScope = loadSource(resolve(root, "lib/account-starter-ids"));
const emptySnapshot = { phrases: [], srsItems: [] };
const starterSnapshot = { phrases: [phrase], srsItems: [] };
const firstScopedId = (await starterScope.createAccountStarterIdMap("account-a", starterSnapshot, null, emptySnapshot)).get(phrase.id);
assert.match(firstScopedId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.equal((await starterScope.createAccountStarterIdMap("account-a", starterSnapshot, null, emptySnapshot)).get(phrase.id), firstScopedId);
assert.notEqual((await starterScope.createAccountStarterIdMap("account-b", starterSnapshot, null, emptySnapshot)).get(phrase.id), firstScopedId);
assert.equal((await starterScope.createAccountStarterIdMap("account-a", starterSnapshot, null, starterSnapshot)).size, 0, "existing owned starter IDs stay unchanged");
assert.equal((await starterScope.createAccountStarterIdMap("account-a", starterSnapshot, starterSnapshot, emptySnapshot)).size, 0, "known deleted starters must not be recreated under a new ID");

storage.setItem("poker-chinese-local-phrases-v1", JSON.stringify([{ ...phrase, id: "starter-001-really" }]));
storage.setItem("poker-chinese-srs-v1", JSON.stringify([{
  id: "starter-001-really", status: "review", intervalDays: 3, consecutiveGood: 2, easeFactor: 2.5,
  lastScore: 2, lastReviewedAt: 2000, nextReviewAt: 9000,
}]));
backend.get("token-a").phrases.push(clone(phrase));
await sync.synchronizeAccountPhraseData(session);
assert.equal(backend.get("token-a").phrases.length, 1);
assert.equal(backend.get("token-a").phrases[0].id, phrase.id);
assert.equal(backend.get("token-a").srsItems[0].id, phrase.id);
assert.equal(backend.get("token-a").srsItems[0].lastReviewedAt, 2000);
const upgradeBackup = JSON.parse(storage.getItem("phrabit-before-sync-upgrade-20260906-v1"));
assert.equal(JSON.parse(upgradeBackup.entries.find(([key]) => key === "poker-chinese-local-phrases-v1")[1])[0].id, "starter-001-really");
assert.equal(JSON.parse(upgradeBackup.entries.find(([key]) => key === "poker-chinese-srs-v1")[1])[0].lastReviewedAt, 2000);
assert.equal(cache.currentDataOwner(), "account-a");
assert.equal(sync.getAccountSyncStatus(), "同期済み");
assert.equal(AccountSyncNotice({}).props.children, "同期済み", "他の画面の同期済み表示を維持");
assert.equal(AccountSyncNotice({ hideSyncedStatus: true }), null, "翻訳画面の同期済み表示を省く");

local.updateLocalPhrase(phrase.id, { explanation: "offline edit" });
failNextWrite = true;
await assert.rejects(sync.syncPhraseStateToCloud(phrase, null), /offline/);
assert.match(AccountSyncNotice({ hideSyncedStatus: true }).props.children, /未同期/, "未同期の警告は隠さない");
assert.equal(local.loadLocalPhrases()[0].explanation, "offline edit");
assert.equal(cache.readAccountCheckpoint("account-a").local.phrases[0].explanation, "offline edit");
sync.clearOwnedAccountPhraseData();
assert.equal(local.loadLocalPhrases().length, 0);
await sync.synchronizeAccountPhraseData(session);
assert.equal(backend.get("token-a").phrases[0].explanation, "offline edit");

const entered = Promise.withResolvers();
const release = Promise.withResolvers();
intercept = { method: "PATCH", entered, release };
local.updateLocalPhrase(phrase.id, { explanation: "in flight" });
const inFlight = sync.syncPhraseStateToCloud(phrase, null);
await entered.promise;
local.updateLocalPhrase(phrase.id, { explanation: "newer edit" });
release.resolve();
await inFlight;
assert.equal(local.loadLocalPhrases()[0].explanation, "newer edit");
assert.equal(backend.get("token-a").phrases[0].explanation, "newer edit");

const foreign = { ...starters.STARTER_PHRASES[1], explanation: "from other device" };
backend.get("token-a").phrases.push(clone(foreign));
await sync.synchronizeAccountPhraseData(session);
assert.ok(local.loadLocalPhrases().some((item) => item.id === foreign.id));
backend.get("token-a").phrases = backend.get("token-a").phrases.filter((item) => item.id !== foreign.id);
backend.get("token-a").srsItems = backend.get("token-a").srsItems.filter((item) => item.id !== foreign.id);
await sync.synchronizeAccountPhraseData(session);
assert.ok(!local.loadLocalPhrases().some((item) => item.id === foreign.id));

local.updateLocalPhrase(phrase.id, { explanation: "keep local conflict" });
backend.set("token-a", { phrases: [], srsItems: [] });
const writesBefore = calls.filter((call) => call.method === "PATCH").length;
await sync.synchronizeAccountPhraseData(session);
assert.equal(local.loadLocalPhrases()[0].explanation, "keep local conflict");
assert.equal(calls.filter((call) => call.method === "PATCH").length, writesBefore);
assert.match(sync.getAccountSyncStatus(), /別端末で削除/);
local.deleteLocalPhraseAndSrs(phrase.id);
await sync.synchronizeAccountPhraseData(session);
assert.equal(local.loadLocalPhrases().length, 0);

phrase.id = "10000000-0000-4000-8000-000000000001";
local.addLocalPhrase(phrase);
await sync.synchronizeAccountPhraseData(session);
local.deleteLocalPhraseAndSrs(phrase.id);
failNextWrite = true;
await assert.rejects(sync.deletePhrasesFromCloud([phrase.id]), /offline/);
assert.equal(local.loadLocalPhrases().length, 0);
await sync.synchronizeAccountPhraseData(session);
assert.equal(backend.get("token-a").phrases.length, 0);

local.addLocalPhrase(phrase);
await sync.synchronizeAccountPhraseData(session);
const review = { ...srs.loadLocalSrsItems()[0], lastScore: 2, lastReviewedAt: 2000, nextReviewAt: 9000, status: "review" };
srs.saveLocalSrsItems([review]);
await sync.syncPhraseStateToCloud(phrase, review);
assert.equal(backend.get("token-a").srsItems[0].lastReviewedAt, 2000);

const offlinePhrase = { ...phrase, id: "10000000-0000-4000-8000-000000000002", explanation: "new offline phrase" };
const offlineReview = { ...review, id: offlinePhrase.id, lastReviewedAt: 3000, nextReviewAt: 12000 };
local.addLocalPhrase(offlinePhrase);
srs.saveLocalSrsItems([...srs.loadLocalSrsItems(), offlineReview]);
networkOffline = true;
await assert.rejects(sync.syncPhraseStateToCloud(offlinePhrase, offlineReview), /Failed to fetch/);
await assert.rejects(sync.synchronizeAccountPhraseData(session), /Failed to fetch/);
assert.match(AccountSyncNotice({ hideSyncedStatus: true }).props.children, /未同期/);
assert.equal(local.loadLocalPhrases().filter((item) => item.id === offlinePhrase.id).length, 1);
assert.equal(srs.loadLocalSrsItems().find((item) => item.id === offlinePhrase.id).lastReviewedAt, 3000);
assert.equal(cache.readAccountCheckpoint("account-a").local.phrases.filter((item) => item.id === offlinePhrase.id).length, 1);
assert.equal(cache.readAccountCheckpoint("account-a").local.srsItems.find((item) => item.id === offlinePhrase.id).lastReviewedAt, 3000);
assert.equal(backend.get("token-a").phrases.some((item) => item.id === offlinePhrase.id), false);
networkOffline = false;
await sync.synchronizeAccountPhraseData(session);
await sync.synchronizeAccountPhraseData(session);
assert.equal(backend.get("token-a").phrases.filter((item) => item.id === offlinePhrase.id).length, 1);
assert.equal(backend.get("token-a").srsItems.filter((item) => item.id === offlinePhrase.id).length, 1);
assert.equal(backend.get("token-a").srsItems.find((item) => item.id === offlinePhrase.id).lastReviewedAt, 3000);
assert.equal(backend.get("token-a").srsItems.find((item) => item.id === offlinePhrase.id).nextReviewAt, 12000);
assert.equal(sync.getAccountSyncStatus(), "同期済み");

const sharedStarter = starters.STARTER_PHRASES[3];
deniedPhraseIds.add(sharedStarter.id);
local.addLocalPhrase(sharedStarter);
srs.saveLocalSrsItems([...srs.loadLocalSrsItems(), { ...review, id: sharedStarter.id, lastReviewedAt: 4000 }]);
const callsBeforeScoping = calls.length;
await sync.synchronizeAccountPhraseData(session);
const scopedId = (await starterScope.createAccountStarterIdMap(session.user.id, { phrases: [sharedStarter], srsItems: [] }, null, emptySnapshot)).get(sharedStarter.id);
assert.equal(calls.slice(callsBeforeScoping).some((call) => call.method === "PATCH" && call.body.phrase.id === sharedStarter.id), false);
assert.equal(local.loadLocalPhrases().some((item) => item.id === sharedStarter.id), false);
assert.equal(backend.get("token-a").srsItems.find((item) => item.id === scopedId).lastReviewedAt, 4000);
local.addLocalPhrase(sharedStarter);
srs.saveLocalSrsItems([...srs.loadLocalSrsItems(), { ...review, id: sharedStarter.id, lastReviewedAt: 3500 }]);
await sync.synchronizeAccountPhraseData(session);
assert.equal(backend.get("token-a").phrases.filter((item) => item.id === scopedId).length, 1);
assert.equal(backend.get("token-a").srsItems.find((item) => item.id === scopedId).lastReviewedAt, 4000);

const rejectedPhrase = { ...phrase, id: "10000000-0000-4000-8000-000000000003", explanation: "keep unsent" };
local.updateLocalPhrase(phrase.id, { explanation: "saved before rejected upload" });
local.addLocalPhrase(rejectedPhrase);
deniedPhraseIds.add(rejectedPhrase.id);
const mobilePhrase = { ...phrase, id: "10000000-0000-4000-8000-000000000004", explanation: "from phone" };
backend.get("token-a").phrases.push(clone(mobilePhrase));
backend.get("token-a").srsItems.find((item) => item.id === phrase.id).lastReviewedAt = 5000;
await assert.rejects(sync.synchronizeAccountPhraseData(session), /permission denied/);
assert.ok(local.loadLocalPhrases().some((item) => item.id === mobilePhrase.id), "a rejected upload must not block incoming phone phrases");
assert.equal(srs.loadLocalSrsItems().find((item) => item.id === phrase.id).lastReviewedAt, 5000);
assert.equal(local.loadLocalPhrases().find((item) => item.id === rejectedPhrase.id).explanation, "keep unsent");
assert.equal(backend.get("token-a").phrases.find((item) => item.id === phrase.id).explanation, "saved before rejected upload");
assert.equal(cache.readAccountCheckpoint("account-a").baseline.phrases.find((item) => item.id === phrase.id).explanation, "saved before rejected upload");
assert.equal(cache.readAccountCheckpoint("account-a").baseline.phrases.some((item) => item.id === rejectedPhrase.id), false);
await assert.rejects(sync.synchronizeAccountPhraseData(session), /permission denied/);
assert.ok(local.loadLocalPhrases().some((item) => item.id === mobilePhrase.id));
deniedPhraseIds.delete(rejectedPhrase.id);
await sync.synchronizeAccountPhraseData(session);
assert.equal(backend.get("token-a").phrases.filter((item) => item.id === rejectedPhrase.id).length, 1);
local.deleteLocalPhraseAndSrs(rejectedPhrase.id);
deniedPhraseIds.add(rejectedPhrase.id);
await assert.rejects(sync.synchronizeAccountPhraseData(session), /permission denied/);
assert.equal(local.loadLocalPhrases().some((item) => item.id === rejectedPhrase.id), false, "failed delete must not restore a removed phrase");
assert.ok(cache.readAccountCheckpoint("account-a").baseline.phrases.some((item) => item.id === rejectedPhrase.id));
deniedPhraseIds.delete(rejectedPhrase.id);
await sync.synchronizeAccountPhraseData(session);
assert.equal(backend.get("token-a").phrases.some((item) => item.id === rejectedPhrase.id), false);

const accountGate = { method: "GET", entered: Promise.withResolvers(), release: Promise.withResolvers() };
intercept = accountGate;
const oldAccountRequest = sync.synchronizeAccountPhraseData(session);
const oldRejected = assert.rejects(oldAccountRequest, /アカウントが変わった/);
await accountGate.entered.promise;
session = sessionB;
await sync.synchronizeAccountPhraseData(session);
assert.equal(cache.currentDataOwner(), "account-b");
assert.equal(local.loadLocalPhrases().length, 0);
accountGate.release.resolve();
await oldRejected;
assert.equal(local.loadLocalPhrases().length, 0);
assert.equal(backend.get("token-b").phrases.length, 0);
session = sessionA;
await sync.synchronizeAccountPhraseData(session);
assert.equal(local.loadLocalPhrases().find((item) => item.id === phrase.id).explanation, "saved before rejected upload");
const callsBeforeRecovery = calls.length;
storage.setItem("phrabit-device-recovery-v1", "active");
await assert.rejects(sync.synchronizeAccountPhraseData(session), /復元確認中/);
assert.equal(calls.length, callsBeforeRecovery);
console.log("PASS: actual sync coordinator with mocked cloud: account-scoped legacy starters, reviews/backups preserved, incoming phrases/reviews survive rejected uploads/deletes, no duplicates, offline retry, in-flight edit, remote add/delete, conflict preservation, logout recovery, account-switch isolation, recovery blocks cloud requests");
