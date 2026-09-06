import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "../tmp/backup-restore-runtime/node_modules/@electric-sql/pglite/dist/index.js";

const database = new PGlite();
const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");
const originalSchema = await readSource("../supabase/migrations/20260627041307_add_product_analytics_events.sql");
const accessRules = await readSource("../supabase/migrations/20260707112716_restrict_analytics_event_client_access.sql");
const migration = await readSource("../supabase/migrations/20260906144252_expand_product_analytics_translation_events.sql");
const currentSchema = await readSource("../supabase/schema.sql");
const clientSource = await readSource("../src/lib/product-analytics.ts");
const apiSource = await readSource("../src/app/api/analytics/event/route.ts");
const newEvents = [
  "translation_refine_submit",
  "translation_refine_success",
  "translation_refine_failure",
  "translation_drill_save",
];
const extractStrings = (source) => [...source.matchAll(/["']([a-z_]+)["']/g)].map((match) => match[1]);
const clientEvents = extractStrings(clientSource.match(/type ProductEventName =([\s\S]*?);/)[1]);
const apiEvents = extractStrings(apiSource.match(/const EVENT_NAMES = new Set\(\[([\s\S]*?)\]\)/)[1]);
assert.deepEqual([...apiEvents].sort(), [...clientEvents].sort());
assert.equal(new Set(clientEvents).size, 12);
const oldEvents = clientEvents.filter((eventName) => !newEvents.includes(eventName));
const insertEvent = (eventName, requestId = eventName) => database.query(
  "insert into public.product_analytics_events (request_id, actor_type, event_name, route) values ($1, 'guest', $2, '/?ref=local_schema_test') returning *",
  [requestId, eventName],
);
const readRows = () => database.query("select * from public.product_analytics_events order by request_id");
const readSecurity = () => database.query(`
  select relrowsecurity, relacl::text,
    (select jsonb_agg(to_jsonb(policy) order by policy.policyname)
     from pg_policies policy
     where policy.schemaname = 'public' and policy.tablename = 'product_analytics_events') as policies
  from pg_class where oid = 'public.product_analytics_events'::regclass
`);

try {
  await database.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.ai_usage_events (id uuid primary key default gen_random_uuid());
    alter table public.ai_usage_events enable row level security;
  `);
  await database.exec(originalSchema);
  await database.exec(accessRules);
  for (const eventName of oldEvents) await insertEvent(eventName);
  for (const eventName of newEvents) {
    await assert.rejects(insertEvent(eventName), { code: "23514" });
  }
  const previousRows = (await readRows()).rows;
  const previousSecurity = (await readSecurity()).rows;
  await database.exec(migration);
  assert.deepEqual((await readRows()).rows, previousRows);
  assert.deepEqual((await readSecurity()).rows, previousSecurity);
  for (const eventName of newEvents) await insertEvent(eventName);
  assert.deepEqual((await readRows()).rows.map((row) => row.event_name).sort(), [...clientEvents].sort());
  const savedRows = (await readRows()).rows;
  await database.exec(migration);
  assert.deepEqual((await readRows()).rows, savedRows);
  assert.deepEqual((await readSecurity()).rows, previousSecurity);

  await assert.rejects(insertEvent("unknown_event"), { code: "23514" });
  await assert.rejects(insertEvent(null), { code: "23502" });
  await assert.rejects(database.exec("insert into public.product_analytics_events (request_id, actor_type, event_name, input_chars) values ('invalid', 'guest', 'translation_drill_save', -1)"), { code: "23514" });
  await assert.rejects(database.exec("insert into public.product_analytics_events (request_id, actor_type, event_name) values ('invalid', 'invalid', 'translation_drill_save')"), { code: "23514" });
  const constraint = await database.query("select convalidated from pg_constraint where conrelid = 'public.product_analytics_events'::regclass and conname = 'product_analytics_events_event_name_check'");
  assert.equal(constraint.rows[0].convalidated, true);
  for (const role of ["anon", "authenticated"]) {
    await database.exec(`set role ${role}`);
    try {
      await assert.rejects(insertEvent("translation_drill_save", role), { code: "42501" });
      await assert.rejects(readRows(), { code: "42501" });
    } finally {
      await database.exec("reset role");
    }
  }
  await database.exec("set role service_role");
  try {
    for (const eventName of newEvents) await insertEvent(eventName, `service_${eventName}`);
  } finally {
    await database.exec("reset role");
  }

  const cleanSchema = currentSchema.match(/create table if not exists public\.product_analytics_events \([\s\S]*?\n\);/)[0];
  const freshDatabase = new PGlite();
  try {
    await freshDatabase.exec("create schema auth; create table auth.users (id uuid primary key);");
    await freshDatabase.exec(cleanSchema);
    for (const eventName of clientEvents) {
      await freshDatabase.query("insert into public.product_analytics_events (request_id, actor_type, event_name) values ($1, 'guest', $1)", [eventName]);
    }
    await assert.rejects(freshDatabase.exec("insert into public.product_analytics_events (request_id, actor_type, event_name) values ('invalid', 'guest', 'unknown_event')"), { code: "23514" });
  } finally {
    await freshDatabase.close();
  }
  console.log("PASS: reproduced four rejected events; all 12 events accepted after migration and fresh schema; existing rows, RLS and grants unchanged; unknown events and client DB access rejected; repeat migration preserved rows.");
} finally {
  await database.close();
}
