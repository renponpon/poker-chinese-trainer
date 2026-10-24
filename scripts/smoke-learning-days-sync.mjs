import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "../tmp/backup-restore-runtime/node_modules/@electric-sql/pglite/dist/index.js";

const root = resolve("src");
const nativeRequire = createRequire(resolve("package.json"));
const modules = new Map();
const overrides = new Map([["next/server", { NextResponse: { json: Response.json } }]]);
const database = new PGlite();
const account = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
const output = resolve("../release-artifacts/20261024-learning-days");
mkdirSync(output, { recursive: true });
const checks = [];

function loadSource(path) {
  const filename = path.endsWith(".ts") ? path : `${path}.ts`;
  if (modules.has(filename)) return modules.get(filename).exports;
  const compiledModule = { exports: {} };
  modules.set(filename, compiledModule);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const require = (name) => {
    const target = name.startsWith("@/") ? resolve(root, name.slice(2)) : name.startsWith(".") ? resolve(dirname(filename), name) : null;
    if (overrides.has(target ?? name)) return overrides.get(target ?? name);
    return target ? loadSource(target) : nativeRequire(name);
  };
  runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

async function asUser(user, operation) {
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await database.exec("set role authenticated");
  try { return await operation(); } finally { await database.exec("reset role"); }
}

function clientFor(user) {
  return { from(table) {
    assert.ok(["learning_days", "learning_preferences"].includes(table));
    let rows;
    let columns = "*";
    let owner = user;
    let offset = 0;
    let limit = 1000;
    let single = false;
    const builder = {
      upsert(value, options) { assert.equal(options.ignoreDuplicates, true); rows = Array.isArray(value) ? value : [value]; return builder; },
      select(value) { columns = value; return builder; },
      eq(column, value) { assert.equal(column, "user_id"); owner = value; return builder; },
      single() { single = true; return builder; },
      order(column) { assert.equal(column, "learning_day"); return builder; },
      range(start, end) { offset = start; limit = end - start + 1; return builder; },
      async then(fulfilled, rejected) {
        const result = await asUser(user, async () => {
          try {
            if (rows) {
              for (const row of rows) {
                const keys = Object.keys(row);
                await database.query(`insert into public.${table} (${keys.join(",")}) values (${keys.map((_, index) => `$${index + 1}`).join(",")}) on conflict do nothing`, Object.values(row));
              }
              return { data: null, error: null };
            }
            const result = await database.query(`select ${columns} from public.${table} where user_id=$1 ${table === "learning_days" ? "order by learning_day" : ""} limit $2 offset $3`, [owner, limit, offset]);
            const data = result.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString().slice(0, 10) : value])));
            return { data: single ? data[0] : data, error: null };
          } catch (error) { return { data: null, error: { message: error.message } }; }
        });
        return Promise.resolve(result).then(fulfilled, rejected);
      },
    };
    return builder;
  } };
}

function device() {
  const values = new Map();
  const storage = { get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  storage.setItem("phrabit-account-cache-owner-v1", account);
  storage.setItem("poker-chinese-srs-v1", JSON.stringify([{ id: "test-phrase", status: "new", nextReviewAt: 0, intervalDays: 0, easeFactor: 2.5, consecutiveGood: 0, lastScore: null, lastReviewedAt: null }]));
  return { values, use() { globalThis.window = Object.assign(new EventTarget(), { localStorage: storage, location: { origin: "https://test.example" } }); } };
}

try {
  await database.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    insert into auth.users values ('${account}'),('${stranger}');`);
  await database.exec(readFileSync("supabase/migrations/20261024041938_add_learning_days.sql", "utf8"));
  const adapter = loadSource(resolve(root, "infrastructure/server/supabase-learning-days-repository"));
  overrides.set(resolve(root, "infrastructure/server/supabase-learning-days-repository"), {
    learningDaysRepositoryForToken: async (token) => token === "test-token" ? { userId: account, repository: adapter.createLearningDaysRepository(clientFor(account)) } : null,
  });
  const api = loadSource(resolve(root, "app/api/learning-days/route"));
  const { syncLearningDays } = loadSource(resolve(root, "lib/learning-days-sync"));
  const { loadLearningSnapshot } = loadSource(resolve(root, "infrastructure/local/learning-days-storage"));
  const { recordLearningPractice } = loadSource(resolve(root, "infrastructure/local/record-learning-practice"));
  const makeRequest = (init) => {
    const request = new Request("https://test.example/api/learning-days", init);
    request.nextUrl = new URL(request.url);
    return request;
  };
  const requests = [];
  const transport = async (url, init) => {
    assert.equal(url, "/api/learning-days");
    const payload = JSON.parse(init.body);
    assert.equal(JSON.stringify(payload).includes("test-phrase"), false, "no phrase content/id sent");
    requests.push(payload);
    return api.POST(makeRequest(init));
  };
  assert.equal((await api.POST(makeRequest({ method: "POST", body: "{}" }))).status, 401);
  assert.equal((await api.POST(makeRequest({ method: "POST", headers: { authorization: "Bearer invalid" }, body: "{}" }))).status, 401);
  assert.equal((await api.POST(makeRequest({ method: "POST", headers: { authorization: "Bearer test-token", origin: "https://evil.invalid" }, body: "{}" }))).status, 403);
  assert.equal((await api.POST(makeRequest({ method: "POST", headers: { authorization: "Bearer test-token" }, body: JSON.stringify({ timeZone: "UTC", events: [{ owner: stranger }] }) }))).status, 400);
  checks.push("route: missing/invalid auth, origin, forged owner rejected");
  const first = device();
  const second = device();
  const practice = (timestamp) => recordLearningPractice({ items: JSON.parse(window.localStorage.getItem("poker-chinese-srs-v1")), phraseId: "test-phrase", owner: account, score: 1, eligible: true, reviewedAt: Date.parse(timestamp) });
  first.use();
  practice("2026-10-21T03:00:00Z");
  await syncLearningDays(account, "test-token", transport);
  assert.equal(loadLearningSnapshot().pending, 0);
  second.use();
  practice("2026-10-21T04:00:00Z");
  await syncLearningDays(account, "test-token", transport);
  assert.equal(loadLearningSnapshot().days.length, 1);
  practice("2026-10-22T04:00:00Z");
  await assert.rejects(syncLearningDays(account, "test-token", async (...args) => {
    await transport(...args);
    throw new Error("lost response after server commit");
  }));
  assert.equal(loadLearningSnapshot().pending, 1);
  const lostId = requests.at(-1).events[0].operationId;
  await syncLearningDays(account, "test-token", transport);
  assert.equal(requests.at(-1).events[0].operationId, lostId);
  assert.equal(loadLearningSnapshot().pending, 0);
  assert.equal(loadLearningSnapshot().days.length, 2);
  first.use();
  await syncLearningDays(account, "test-token", transport);
  assert.equal(loadLearningSnapshot().days.length, 2);
  checks.push("two devices: same-day dedup, offline union, lost-response retry, identical dates");
  assert.equal((await database.query("select count(*)::int as count from public.learning_days")).rows[0].count, 2);
  await asUser(stranger, async () => {
    assert.equal((await database.query("select * from public.learning_days")).rows.length, 0);
    await assert.rejects(database.query("insert into public.learning_preferences (user_id,time_zone) values ($1,'UTC')", [account]));
    await assert.rejects(database.query("insert into public.learning_days (user_id,learning_day,occurred_at,time_zone) values ($1,'2026-10-20','2026-10-20T00:00Z','UTC')", [account]));
  });
  await asUser(account, async () => {
    await assert.rejects(database.query("update public.learning_preferences set time_zone='UTC'"));
    await assert.rejects(database.query("delete from public.learning_days"));
    await assert.rejects(database.query("insert into public.learning_days (user_id,learning_day,occurred_at,time_zone) values ($1,'2026-10-20','2026-10-21T00:00Z','UTC')", [account]));
    await assert.rejects(database.query("insert into public.learning_days (user_id,learning_day,occurred_at,time_zone) values ($1,'2099-01-01','2099-01-01T00:00Z','UTC')", [account]));
  });
  await database.exec("set role anon");
  await assert.rejects(database.query("select * from public.learning_days"));
  await database.exec("reset role");
  checks.push("actual Postgres RLS: other-account read/write, anonymous, update/delete, date tampering, future timestamp blocked");
  await database.query("delete from auth.users where id=$1", [account]);
  assert.equal((await database.query("select count(*)::int as count from public.learning_days")).rows[0].count, 0);
  assert.equal((await database.query("select count(*)::int as count from public.learning_preferences")).rows[0].count, 0);
  checks.push("account deletion cascades both learning tables");
  writeFileSync(resolve(output, "sync-results.json"), JSON.stringify({ mode: "ephemeral PGlite; no Supabase network or production writes", checks }, null, 2));
  console.log(JSON.stringify({ passed: checks }, null, 2));
} finally { await database.close(); }
