import assert from "node:assert/strict";
import test from "node:test";
import {
  generatePersonalPhrasePack,
  type PhrasePackDraft,
} from "./generate-personal-phrase-pack";

test("generates a response pack with ids and output character count", async () => {
  let nextId = 1;

  const result = await generatePersonalPhrasePack({
    packSize: 2,
    initialTargetCount: 3,
    maxAttempts: 1,
    retryBuffer: 2,
    retryMinTargetCount: 4,
    existingTargets: [],
    createId: () => `phrase-${nextId++}`,
    isDuplicateTarget: (targetText, previousTargets) => previousTargets.includes(targetText),
    createInsufficientError: () => new Error("not enough"),
    generateCandidates: async () => [
      makeDraft({ japanese: "a", targetText: "bc", reading: "def" }),
      makeDraft({ japanese: "gh", targetText: "ij", reading: "" }),
    ],
  });

  assert.equal(result.outputChars, 10);
  assert.deepEqual(
    result.phrases.map((phrase) => ({
      id: phrase.id,
      targetText: phrase.targetText,
      explanation: phrase.explanation,
    })),
    [
      { id: "phrase-1", targetText: "bc", explanation: "" },
      { id: "phrase-2", targetText: "ij", explanation: "" },
    ],
  );
});

function makeDraft(input: {
  japanese: string;
  targetText: string;
  reading: string;
}): PhrasePackDraft {
  return {
    direction: "ja-to-zh",
    japanese: input.japanese,
    chinese: input.targetText,
    pinyin: input.reading,
    sourceLanguage: "ja",
    targetLanguage: "zh",
    sourceText: input.japanese,
    targetText: input.targetText,
    reading: input.reading,
    readingType: "pinyin",
    categoryId: "other",
  };
}
