import assert from "node:assert/strict";
import test from "node:test";
import { isSupabasePersistableSchedule } from "./supabase-phrase-repository";

const uuid = "123e4567-e89b-12d3-a456-426614174000";

test("allows UUID-backed practice schedules to sync to Supabase", () => {
  assert.equal(isSupabasePersistableSchedule({ id: uuid }, { id: uuid }), true);
});

test("skips starter phrase schedules because Supabase ID columns are UUIDs", () => {
  assert.equal(
    isSupabasePersistableSchedule(
      { id: "starter-002-japanese" },
      { id: "starter-002-japanese" },
    ),
    false,
  );
});

test("skips schedules when only the SRS item ID is not a UUID", () => {
  assert.equal(
    isSupabasePersistableSchedule({ id: uuid }, { id: "starter-002-japanese" }),
    false,
  );
});
