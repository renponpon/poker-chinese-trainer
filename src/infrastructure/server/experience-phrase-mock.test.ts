import assert from "node:assert/strict";
import test from "node:test";
import { EXPERIENCE_MOCK_EXAMPLES, validateExperiencePhraseRequest } from "../../lib/experience-phrase";
import { createExperienceMockResponse, isExperienceMockEnabled } from "./experience-phrase-mock";

test("mock must be explicitly enabled in development, never production", () => {
  assert.equal(isExperienceMockEnabled({ NODE_ENV: "development", PHRABIT_EXPERIENCE_MOCK: "1" }), true);
  for (const environment of [{}, { NODE_ENV: "development" }, { NODE_ENV: "production", PHRABIT_EXPERIENCE_MOCK: "1" }, { NODE_ENV: "test", PHRABIT_EXPERIENCE_MOCK: "1" }]) assert.equal(isExperienceMockEnabled(environment), false);
});

test("all mock examples return a single paired phrase without persisting the story", () => {
  for (const targetLanguage of ["en", "zh"] as const) {
    for (const sample of EXPERIENCE_MOCK_EXAMPLES) {
      const result = createExperienceMockResponse(validateExperiencePhraseRequest({ experienceText: sample.text, targetLanguage }));
      assert.equal(result.mock, true);
      assert.equal(result.status, "ready");
      if (result.status !== "ready") throw new Error("Expected fixture");
      assert.notEqual(result.phrase.sourceText, sample.text);
      assert.equal(result.phrase.sourceText, result.phrase.japanese);
      assert.equal(result.phrase.direction, `ja-to-${targetLanguage}`);
      assert.equal(Boolean(result.phrase.reading), targetLanguage === "zh");
      assert.equal(result.phrase.explanation, "");
      assert.equal(JSON.stringify(result).includes(sample.text), false);
    }
  }
});

test("refining an example changes Japanese and target together without changing the story", () => {
  for (const targetLanguage of ["en", "zh"] as const) {
    const input = validateExperiencePhraseRequest({ experienceText: EXPERIENCE_MOCK_EXAMPLES[0].text, targetLanguage, nuance: "小さいサイズに", previousPhrase: { sourceText: "別のサイズに交換できますか？", targetText: "Previous sample" } });
    const result = createExperienceMockResponse(input);
    assert.equal(result.status, "ready");
    if (result.status !== "ready") throw new Error("Expected fixture");
    assert.equal(result.phrase.sourceText, "小さいサイズに交換できますか？");
    assert.match(result.phrase.targetText, targetLanguage === "en" ? /smaller/ : /小/);
    assert.equal(input.experienceText, EXPERIENCE_MOCK_EXAMPLES[0].text);
  }
});

test("mock preserves the missing-refund fact together with a request to check", () => {
  const result = createExperienceMockResponse(validateExperiencePhraseRequest({ experienceText: EXPERIENCE_MOCK_EXAMPLES[2].text, targetLanguage: "en" }));
  assert.equal(result.status, "ready");
  if (result.status !== "ready") throw new Error("Expected fixture");
  assert.match(result.phrase.sourceText, /まだ返金.*状況/);
  assert.match(result.phrase.targetText, /haven't received.*check/);
});

test("a second tone refinement retains the size from the preceding mock phrase", () => {
  for (const targetLanguage of ["en", "zh"] as const) {
    const result = createExperienceMockResponse(validateExperiencePhraseRequest({ experienceText: EXPERIENCE_MOCK_EXAMPLES[0].text, targetLanguage, nuance: "もっと丁寧に", previousPhrase: { sourceText: "小さいサイズに交換できますか？", targetText: "Previous smaller-size sample" } }));
    if (result.status !== "ready") throw new Error("Expected fixture");
    assert.match(result.phrase.sourceText, /恐れ入りますが、小さいサイズ/);
    assert.match(result.phrase.targetText, targetLanguage === "en" ? /smaller/ : /小一码/);
  }
});

test("insufficient context yields no phrase and unsupported mock input never invents one", () => {
  assert.deepEqual(createExperienceMockResponse(validateExperiencePhraseRequest({ experienceText: "今日は店で困った", targetLanguage: "en" })), { status: "insufficient_context", mock: true });
  assert.throws(() => createExperienceMockResponse(validateExperiencePhraseRequest({ experienceText: "この未登録の出来事を翻訳して", targetLanguage: "en" })));
});
