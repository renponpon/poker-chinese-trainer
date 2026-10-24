import assert from "node:assert/strict";
import test from "node:test";
import { learningDayAt, learningDaySummary, validLearningDay, validTimeZone } from "./learning-days";

test("weekly Monday boundary, distinct days, both languages and repeated answers share one day", () => {
  const result = learningDaySummary(["2026-10-18", "2026-10-19", ...Array(10).fill("2026-10-24")], "2026-10-24");
  assert.equal(result.total, 3);
  assert.equal(result.weekly, 2);
  assert.equal(result.week[0].day, "2026-10-19");
  assert.equal(result.week[6].day, "2026-10-25");
  assert.equal(result.streak, 1);
});

test("today pending keeps yesterday's streak; a full missed day breaks only streak", () => {
  const days = ["2026-10-22", "2026-10-23"];
  assert.equal(learningDaySummary(days, "2026-10-24").streak, 2);
  assert.equal(learningDaySummary(days, "2026-10-24").learnedToday, false);
  assert.equal(learningDaySummary(days, "2026-10-25").streak, 0);
  assert.equal(learningDaySummary(days, "2026-10-25").total, 2);
});

test("year and leap-day transitions do not break consecutive days", () => {
  assert.equal(learningDaySummary(["2025-12-31", "2026-01-01"], "2026-01-02").streak, 2);
  assert.equal(learningDaySummary(["2024-02-28", "2024-02-29", "2024-03-01"], "2024-03-01").streak, 3);
  assert.equal(validLearningDay("2025-02-29"), false);
});

test("fixed timezone at midnight and daylight-saving transitions", () => {
  assert.equal(learningDayAt("2026-10-24T14:59:59Z", "Asia/Tokyo"), "2026-10-24");
  assert.equal(learningDayAt("2026-10-24T15:00:00Z", "Asia/Tokyo"), "2026-10-25");
  assert.equal(learningDayAt("2026-11-01T08:30:00Z", "America/Los_Angeles"), "2026-11-01");
  assert.equal(learningDayAt("2026-11-01T09:30:00Z", "America/Los_Angeles"), "2026-11-01");
  assert.equal(learningDayAt("2026-03-08T10:30:00Z", "America/Los_Angeles"), "2026-03-08");
  assert.equal(validTimeZone("bad/zone"), false);
  assert.equal(validTimeZone("+01:00"), false);
  assert.equal(validTimeZone("CST"), false);
});

test("unknown history, malformed and future days never inflate totals", () => {
  assert.equal(learningDaySummary([], "2026-10-24").total, 0);
  assert.equal(learningDaySummary(["bad", "2026-10-25", "2026-02-30"], "2026-10-24").total, 0);
});
