import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "../tmp/backup-restore-runtime/node_modules/@electric-sql/pglite/dist/index.js";

const root = resolve("src");
const nativeRequire = createRequire(resolve("package.json"));
const modules = new Map();
const overrides = new Map();
const database = new PGlite();
const storage = new Map();
const callbacks = [];
const requests = [];
const pendingRequests = [];
let createdAt = "2026-09-07T03:00:00Z";
const campaignRef = "readiness_living_20260907";
overrides.set("next/server", { NextResponse: { json: Response.json } });
overrides.set(resolve(root, "lib/auth-headers"), { getAuthHeaders: async () => ({}) });
overrides.set(resolve(root, "infrastructure/server/usage-limits"), {
  identifyRequestActor: async () => ({ type: "guest", userId: null, ipHash: null }),
});
overrides.set(resolve(root, "infrastructure/server/usage-event-recorder"), {
  recordProductAnalyticsEvent: async (event) => {
    await database.query(`insert into public.product_analytics_events
      (request_id,actor_type,session_id,event_name,route,source_page,success,score,created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [event.requestId,event.actorType,event.sessionId,event.eventName,event.route,event.sourcePage,event.success,event.score,createdAt]);
    return true;
  },
});

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

try {
  await database.exec("create schema auth; create table auth.users (id uuid primary key);");
  const schema = readFileSync("supabase/schema.sql", "utf8").match(/create table if not exists public\.product_analytics_events \([\s\S]*?\n\);/)[0];
  await database.exec(schema);
  const { normalizeAnalyticsRoute, normalizeCampaignRef } = loadSource(resolve(root, "lib/product-analytics-route"));
  const phraseIds = Array.from({ length: 3 }, () => crypto.randomUUID()).join(",");
  const oldRoute = `/drill?phrases=${phraseIds}&ref=${campaignRef}`;
  assert.ok(!oldRoute.slice(0, 120).includes(campaignRef));
  assert.equal(normalizeAnalyticsRoute(oldRoute), `/drill?ref=${campaignRef}`);
  assert.equal(normalizeAnalyticsRoute("/?text=private&token=secret", campaignRef), `/?ref=${campaignRef}`);
  assert.equal(normalizeAnalyticsRoute("/?ref=current", "previous"), "/?ref=current");
  assert.equal(normalizeAnalyticsRoute("/?ref=bad%20ref", "previous"), "/");
  assert.equal(normalizeCampaignRef("x".repeat(81)), null);
  const bounded = normalizeAnalyticsRoute(`/${"a".repeat(200)}`, "b".repeat(80));
  assert.equal(bounded.length, 120);
  assert.ok(bounded.endsWith("b".repeat(80)));

  globalThis.window = {
    location: { pathname: "/", search: `?ref=${campaignRef}&text=private` },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    setTimeout: (callback) => callbacks.push(callback),
  };
  const api = loadSource(resolve(root, "app/api/analytics/event/route"));
  globalThis.fetch = (url, init) => {
    assert.equal(url, "/api/analytics/event");
    requests.push(JSON.parse(init.body));
    const pending = api.POST(new Request(`https://phrabit.invalid${url}`, init));
    pendingRequests.push(pending);
    return pending;
  };
  const client = loadSource(resolve(root, "lib/product-analytics"));
  const send = async (eventName, success = true) => {
    client.recordProductAnalyticsEvent({ eventName, success });
    callbacks.shift()();
    await new Promise((finish) => setImmediate(finish));
    const responses = await Promise.all(pendingRequests.splice(0));
    assert.equal(responses.length, 1);
    for (const response of responses) assert.equal((await response.json()).tracked, true);
  };
  for (const eventName of ["page_view", "input_start", "translation_submit", "translation_success", "translation_refine_submit", "translation_refine_success", "translation_drill_save"]) await send(eventName);
  await send("translation_drill_save", false);
  const firstSession = requests[0].sessionId;
  window.location = { pathname: "/drill", search: `?phrases=${phraseIds}` };
  createdAt = "2026-09-08T03:00:00Z";
  await send("drill_open");
  await send("drill_answer");
  window.location = { pathname: "/", search: "" };
  await send("translation_success");
  await send("translation_drill_save");
  assert.ok(requests.every((request) => request.sessionId === firstSession));
  assert.ok(requests.every((request) => request.route.endsWith(`?ref=${campaignRef}`)));
  assert.ok(requests.every((request) => !request.route.includes("phrases=") && !request.route.includes("private")));
  const rows = (await database.query("select event_name,success,created_at::date::text as day,session_id,route from public.product_analytics_events")).rows;
  assert.equal(rows.filter((row) => row.event_name === "translation_drill_save" && row.success).length, 2);
  assert.equal(new Set(rows.filter((row) => row.event_name === "drill_answer" && row.day === "2026-09-08").map((row) => row.session_id)).size, 1);
  assert.equal(new Set(rows.map((row) => row.session_id)).size, 1);
  console.log("PASS: real client → API handler → temporary Postgres; referral survives long drill URL and simulated next-day revisit; failed saves excluded; no phrase IDs or arbitrary query text collected.");
} finally {
  await database.close();
  delete globalThis.window;
}
