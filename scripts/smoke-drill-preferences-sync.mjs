import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "../tmp/backup-restore-runtime/node_modules/@electric-sql/pglite/dist/index.js";

const database = new PGlite();
const account = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const nativeRequire = createRequire(resolve("package.json"));
const modules = new Map();
const checks = [];
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic";

async function owned(userId, action, role = "authenticated") {
  return database.transaction(async (transaction) => {
    await transaction.exec(`set local role ${role}`);
    await transaction.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return action(transaction);
  });
}

function clientFor(token) {
  const userId = token === "test-a" ? account : token === "test-b" ? other : null;
  return { auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: userId ? null : new Error("invalid") }) },
    from(table) {
      assert.equal(table, "drill_preferences");
      let payload = null;
      let filter = userId;
      const builder = {
        select() { return builder; }, eq(key, value) { assert.equal(key, "user_id"); filter = value; return builder; },
        upsert(value) { payload = value; return builder; },
        single() { return builder; }, maybeSingle() { return builder; },
        then(fulfilled, rejected) {
          return owned(userId, async (transaction) => {
            try {
              const result = payload ? await transaction.query("insert into public.drill_preferences(user_id,question_limit) values($1,$2) on conflict(user_id) do update set question_limit=excluded.question_limit returning question_limit", [payload.user_id, payload.question_limit])
                : await transaction.query("select question_limit from public.drill_preferences where user_id=$1", [filter]);
              return { data: result.rows[0] ?? null, error: null };
            } catch (error) { return { data: null, error }; }
          }).then(fulfilled, rejected);
        },
      };
      return builder;
    } };
}

function loadSource(path) {
  const filename = path.endsWith(".ts") ? path : path + ".ts";
  if (modules.has(filename)) return modules.get(filename).exports;
  const compiled = { exports: {} };
  modules.set(filename, compiled);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const require = (name) => {
    if (name === "next/server") return { NextResponse: { json: Response.json } };
    if (name === "@supabase/supabase-js") return { createClient: (_url, _key, options) => clientFor(options.global.headers.Authorization.replace("Bearer ", "")) };
    const target = name.startsWith("@/") ? resolve("src", name.slice(2)) : name.startsWith(".") ? resolve(dirname(filename), name) : null;
    return target ? loadSource(target) : nativeRequire(name);
  };
  runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(require, compiled, compiled.exports);
  return compiled.exports;
}

try {
  await database.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon; insert into auth.users values('${account}'),('${other}');`);
  const api = loadSource(resolve("src/app/api/drill-preferences/route"));
  const call = (token, body = {}, origin = "https://test.invalid") => {
    const request = new Request("https://test.invalid/api/drill-preferences", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin }, body: JSON.stringify(body) });
    request.nextUrl = new URL(request.url);
    return api.POST(request);
  };
  assert.equal((await call("test-a")).status, 503);
  await database.exec(readFileSync("supabase/migrations/20261030020125_add_drill_preferences.sql", "utf8"));
  assert.equal((await call("invalid")).status, 401);
  assert.equal((await call("test-a", {}, "https://attacker.invalid")).status, 403);
  assert.equal((await call("test-a", { limit: "x".repeat(1000) })).status, 413);
  for (const limit of [-1, 1000, 1.5, "7", null]) assert.equal((await call("test-a", { limit })).status, 400);
  assert.equal((await call("test-a", { userId: other, limit: 20 })).status, 400);
  checks.push("actual API rejects missing migration, invalid auth/origin/size/limit and injected owner");
  assert.equal((await (await call("test-a")).json()).limit, 5);
  for (const limit of [10, 20, 5, 0, 1, 7, 999]) {
    assert.equal((await (await call("test-a", { limit })).json()).limit, limit);
    assert.equal((await (await call("test-a")).json()).limit, limit);
  }
  assert.equal((await (await call("test-b")).json()).limit, 5);
  checks.push("actual repository writes and independent requests read presets/custom/unlimited; default read creates no row");
  await owned(other, async (transaction) => assert.equal((await transaction.query("select * from public.drill_preferences where user_id=$1", [account])).rows.length, 0));
  await assert.rejects(owned(other, (transaction) => transaction.query("insert into public.drill_preferences values($1,20)", [account])));
  await owned(other, async (transaction) => assert.equal((await transaction.query("update public.drill_preferences set question_limit=20 where user_id=$1 returning *", [account])).rows.length, 0));
  await assert.rejects(owned(account, (transaction) => transaction.query("update public.drill_preferences set user_id=$1 where user_id=$2", [other, account])));
  for (const limit of [-1, 1000]) await assert.rejects(owned(account, (transaction) => transaction.query("update public.drill_preferences set question_limit=$1", [limit])));
  await assert.rejects(owned(account, (transaction) => transaction.query("delete from public.drill_preferences")));
  await assert.rejects(owned("", (transaction) => transaction.query("select * from public.drill_preferences"), "anon"));
  checks.push("Postgres RLS/grants block cross-owner read/insert/update/reassignment, invalid values, delete and anon access");
  await database.query("delete from auth.users where id=$1", [account]);
  assert.equal((await database.query("select count(*)::int as count from public.drill_preferences")).rows[0].count, 0);
  checks.push("account deletion cascades settings; no changes to existing learning or phrase tables");
  writeFileSync(resolve("../release-artifacts/20261030-drill-controls/round-sync-results.json"), JSON.stringify({ checks, database: "local PGlite", transport: "mocked Supabase client", realSupabase: false, paidApiCalls: 0, productionChanges: 0 }, null, 2));
  console.log(checks.map((check) => `PASS ${check}`).join("\n"));
} finally { await database.close(); }
