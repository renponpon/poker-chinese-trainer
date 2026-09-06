import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const effects = [];
const timers = new Map();
const callbacks = [];
const syncedTokens = [];
let session = { user: { id: "account-a" }, access_token: "initial-token" };
let authCallback;
let unsubscribeCount = 0;
let sessionReads = 0;
let cleared = 0;
let pendingRead = null;
const browserWindow = Object.assign(new EventTarget(), {
  setInterval: (callback, delay) => { assert.equal(delay, 30_000); timers.set(1, callback); return 1; },
  clearInterval: (id) => timers.delete(id),
  setTimeout: (callback) => { callbacks.push(callback); return callbacks.length; },
});
const browserDocument = Object.assign(new EventTarget(), { visibilityState: "visible" });
const browserNavigator = { onLine: true };
Object.defineProperty(globalThis, "window", { value: browserWindow, configurable: true });
Object.defineProperty(globalThis, "document", { value: browserDocument, configurable: true });
Object.defineProperty(globalThis, "navigator", { value: browserNavigator, configurable: true });
globalThis.fetch = async () => { throw new Error("External requests are disabled in this test"); };
const supabase = { auth: {
  getSession: async () => {
    sessionReads += 1;
    return pendingRead ? pendingRead.promise : { data: { session } };
  },
  onAuthStateChange: (callback) => {
    authCallback = callback;
    return { data: { subscription: { unsubscribe: () => { unsubscribeCount += 1; } } } };
  },
} };
const filename = resolve("src/components/AuthSessionKeeper.tsx");
const source = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const compiled = { exports: {} };
const require = (name) => {
  if (name === "react") return { useEffect: (effect) => effects.push(effect) };
  if (name === "@/lib/supabase") return { getBrowserSupabase: () => supabase };
  if (name === "@/lib/account-phrase-sync") return {
    synchronizeAccountPhraseData: async (current) => { syncedTokens.push(current.access_token); },
    clearOwnedAccountPhraseData: () => { cleared += 1; },
  };
  throw new Error("Unexpected dependency " + name);
};
runInThisContext("(function(require,module,exports){" + source + "\n})", { filename })(require, compiled, compiled.exports);
const settle = async () => { for (let turn = 0; turn < 3; turn += 1) await new Promise((done) => setImmediate(done)); };
const flushCallbacks = () => { for (const callback of callbacks.splice(0)) callback(); };
compiled.exports.default();
const cleanup = effects[0]();
await settle();
assert.deepEqual(syncedTokens, ["initial-token"]);
const tick = timers.get(1);
session = { ...session, access_token: "refreshed-token" };
tick();
await settle();
assert.equal(syncedTokens.at(-1), "refreshed-token", "polling must use the current session, not a stale cached JWT");

const beforeHidden = sessionReads;
browserDocument.visibilityState = "hidden";
tick();
browserWindow.dispatchEvent(new Event("focus"));
await settle();
assert.equal(sessionReads, beforeHidden, "hidden tabs must not poll");
browserDocument.visibilityState = "visible";
browserNavigator.onLine = false;
tick();
await settle();
assert.equal(sessionReads, beforeHidden, "offline devices must not poll");
browserNavigator.onLine = true;
browserWindow.dispatchEvent(new Event("online"));
await settle();
assert.equal(sessionReads, beforeHidden + 1);

pendingRead = Promise.withResolvers();
const beforeOverlap = sessionReads;
tick();
tick();
browserWindow.dispatchEvent(new Event("focus"));
assert.equal(sessionReads, beforeOverlap + 1, "overlapping triggers share a refresh");
const beforeSignOut = syncedTokens.length;
authCallback("SIGNED_OUT", null);
flushCallbacks();
pendingRead.resolve({ data: { session } });
pendingRead = null;
await settle();
assert.equal(cleared, 1);
assert.equal(syncedTokens.length, beforeSignOut, "a read started before sign-out must not restore the old account");
const afterSignOut = sessionReads;
tick();
await settle();
assert.equal(sessionReads, afterSignOut, "signed-out clients must not poll");

authCallback("SIGNED_IN", session);
flushCallbacks();
await settle();
pendingRead = Promise.withResolvers();
tick();
const beforeCleanup = syncedTokens.length;
cleanup();
assert.equal(timers.size, 0);
assert.equal(unsubscribeCount, 1);
pendingRead.resolve({ data: { session } });
await settle();
assert.equal(syncedTokens.length, beforeCleanup, "unmounted components cannot sync late responses");
const readsAfterCleanup = sessionReads;
browserWindow.dispatchEvent(new Event("focus"));
browserWindow.dispatchEvent(new Event("online"));
browserDocument.dispatchEvent(new Event("visibilitychange"));
await settle();
assert.equal(sessionReads, readsAfterCleanup);
console.log("PASS auth refresh: 30s polling, fresh token, hidden/offline/sign-out pause, overlap suppression, stale auth response cancellation and cleanup");
