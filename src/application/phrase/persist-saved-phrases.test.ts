import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePersistSavedPhrasesRequest,
  persistSavedPhrases,
  PersistSavedPhrasesRequestError,
} from "./persist-saved-phrases";
import type { Phrase } from "../../lib/types";

test("persisting saved phrases records per-phrase failures without stopping the batch", async () => {
  const savedIds: string[] = [];
  const errors: string[] = [];

  const result = await persistSavedPhrases({
    phrases: [
      makePhrase("ok-1"),
      makePhrase("fail"),
      makePhrase("ok-2"),
    ],
    storage: {
      savePhrase: async (phrase) => {
        if (phrase.id === "fail") {
          throw new Error("storage failed");
        }
        savedIds.push(phrase.id);
      },
    },
    onError: (_error, phrase) => {
      errors.push(phrase.id);
    },
  });

  assert.deepEqual(savedIds, ["ok-1", "ok-2"]);
  assert.deepEqual(errors, ["fail"]);
  assert.deepEqual(result, {
    attempted: 3,
    succeeded: 2,
    failedPhraseIds: ["fail"],
  });
});

test("normalizes a save-pack request into saved phrases", () => {
  const result = normalizePersistSavedPhrasesRequest({
    ownerKey: " owner ",
    nickname: " nick ",
    phrases: [
      {
        id: " phrase-1 ",
        direction: "ja-to-zh",
        japanese: " jp ",
        chinese: " zh ",
        pinyin: " pin ",
        explanation: " explanation ",
        createdAt: " 2026-01-01T00:00:00.000Z ",
        shouldDrill: false,
      },
    ],
  });

  assert.equal(result.ownerKey, "owner");
  assert.equal(result.nickname, "nick");
  assert.deepEqual(result.phrases[0], {
    id: "phrase-1",
    japanese: "jp",
    chinese: "zh",
    pinyin: "pin",
    sourceLanguage: "ja",
    targetLanguage: "zh",
    sourceText: "jp",
    targetText: "zh",
    reading: "pin",
    readingType: "pinyin",
    explanation: "explanation",
    audioUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    direction: "ja-to-zh",
    categoryId: null,
    shouldDrill: false,
    source: "prototype",
    usedAt: null,
  });
});

test("rejects an empty save-pack request", () => {
  assert.throws(
    () => normalizePersistSavedPhrasesRequest({ phrases: [] }),
    (error) =>
      error instanceof PersistSavedPhrasesRequestError &&
      error.code === "validation_error" &&
      error.status === 400,
  );
});

function makePhrase(id: string): Phrase {
  return {
    id,
    japanese: id,
    chinese: id,
    pinyin: "",
    sourceLanguage: "ja",
    targetLanguage: "zh",
    sourceText: id,
    targetText: id,
    reading: "",
    readingType: "pinyin",
    explanation: "explanation",
    audioUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    direction: "ja-to-zh",
    categoryId: null,
    shouldDrill: true,
    source: "manual",
    usedAt: null,
  };
}
