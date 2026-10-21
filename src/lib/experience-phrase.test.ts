import assert from "node:assert/strict";
import test from "node:test";
import { buildGeneratedPhrase } from "./languages";
import { EXPERIENCE_MOCK_EXAMPLES, readExperiencePhraseResponse, validateExperiencePhraseOutput, validateExperiencePhraseRequest } from "./experience-phrase";

const input = { experienceText: EXPERIENCE_MOCK_EXAMPLES[0].text, targetLanguage: "en", nuance: "", previousPhrase: null };

test("experience request accepts only bounded Japanese-story and supported-target fields", () => {
  assert.deepEqual(validateExperiencePhraseRequest(input), input);
  for (const value of [null, [], { ...input, targetLanguage: "ja" }, { ...input, targetLanguage: "fr" }, { ...input, experienceText: " " }, { ...input, experienceText: "字".repeat(501) }, { ...input, persist: true }, { ...input, shouldDrill: true }, { ...input, nuance: "字".repeat(301) }]) assert.throws(() => validateExperiencePhraseRequest(value));
  assert.equal(validateExperiencePhraseRequest({ ...input, experienceText: "字".repeat(500) }).experienceText.length, 500);
});

test("refinement requires both bounded previous phrase fields and nuance", () => {
  const previousPhrase = { sourceText: "交換できますか？", targetText: "Could I exchange this?" };
  assert.deepEqual(validateExperiencePhraseRequest({ ...input, previousPhrase, nuance: "小さいサイズに" }).previousPhrase, previousPhrase);
  for (const value of [{ ...input, previousPhrase }, { ...input, nuance: "丁寧に" }, { ...input, previousPhrase: { ...previousPhrase, sourceText: "字".repeat(161) }, nuance: "丁寧に" }, { ...input, previousPhrase: { ...previousPhrase, secret: "unexpected" }, nuance: "丁寧に" }]) assert.throws(() => validateExperiencePhraseRequest(value));
});

test("generated contract rejects empty ready, oversized output and forged fields", () => {
  assert.deepEqual(validateExperiencePhraseOutput({ status: "insufficient_context", sourceText: "", targetText: "" }), { status: "insufficient_context", sourceText: "", targetText: "" });
  for (const value of [{ status: "ready", sourceText: "", targetText: "Hi" }, { status: "ready", sourceText: "字".repeat(161), targetText: "Hi" }, { status: "ready", sourceText: "はい", targetText: "x".repeat(501) }, { status: "ready", sourceText: "はい", targetText: "Hi", tool: "save" }, { status: "insufficient_context", sourceText: "はい", targetText: "Hi" }]) assert.throws(() => validateExperiencePhraseOutput(value));
});

test("client rejects malformed or wrong-language responses before showing or saving them", () => {
  const phrase = buildGeneratedPhrase({ direction: "ja-to-en", sourceText: "交換できますか？", targetText: "Could I exchange this?" });
  assert.equal(readExperiencePhraseResponse({ status: "ready", phrase, mock: true }, "en").status, "ready");
  assert.equal(readExperiencePhraseResponse({ status: "insufficient_context", mock: true }, "en").status, "insufficient_context");
  for (const value of [{ status: "ready", phrase }, { status: "ready", phrase: { ...phrase, japanese: input.experienceText }, mock: true }, { status: "ready", phrase: { ...phrase, targetText: "" }, mock: true }, { status: "ready", phrase: { ...phrase, targetLanguage: "zh" }, mock: true }]) assert.throws(() => readExperiencePhraseResponse(value, "en"));
});
