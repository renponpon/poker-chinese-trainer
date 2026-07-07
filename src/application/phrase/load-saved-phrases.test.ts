import assert from "node:assert/strict";
import test from "node:test";
import {
  loadSavedPhrases,
  normalizeLoadSavedPhrasesRequest,
  type SavedPhraseSnapshot,
} from "./load-saved-phrases";

test("loading saved phrases prefers authenticated cloud storage", async () => {
  const authenticated = makeSnapshot("auth");
  const fallback = makeSnapshot("owner");

  const result = await loadSavedPhrases({
    accessToken: "token",
    ownerKey: "owner",
    storage: {
      loadByAccessToken: async () => authenticated,
      loadByOwnerKey: async () => fallback,
    },
  });

  assert.equal(result, authenticated);
});

test("loading saved phrases falls back to owner key when authenticated storage is unavailable", async () => {
  const fallback = makeSnapshot("owner");

  const result = await loadSavedPhrases({
    accessToken: "token",
    ownerKey: "owner",
    storage: {
      loadByAccessToken: async () => null,
      loadByOwnerKey: async () => fallback,
    },
  });

  assert.equal(result, fallback);
});

test("loading saved phrases returns an empty snapshot without any identity", async () => {
  const result = await loadSavedPhrases({
    accessToken: "",
    ownerKey: "",
    storage: {
      loadByAccessToken: async () => makeSnapshot("auth"),
      loadByOwnerKey: async () => makeSnapshot("owner"),
    },
  });

  assert.deepEqual(result, { phrases: [], srsItems: [] });
});

test("normalizes saved phrase loading request", () => {
  assert.deepEqual(normalizeLoadSavedPhrasesRequest({ ownerKey: " owner " }), {
    ownerKey: "owner",
  });
  assert.deepEqual(normalizeLoadSavedPhrasesRequest({ ownerKey: null }), {
    ownerKey: "",
  });
});

function makeSnapshot(id: string): SavedPhraseSnapshot {
  return {
    phrases: [
      {
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
        explanation: "",
        audioUrl: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        direction: "ja-to-zh",
        categoryId: null,
        shouldDrill: true,
        source: "manual",
        usedAt: null,
      },
    ],
    srsItems: [],
  };
}
