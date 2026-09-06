import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "../tmp/backup-restore-runtime/node_modules/@electric-sql/pglite/dist/index.js";

let database;
let stage = "input";
try {
  let input = "";
  for await (const chunk of process.stdin) input += chunk.toString("utf8");
  const snapshot = JSON.parse(input);
  assert.equal(snapshot.format, "phrabit-cloud-learning-backup-v1");
  assert.equal(snapshot.projectRef, "whuatcawoezfrvzplmri");
  const tables = ["phrases", "srs_items", "saved_phrases", "drill_items", "phrase_categories"];
  assert.deepEqual(Object.keys(snapshot.tables).sort(), [...tables].sort());
  stage = "schema";
  database = new PGlite();
  await database.exec("set timezone = 'UTC'; create schema auth; create table auth.users (id uuid primary key);");
  const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  const learningSchema = schema.split("create table if not exists public.ai_usage_events")[0]
    .replace('create extension if not exists "pgcrypto";', "");
  assert.equal((learningSchema.match(/create table if not exists public\./g) ?? []).length, 5);
  await database.exec(learningSchema);
  const userIds = [...new Set(tables.flatMap(table => snapshot.tables[table].map(row => row.user_id)))];
  await database.query("insert into auth.users select value::uuid from jsonb_array_elements_text($1::jsonb)", [JSON.stringify(userIds)]);
  const counts = {};
  for (const table of tables) {
    stage = `restore:${table}`;
    const rows = snapshot.tables[table];
    assert.ok(Array.isArray(rows));
    const columns = await database.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by column_name", [table]);
    const columnNames = columns.rows.map(column => column.column_name);
    for (const row of rows) assert.deepEqual(Object.keys(row).sort(), columnNames);
    await database.query(`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table}, $1::jsonb)`, [JSON.stringify(rows)]);
    stage = `compare:${table}`;
    const result = await database.query(`
      with expected as (select value as row_data from jsonb_array_elements($1::jsonb)),
      actual as (select to_jsonb(stored) as row_data from public.${table} stored),
      differences as (
        (select row_data from expected except all select row_data from actual)
        union all
        (select row_data from actual except all select row_data from expected)
      )
      select (select count(*)::int from actual) as count,
        (select count(*)::int from differences) as differences
    `, [JSON.stringify(rows)]);
    assert.equal(result.rows[0].count, rows.length);
    assert.equal(result.rows[0].differences, 0);
    counts[table] = result.rows[0].count;
  }
  await database.close();
  database = null;
  process.stdout.write(JSON.stringify({ verified: true, engine: "PGlite 0.5.8 (in-memory)", tableCounts: counts, exactJsonbMatch: true, authRestored: false, cloudWrites: false }));
} catch {
  process.stderr.write(JSON.stringify({ verified: false, stage }));
  process.exitCode = 1;
} finally {
  if (database) await database.close().catch(() => {});
}
