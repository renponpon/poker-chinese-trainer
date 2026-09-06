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
  if (method === "DELETE") {
    cloud.phrases = cloud.phrases.filter((phrase) => !body.phraseIds.includes(phrase.id));
    cloud.srsItems = cloud.srsItems.filter((item) => !body.phraseIds.includes(item.id));
  } else if (method === "PATCH") {
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

local.addLocalPhrase(phrase);
await sync.synchronizeAccountPhraseData(session);
assert.equal(backend.get("token-a").phrases.length, 1);
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
assert.equal(local.loadLocalPhrases()[0].id, phrase.id);
const callsBeforeRecovery = calls.length;
storage.setItem("phrabit-device-recovery-v1", "active");
await assert.rejects(sync.synchronizeAccountPhraseData(session), /復元確認中/);
assert.equal(calls.length, callsBeforeRecovery);
console.log("PASS: actual sync coordinator with mocked cloud: offline edit/delete, network-disconnected addition/review/retry without duplicates, in-flight edit, remote add/delete, conflict preservation, SRS, logout recovery, account-switch cancellation/isolation, recovery blocks cloud requests");
