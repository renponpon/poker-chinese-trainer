import assert from "node:assert/strict";
import test from "node:test";
import {
  generatePersonalPhrasePackForProfile,
  PERSONAL_PHRASE_PACK_SIZE,
  type CreatePersonalPhrasePackCandidateGeneratorInput,
} from "./generate-personal-phrase-pack-for-profile";
import type { PhrasePackDraft } from "./generate-personal-phrase-pack";
import type { GeneratePhrasePackAttempt } from "./generate-phrase-pack";
import type { PhrasePackProfile } from "../../lib/types";

test("generates a profile pack with the configured retry policy", async () => {
  let nextId = 1;
  const factoryInputs: CreatePersonalPhrasePackCandidateGeneratorInput[] = [];
  const attempts: GeneratePhrasePackAttempt[] = [];
  const profile: PhrasePackProfile = {
    scenes: ["restaurant"],
    level: "basic",
    tone: "natural",
    details: "ordering food",
  };

  const result = await generatePersonalPhrasePackForProfile({
    profile,
    targetLanguage: "zh",
    existingTargets: ["already-known"],
    createId: () => `phrase-${nextId++}`,
    createInsufficientError: () => new Error("not enough"),
    createCandidateGenerator: (input) => {
      factoryInputs.push(input);
      return async (attempt) => {
        attempts.push(attempt);
        if (attempt.attempt === 1) {
          return [
            makeDraft("alpha"),
            makeDraft("bravo"),
            makeDraft("charlie"),
            makeDraft("delta"),
            makeDraft("echo"),
            makeDraft("foxtrot"),
            makeDraft("golf"),
            makeDraft("hotel"),
            makeDraft("india"),
          ];
        }
        return [makeDraft("alpha"), makeDraft("juliet")];
      };
    },
  });

  const factoryInput = factoryInputs[0];
  assert.ok(factoryInput);
  assert.equal(factoryInput.profile, profile);
  assert.equal(factoryInput.targetLanguage, "zh");
  assert.equal(factoryInput.maxCandidates, PERSONAL_PHRASE_PACK_SIZE);
  assert.equal(result.phrases.length, PERSONAL_PHRASE_PACK_SIZE);
  assert.deepEqual(
    result.phrases.map((phrase) => phrase.id),
    Array.from({ length: PERSONAL_PHRASE_PACK_SIZE }, (_, index) => `phrase-${index + 1}`),
  );
  assert.deepEqual(
    attempts.map((attempt) => ({
      attempt: attempt.attempt,
      targetCount: attempt.targetCount,
      seenCount: attempt.seenTargets.length,
    })),
    [
      { attempt: 1, targetCount: 12, seenCount: 1 },
      { attempt: 2, targetCount: 4, seenCount: 10 },
    ],
  );
  assert.equal(result.phrases.at(-1)?.targetText, "juliet");
});

function makeDraft(targetText: string): PhrasePackDraft {
  return {
    direction: "ja-to-zh",
    japanese: `jp-${targetText}`,
    chinese: targetText,
    pinyin: `pin-${targetText}`,
    sourceLanguage: "ja",
    targetLanguage: "zh",
    sourceText: `jp-${targetText}`,
    targetText,
    reading: `pin-${targetText}`,
    readingType: "pinyin",
    categoryId: "other",
  };
}
