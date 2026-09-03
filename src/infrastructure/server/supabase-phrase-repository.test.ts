import assert from "node:assert/strict";
import test from "node:test";
import { isSupabasePersistableSchedule } from "./supabase-phrase-repository";
import {
  migrateStarterPhraseId,
  STARTER_PHRASES,
} from "../../lib/starter-phrases";

const uuid = "123e4567-e89b-12d3-a456-426614174000";

test("allows UUID-backed practice schedules to sync to Supabase", () => {
  assert.equal(isSupabasePersistableSchedule({ id: uuid }, { id: uuid }), true);
});

test("skips legacy starter phrase IDs because Supabase ID columns are UUIDs", () => {
  assert.equal(
    isSupabasePersistableSchedule(
      { id: "starter-002-japanese" },
      { id: "starter-002-japanese" },
    ),
    false,
  );
});

test("allows migrated starter phrase schedules to sync", () => {
  const starter = STARTER_PHRASES[0];
  assert.ok(starter);
  assert.equal(isSupabasePersistableSchedule(starter, { id: starter.id }), true);
});

test("migrates a legacy starter phrase ID to its stable UUID", () => {
  assert.equal(
    migrateStarterPhraseId("starter-001-really"),
    STARTER_PHRASES[0]?.id,
  );
});

test("skips schedules when only the SRS item ID is not a UUID", () => {
  assert.equal(
    isSupabasePersistableSchedule({ id: uuid }, { id: "starter-002-japanese" }),
    false,
  );
});
