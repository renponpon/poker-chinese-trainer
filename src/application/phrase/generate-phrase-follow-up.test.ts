import assert from "node:assert/strict";
import test from "node:test";
import {
  generatePhraseFollowUp,
  normalizePhraseFollowUpRequest,
  PhraseFollowUpGenerationError,
  PhraseFollowUpRequestError,
} from "./generate-phrase-follow-up";

test("generates a phrase follow-up from model JSON", async () => {
  const result = await generatePhraseFollowUp({
    phraseId: "phrase-1",
    direction: "ja-to-zh",
    japanese: "hello",
    chinese: "ni hao",
    pinyin: "ni hao",
    generateText: async ({ prompt }) => {
      assert.match(prompt, /hello/);
      return '{"explanation":"explain"}';
    },
  });

  assert.equal(result.followUp.phraseId, "phrase-1");
  assert.equal(result.followUp.explanation, "explain");
  assert.equal(result.followUp.pinyin, undefined);
  assert.ok(result.inputChars > 0);
  assert.equal(result.outputChars, '{"explanation":"explain"}'.length);
});

test("keeps generated pinyin when the original phrase has no pinyin", async () => {
  let warned = false;

  const result = await generatePhraseFollowUp({
    phraseId: "phrase-1",
    direction: "ja-to-zh",
    japanese: "hello",
    chinese: "ni hao",
    pinyin: "",
    generateText: async () => '{"pinyin":"ni hao","explanation":"explain"}',
    onMissingPinyin: () => {
      warned = true;
    },
  });

  assert.equal(result.followUp.pinyin, "ni hao");
  assert.equal(warned, false);
});

test("throws a typed error for empty model output", async () => {
  await assert.rejects(
    () =>
      generatePhraseFollowUp({
        phraseId: "phrase-1",
        direction: "ja-to-zh",
        japanese: "hello",
        chinese: "ni hao",
        pinyin: "ni hao",
        generateText: async () => "",
      }),
    (error) =>
      error instanceof PhraseFollowUpGenerationError &&
      error.code === "empty_gemini_response",
  );
});

test("normalizes a phrase follow-up request from source and target text", () => {
  const result = normalizePhraseFollowUpRequest({
    phraseId: " phrase-1 ",
    direction: "zh-to-ja",
    sourceText: "你好",
    targetText: "こんにちは",
    reading: "ni hao",
  });

  assert.deepEqual(result, {
    phraseId: "phrase-1",
    direction: "zh-to-ja",
    japanese: "こんにちは",
    chinese: "你好",
    pinyin: "ni hao",
    sourceText: "你好",
    targetText: "こんにちは",
    reading: "ni hao",
  });
});

test("rejects an empty phrase follow-up request", () => {
  assert.throws(
    () => normalizePhraseFollowUpRequest({ phraseId: "phrase-1", direction: "ja-to-zh" }),
    (error) =>
      error instanceof PhraseFollowUpRequestError &&
      error.code === "validation_error" &&
      error.status === 400,
  );
});
