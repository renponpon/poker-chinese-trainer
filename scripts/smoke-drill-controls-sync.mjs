import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "../tmp/backup-restore-runtime/node_modules/@electric-sql/pglite/dist/index.js";

const database = new PGlite();
const root = resolve("src");
const nativeRequire = createRequire(resolve("package.json"));
const modules = new Map();
const output = resolve("../release-artifacts/20261030-drill-controls");
const account = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const phraseId = "33333333-3333-4333-8333-333333333333";
const otherPhraseId = "44444444-4444-4444-8444-444444444444";
const tables = new Set(["saved_phrases", "phrases", "srs_items", "drill_items"]);
const checks = [];
globalThis.fetch = async () => { throw new Error("Network forbidden in local drill sync test"); };
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://drill-test.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-test-key";

async function asUser(user, operation) {
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
  await database.exec(`set role ${user ? "authenticated" : "anon"}`);
  try { return await operation(); } finally { await database.exec("reset role"); }
}

function clientFor(token) {
  const user = token === "test-a" ? account : token === "test-b" ? other : null;
  return {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: user ? null : { message: "invalid token" } }) },
    from(table) {
      assert.ok(tables.has(table));
      let mode = "select";
      let rows = [];
      let ignoreDuplicates = false;
      let columns = "*";
      const filters = [];
      let ordered = false;
      const builder = {
        upsert(value, options = {}) { mode = "upsert"; rows = Array.isArray(value) ? value : [value]; ignoreDuplicates = options.ignoreDuplicates; return builder; },
        update(value) { mode = "update"; rows = [value]; return builder; },
        delete() { mode = "delete"; return builder; },
        select(value = "*") { columns = value; assert.ok(["*", "id"].includes(columns)); return builder; },
        eq(key, value) { filters.push([key, [value]]); return builder; },
        in(key, values) { filters.push([key, values]); return builder; },
        order(key) { assert.equal(key, "created_at"); ordered = true; return builder; },
        async then(fulfilled, rejected) {
          const result = await asUser(user, async () => {
            try {
              const parameters = [];
              const where = filters.map(([key, values]) => {
                assert.ok(["id", "user_id", "phrase_id", "saved_phrase_id"].includes(key));
                return `${key} in (${values.map((value) => { parameters.push(value); return `$${parameters.length}`; }).join(",")})`;
              }).join(" and ");
              let result;
              if (mode === "upsert") {
                for (const row of rows) {
                  const entries = Object.entries(row).filter(([, value]) => value !== undefined);
                  const keys = entries.map(([key]) => key);
                  assert.ok(keys.every((key) => /^[a-z_]+$/.test(key)));
                  const primary = table === "srs_items" ? "phrase_id" : table === "drill_items" ? "saved_phrase_id" : "id";
                  const conflict = ignoreDuplicates ? "do nothing" : `do update set ${keys.filter((key) => key !== primary).map((key) => `${key}=excluded.${key}`).join(",")}`;
                  result = await database.query(`insert into public.${table} (${keys.join(",")}) values (${keys.map((_, index) => `$${index + 1}`).join(",")}) on conflict (${primary}) ${conflict} returning *`, entries.map(([, value]) => value));
                }
              } else if (mode === "update") {
                const sets = Object.entries(rows[0]).filter(([, value]) => value !== undefined).map(([key, value]) => { assert.match(key, /^[a-z_]+$/); parameters.push(value); return `${key}=$${parameters.length}`; });
                result = await database.query(`update public.${table} set ${sets.join(",")} ${where ? `where ${where}` : ""} returning ${columns}`, parameters);
              } else {
                result = await database.query(`${mode === "delete" ? "delete" : `select ${columns}`} from public.${table} ${where ? `where ${where}` : ""}${ordered ? " order by created_at desc" : ""}${mode === "delete" ? " returning *" : ""}`, parameters);
              }
              return { data: result?.rows ?? [], error: null };
            } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
          });
          return Promise.resolve(result).then(fulfilled, rejected);
        },
      };
      return builder;
    },
  };
}

function loadSource(path) {
  const filename = path.endsWith(".ts") ? path : path + ".ts";
  if (modules.has(filename)) return modules.get(filename).exports;
  const compiledModule = { exports: {} };
  modules.set(filename, compiledModule);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const require = (name) => {
    if (name === "next/server") return { NextResponse: { json: Response.json } };
    if (name === "@supabase/supabase-js") return { createClient: (_url, _key, options) => clientFor(options?.global?.headers?.Authorization?.replace("Bearer ", "")) };
    const target = name.startsWith("@/") ? resolve(root, name.slice(2)) : name.startsWith(".") ? resolve(dirname(filename), name) : null;
    return target ? loadSource(target) : nativeRequire(name);
  };
  runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

try {
  await database.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated, anon; insert into auth.users values ('${account}'),('${other}');`);
  const baseline = execFileSync("git", ["show", "HEAD:supabase/schema.sql"], { encoding: "utf8" });
  await database.exec(baseline.replace('create extension if not exists "pgcrypto";', ""));
  await database.exec("grant select, insert, update, delete on public.phrases,public.srs_items to authenticated;");
  const api = loadSource(resolve(root, "app/api/phrases/route"));
  const call = (method, token, body) => api[method](new Request("https://test.invalid/api/phrases", { method, headers: token ? { authorization: `Bearer ${token}`, "content-type": "application/json" } : {}, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
  const basePhrase = { ...loadSource(resolve(root, "lib/starter-phrases")).STARTER_PHRASES[0], id: phraseId, source: "manual", shouldDrill: true, drillPriority: true };
  const srsItem = { id: phraseId, status: "review", lastScore: 2, lastReviewedAt: Date.parse("2026-10-29T01:00:00Z"), nextReviewAt: Date.parse("2026-10-30T01:00:00Z"), intervalDays: 1, easeFactor: 2.5, consecutiveGood: 1 };
  assert.equal((await call("POST", "test-a", { phrases: [basePhrase], srsItems: [srsItem] })).status, 500);
  assert.equal((await database.query("select count(*)::int as count from public.saved_phrases")).rows[0].count, 0);
  checks.push("missing migration fails closed instead of losing settings");
  const migration = readFileSync("supabase/migrations/20261030003436_add_drill_priority_and_membership.sql", "utf8");
  await database.exec(migration);
  await database.exec(migration);
  assert.equal((await call("POST", "", { phrases: [basePhrase], srsItems: [] })).status, 401);
  assert.equal((await call("PATCH", "invalid", { phrase: basePhrase })).status, 401);
  assert.equal((await call("POST", "test-a", { phrases: [basePhrase], srsItems: [srsItem] })).status, 200);
  await database.query("update public.saved_phrases set should_drill=null where id=$1", [phraseId]);
  assert.equal((await (await call("GET", "test-a")).json()).phrases[0].shouldDrill, true);
  checks.push("migration idempotent; legacy null membership follows existing schedule");
  assert.equal((await call("PATCH", "test-a", { phrase: { ...basePhrase, shouldDrill: false }, srsItem, existingOnly: true })).status, 200);
  const secondDevice = await (await call("GET", "test-a")).json();
  assert.equal(secondDevice.phrases[0].shouldDrill, false);
  assert.equal(secondDevice.phrases[0].drillPriority, true);
  assert.deepEqual(secondDevice.srsItems, [srsItem]);
  assert.equal((await (await call("GET", "test-b")).json()).phrases.length, 0);
  checks.push("same-account read preserves pause, star, Bad/Good and nextReviewAt; other account sees no phrases");
  const oldClientPhrase = { ...secondDevice.phrases[0] };
  delete oldClientPhrase.drillPriority;
  assert.equal((await call("PATCH", "test-a", { phrase: oldClientPhrase, existingOnly: true })).status, 200);
  assert.equal((await (await call("GET", "test-a")).json()).phrases[0].drillPriority, true);
  assert.equal((await (await call("GET", "test-a")).json()).srsItems.length, 1);
  assert.equal((await call("PATCH", "test-a", { phrase: { ...basePhrase, drillPriority: false }, srsItem, existingOnly: true })).status, 200);
  const resumed = await (await call("GET", "test-a")).json();
  assert.equal(resumed.phrases[0].shouldDrill, true);
  assert.equal(resumed.phrases[0].drillPriority, false);
  assert.deepEqual(resumed.srsItems, [srsItem]);
  checks.push("older client omission does not clear star/progress; explicit unstar and resume round trip");
  assert.equal((await call("POST", "test-b", { phrases: [{ ...basePhrase, id: otherPhraseId }], srsItems: [] })).status, 200);
  assert.equal((await call("PATCH", "test-b", { phrase: basePhrase, srsItem, existingOnly: true })).status, 409);
  await call("DELETE", "test-b", { phraseIds: [phraseId] });
  assert.equal((await (await call("GET", "test-a")).json()).phrases.length, 1);
  assert.equal((await call("DELETE", "test-a", { phraseIds: [phraseId] })).status, 200);
  const deleted = await (await call("GET", "test-a")).json();
  assert.deepEqual(deleted, { phrases: [], srsItems: [] });
  assert.equal((await (await call("GET", "test-b")).json()).phrases.length, 1);
  assert.equal((await call("PATCH", "test-a", { phrase: basePhrase, srsItem, existingOnly: true })).status, 409);
  checks.push("RLS protects cross-account update/delete; own delete removes both stores and progress; stale update cannot revive");
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, "sync-results.json"), JSON.stringify({ engine: "PGlite in-memory with actual schema, RLS, API normalizers and repository; Supabase transport emulated", checks, productionChanges: 0, paidApiCalls: 0 }, null, 2));
  console.log(checks.map((check) => `PASS ${check}`).join("\n"));
} finally { await database.close(); }
