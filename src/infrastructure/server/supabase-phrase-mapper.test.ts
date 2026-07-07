import assert from "node:assert/strict";
import test from "node:test";
import type { Phrase, SrsItem } from "../../lib/types";
import {
  defaultDrillItemRow,
  phraseToLegacyPhraseRow,
  phraseToSavedPhraseRow,
  rowToPhrase,
  rowToSrsItem,
  srsItemToDrillItemRow,
  srsItemToLegacySrsRow,
  type SavedPhraseRow,
} from "./supabase-phrase-mapper";

test("maps a saved phrase row without adding drill membership", () => {
  const row = makeSavedPhraseRow({
    source_language: null,
    target_language: null,
    source_text: null,
    target_text: null,
    reading: null,
    reading_type: null,
  });

  const phrase = rowToPhrase(row);

  assert.equal(phrase.shouldDrill, false);
  assert.equal(phrase.sourceLanguage, "ja");
  assert.equal(phrase.targetLanguage, "zh");
  assert.equal(phrase.sourceText, "hello");
  assert.equal(phrase.targetText, "ni hao");
  assert.equal(phrase.reading, "ni3 hao3");
  assert.equal(phrase.readingType, "pinyin");
});

test("maps drill membership from a drill item set", () => {
  const phrase = rowToPhrase(makeSavedPhraseRow(), true);

  assert.equal(phrase.shouldDrill, true);
});

test("maps a legacy phrase row using should_drill", () => {
  const phrase = rowToPhrase({
    ...makeSavedPhraseRow(),
    should_drill: true,
  });

  assert.equal(phrase.shouldDrill, true);
});

test("maps phrase domain objects to saved and legacy rows", () => {
  const phrase = makePhrase({ shouldDrill: true });
  const savedRow = phraseToSavedPhraseRow("user-1", phrase);
  const legacyRow = phraseToLegacyPhraseRow("user-1", phrase);

  assert.equal(savedRow.user_id, "user-1");
  assert.equal(savedRow.created_at, "2026-07-07T00:00:00.000Z");
  assert.equal("should_drill" in savedRow, false);
  assert.equal(legacyRow.should_drill, true);
});

test("maps drill and legacy SRS rows with ISO timestamps", () => {
  const reviewedAt = Date.parse("2026-07-06T00:00:00.000Z");
  const nextReviewAt = Date.parse("2026-07-08T00:00:00.000Z");
  const srsItem = makeSrsItem({ nextReviewAt, lastReviewedAt: reviewedAt });

  const legacyRow = srsItemToLegacySrsRow("user-1", srsItem);
  const drillRow = srsItemToDrillItemRow("user-1", "phrase-1", srsItem);

  assert.equal(legacyRow.phrase_id, "phrase-1");
  assert.equal(drillRow.saved_phrase_id, "phrase-1");
  assert.equal(legacyRow.next_review_at, "2026-07-08T00:00:00.000Z");
  assert.equal(drillRow.last_reviewed_at, "2026-07-06T00:00:00.000Z");
  assert.deepEqual(rowToSrsItem(drillRow), srsItem);
});

test("creates a default drill item row without a review schedule", () => {
  const row = defaultDrillItemRow("user-1", "phrase-1");

  assert.equal(row.saved_phrase_id, "phrase-1");
  assert.equal(row.user_id, "user-1");
  assert.equal(row.status, "new");
  assert.equal(row.next_review_at, null);
  assert.equal(row.interval_days, 0);
  assert.equal(row.ease_factor, 2.5);
});

function makeSavedPhraseRow(
  overrides: Partial<SavedPhraseRow> = {},
): SavedPhraseRow {
  return {
    id: "phrase-1",
    user_id: "user-1",
    japanese: "hello",
    chinese: "ni hao",
    pinyin: "ni3 hao3",
    source_language: "ja",
    target_language: "zh",
    source_text: "hello",
    target_text: "ni hao",
    reading: "ni3 hao3",
    reading_type: "pinyin",
    explanation: "greeting",
    audio_url: null,
    direction: "ja-to-zh",
    category_id: null,
    source: "manual",
    used_at: null,
    created_at: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

function makePhrase(input: Pick<Phrase, "shouldDrill">): Phrase {
  return {
    id: "phrase-1",
    japanese: "hello",
    chinese: "ni hao",
    pinyin: "ni3 hao3",
    sourceLanguage: "ja",
    targetLanguage: "zh",
    sourceText: "hello",
    targetText: "ni hao",
    reading: "ni3 hao3",
    readingType: "pinyin",
    explanation: "greeting",
    audioUrl: null,
    createdAt: "2026-07-07T00:00:00.000Z",
    direction: "ja-to-zh",
    categoryId: null,
    shouldDrill: input.shouldDrill,
    source: "manual",
    usedAt: null,
  };
}

function makeSrsItem(overrides: Partial<SrsItem> = {}): SrsItem {
  return {
    id: "phrase-1",
    status: "review",
    nextReviewAt: Date.parse("2026-07-08T00:00:00.000Z"),
    intervalDays: 2,
    easeFactor: 2.4,
    consecutiveGood: 3,
    lastScore: 2,
    lastReviewedAt: Date.parse("2026-07-06T00:00:00.000Z"),
    ...overrides,
  };
}
