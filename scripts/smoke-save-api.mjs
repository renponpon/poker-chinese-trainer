import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const root = resolve("src");
const nativeRequire = createRequire(resolve("package.json"));
const modules = new Map();
const overrides = new Map();
globalThis.fetch = async () => { throw new Error("External requests are disabled in this test"); };
overrides.set("next/server", { NextResponse: { json: Response.json } });

function loadSource(path) {
  const filename = path.endsWith(".ts") ? path : path + ".ts";
  if (modules.has(filename)) return modules.get(filename).exports;
  const compiledModule = { exports: {} };
  modules.set(filename, compiledModule);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const require = (name) => {
    const target = name.startsWith("@/") ? resolve(root, name.slice(2)) : name.startsWith(".") ? resolve(dirname(filename), name) : null;
    if (overrides.has(target ?? name)) return overrides.get(target ?? name);
    return target ? loadSource(target) : nativeRequire(name);
  };
  runInThisContext("(function(require,module,exports){" + code + "\n})", { filename })(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const phrase = {
  ...loadSource(resolve(root, "lib/starter-phrases")).STARTER_PHRASES[0],
  id: "10000000-0000-4000-8000-000000000001",
  shouldDrill: false,
};
const request = (path, method, body, token = "test-token") => new Request("http://localhost" + path, {
  method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const entered = Promise.withResolvers();
const gate = Promise.withResolvers();
let failSave = false;
overrides.set(resolve(root, "infrastructure/server/usage-limits"), { identifyRequestActor: async () => ({}) });
overrides.set(resolve(root, "infrastructure/server/phrase-cloud-storage"), {
  createPhraseCloudStorage: () => ({ savePhrase: async () => {
    entered.resolve();
    await gate.promise;
    if (failSave) throw new Error("simulated storage failure");
  } }),
});
const saveRoute = loadSource(resolve(root, "app/api/phrase/save-pack/route"));
let returned = false;
const saving = saveRoute.POST(request("/api/phrase/save-pack", "POST", { phrases: [phrase] })).then((response) => {
  returned = true;
  return response;
});
await entered.promise;
await new Promise((resolveTurn) => setImmediate(resolveTurn));
assert.equal(returned, false, "success must wait for persistence");
gate.resolve();
assert.deepEqual(await (await saving).json(), { ok: true, count: 1, synced: true });
failSave = true;
const failed = await saveRoute.POST(request("/api/phrase/save-pack", "POST", { phrases: [phrase] }));
assert.equal(failed.status, 503);
assert.deepEqual((await failed.json()).failedPhraseIds, [phrase.id]);
assert.equal((await saveRoute.POST(request("/api/phrase/save-pack", "POST", { phrases: [] }))).status, 400);

let snapshot = null;
overrides.set(resolve(root, "infrastructure/server/phrase-cloud-reader"), {
  createPhraseCloudReader: () => ({
    loadByAccessToken: async () => snapshot,
    loadByOwnerKey: async () => { assert.fail("invalid signed-in requests must not fall back to guest"); },
  }),
});
const repositoryPath = resolve(root, "infrastructure/server/supabase-phrase-repository");
let updatedExistingOnly = null;
overrides.set(repositoryPath, {
  replaceSupabasePhraseState: async (_token, _phrase, _item, existingOnly) => {
    updatedExistingOnly = existingOnly;
    return true;
  },
});
const route = loadSource(resolve(root, "app/api/phrases/route"));
assert.equal((await route.GET(request("/api/phrases", "GET"))).status, 401);
snapshot = { phrases: [], srsItems: [] };
assert.deepEqual(await (await route.GET(request("/api/phrases", "GET"))).json(), snapshot);
assert.equal((await route.PATCH(request("/api/phrases", "PATCH", { phrase, srsItem: null, existingOnly: true }))).status, 200);
assert.equal(updatedExistingOnly, true);
assert.equal((await route.PATCH(request("/api/phrases", "PATCH", { phrase, srsItem: null }, ""))).status, 401);

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
const operations = [];
let exists = false;
const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: "test-user" } }, error: null }) },
  from: (table) => {
    const operation = { table, filters: [] };
    const builder = {
      update: (value) => { Object.assign(operation, { kind: "update", value }); return builder; },
      upsert: (value) => { Object.assign(operation, { kind: "upsert", value }); return builder; },
      delete: () => { operation.kind = "delete"; return builder; },
      eq: (field, value) => { operation.filters.push([field, value]); return builder; },
      select: () => builder,
      then: (onFulfilled, onRejected) => {
        operations.push(operation);
        return Promise.resolve({ data: exists ? [{ id: phrase.id }] : [], error: null }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  },
};
overrides.delete(repositoryPath);
overrides.set("@supabase/supabase-js", { createClient: () => supabase });
const repository = loadSource(repositoryPath);
await assert.rejects(repository.replaceSupabasePhraseState("test-token", { ...phrase, id: "legacy-invalid-id" }, null), (error) => error.status === 400);
assert.equal(operations.length, 0, "invalid IDs are validation errors, not failed authentication or writes");
await assert.rejects(repository.replaceSupabasePhraseState("test-token", phrase, null, true), (error) => error.status === 409);
assert.equal(operations.length, 1);
assert.equal(operations[0].kind, "update", "deleted phrases must not be recreated with upsert");
operations.length = 0;
exists = true;
assert.equal(await repository.replaceSupabasePhraseState("test-token", phrase, null, true), true);
assert.equal(operations.filter((operation) => operation.kind === "update").length, 2);
assert.equal(operations.filter((operation) => operation.kind === "delete").length, 2);
for (const operation of operations) assert.ok(operation.filters.some(([field, value]) => field === "user_id" && value === "test-user"));
console.log("PASS save API: awaited persistence, failed save is non-success, validation, invalid auth is not empty cloud, existing-only update does not recreate deleted phrases, account scoping");
