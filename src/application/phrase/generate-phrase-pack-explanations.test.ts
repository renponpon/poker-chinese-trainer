import assert from "node:assert/strict";
import test from "node:test";
import {
  generatePhrasePackExplanationList,
  normalizePhrasePackExplanationRequest,
  PhrasePackExplanationRequestError,
} from "./generate-phrase-pack-explanations";

test("maps generated pack explanations back to phrase ids", async () => {
  const result = await generatePhrasePackExplanationList({
    phrases: [
      makePhrase("one", "a", "b"),
      makePhrase("two", "c", "d"),
    ],
    generateText: async () =>
      '{"explanations":[{"explanation":"first"},{"explanation":"second"}]}',
  });

  assert.equal(result[0]?.id, "one");
  assert.match(result[0]?.explanation ?? "", /first/);
  assert.equal(result[1]?.id, "two");
  assert.match(result[1]?.explanation ?? "", /second/);
});

test("normalizes phrase pack explanation request phrases", () => {
  const result = normalizePhrasePackExplanationRequest({
    packRequestId: " pack-1 ",
    phrases: [
      {
        id: " phrase-1 ",
        direction: "zh-to-en",
        japanese: "日本語",
        chinese: "中文",
        pinyin: "zhong wen",
        sourceLanguage: "invalid",
        targetLanguage: "invalid",
        readingType: "invalid",
      },
    ],
  });

  assert.equal(result.packRequestId, "pack-1");
  assert.deepEqual(result.phrases[0], {
    id: "phrase-1",
    direction: "zh-to-en",
    japanese: "日本語",
    chinese: "中文",
    pinyin: "zhong wen",
    sourceLanguage: "zh",
    targetLanguage: "en",
    sourceText: "中文",
    targetText: "中文",
    reading: "zhong wen",
    readingType: "pinyin",
  });
});

test("rejects invalid phrase pack explanation requests", () => {
  assert.throws(
    () => normalizePhrasePackExplanationRequest({ packRequestId: "pack-1", phrases: [] }),
    (error) =>
      error instanceof PhrasePackExplanationRequestError &&
      error.code === "validation_error" &&
      error.status === 400,
  );
});

function makePhrase(id: string, japanese: string, chinese: string) {
  return {
    id,
    direction: "ja-to-zh" as const,
    japanese,
    chinese,
    pinyin: "pin",
    sourceLanguage: "ja" as const,
    targetLanguage: "zh" as const,
    sourceText: japanese,
    targetText: chinese,
    reading: "pin",
    readingType: "pinyin" as const,
  };
}
