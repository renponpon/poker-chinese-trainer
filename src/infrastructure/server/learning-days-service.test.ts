import assert from "node:assert/strict";
import test from "node:test";
import { synchronizeLearningDays, type LearningDaysRepository } from "./learning-days-service";

const account = "11111111-1111-4111-8111-111111111111";
const now = Date.parse("2026-10-24T03:00:00Z");
function event(occurredAt = "2026-10-24T01:00:00Z") { return { version: 1, operationId: crypto.randomUUID(), owner: account, occurredAt, timeZone: null }; }
function repository() {
  let zone: string | undefined;
  const days = new Set<string>();
  const storage: LearningDaysRepository = {
    initializeTimeZone: async (_, value) => zone ??= value,
    insertDays: async (_, entries) => { entries.forEach((entry) => days.add(entry.day)); },
    listDays: async () => [...days].sort(),
  };
  return storage;
}

test("two devices use shared first timezone, union offline days, retry is idempotent", async () => {
  const storage = repository();
  const first = event();
  const response = await synchronizeLearningDays(account, { timeZone: "Asia/Tokyo", events: [first, event()] }, storage, now);
  assert.deepEqual(response.days, ["2026-10-24"]);
  assert.equal(response.accepted.length, 2);
  const second = await synchronizeLearningDays(account, { timeZone: "America/Los_Angeles", events: [event("2026-10-22T16:00:00Z"), first] }, storage, now);
  assert.equal(second.timeZone, "Asia/Tokyo");
  assert.deepEqual(second.days, ["2026-10-23", "2026-10-24"]);
});

test("future timestamp and conflicting confirmed timezone are held, not corrected into another day", async () => {
  const future = event("2026-10-25T03:00:00Z");
  const conflict = { ...event(), timeZone: "UTC" };
  const response = await synchronizeLearningDays(account, { timeZone: "Asia/Tokyo", events: [future, conflict, event()] }, repository(), now);
  assert.deepEqual(response.rejected, [future.operationId, conflict.operationId]);
  assert.equal(response.accepted.length, 1);
});

test("invalid timezone, forged owner, duplicates and oversized batches are rejected before writes", async () => {
  const storage = repository();
  storage.initializeTimeZone = async () => { assert.fail("no write on invalid input"); };
  const duplicate = event();
  for (const body of [null, {}, { timeZone: "bad", events: [] }, { timeZone: "UTC", events: [{ ...event(), owner: "guest" }] }, { timeZone: "UTC", events: [duplicate, duplicate] }, { timeZone: "UTC", events: Array.from({ length: 101 }, () => event()) }]) {
    await assert.rejects(synchronizeLearningDays(account, body, storage, now), /invalid_request/);
  }
});

test("failed writes/read do not acknowledge pending days", async () => {
  for (const method of ["insertDays", "listDays"] as const) {
    const storage = repository();
    storage[method] = async () => { throw new Error("unavailable"); };
    await assert.rejects(synchronizeLearningDays(account, { timeZone: "UTC", events: [event()] }, storage, now));
  }
});
