import assert from "node:assert/strict";
import test from "node:test";
import { synchronizeDrillPreferences } from "./drill-preferences-service";
import type { DrillLimit } from "../../domain/practice/drill-preferences";

test("defaults only on missing row, validates limit and refuses owner injection", async () => {
  const values = new Map<string, DrillLimit>();
  const repository = { read: async (id: string) => values.get(id) ?? null, write: async (id: string, limit: DrillLimit) => { values.set(id, limit); return limit; } };
  assert.equal((await synchronizeDrillPreferences("alice", {}, repository)).limit, 5);
  for (const limit of [5, 10, 20, 0, 1, 7, 999]) {
    assert.equal((await synchronizeDrillPreferences("alice", { limit }, repository)).limit, limit);
    assert.equal((await synchronizeDrillPreferences("alice", {}, repository)).limit, limit);
  }
  assert.equal((await synchronizeDrillPreferences("bob", {}, repository)).limit, 5);
  for (const body of [{ limit: -1 }, { limit: 1000 }, { limit: 1.5 }, { limit: NaN }, { limit: Infinity }, { limit: "10" }, { userId: "bob", limit: 20 }, null, [], { limit: null }]) await assert.rejects(synchronizeDrillPreferences("alice", body, repository));
  await assert.rejects(synchronizeDrillPreferences("alice", {}, { ...repository, read: async () => { throw new Error("missing migration"); } }));
});
