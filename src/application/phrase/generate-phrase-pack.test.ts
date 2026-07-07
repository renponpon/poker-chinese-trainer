import assert from "node:assert/strict";
import test from "node:test";
import { generatePhrasePack } from "./generate-phrase-pack";

type Candidate = {
  targetText: string;
  label: string;
};

test("generates until the requested pack size is reached", async () => {
  const attempts: Array<{ attempt: number; targetCount: number; seenTargets: string[] }> = [];

  const pack = await generatePhrasePack<Candidate>({
    packSize: 3,
    initialTargetCount: 5,
    maxAttempts: 2,
    retryBuffer: 2,
    retryMinTargetCount: 4,
    existingTargets: ["existing"],
    isDuplicateTarget: (targetText, previousTargets) => previousTargets.includes(targetText),
    createInsufficientError: () => new Error("not enough"),
    generateCandidates: async (attempt) => {
      attempts.push({
        attempt: attempt.attempt,
        targetCount: attempt.targetCount,
        seenTargets: attempt.seenTargets,
      });
      return attempt.attempt === 1
        ? [makeCandidate("one"), makeCandidate("two")]
        : [makeCandidate("three")];
    },
  });

  assert.deepEqual(pack.map((item) => item.targetText), ["one", "two", "three"]);
  assert.deepEqual(attempts, [
    { attempt: 1, targetCount: 5, seenTargets: ["existing"] },
    { attempt: 2, targetCount: 4, seenTargets: ["existing", "one", "two"] },
  ]);
});

test("skips existing and repeated candidates", async () => {
  const pack = await generatePhrasePack<Candidate>({
    packSize: 2,
    initialTargetCount: 5,
    maxAttempts: 1,
    retryBuffer: 2,
    retryMinTargetCount: 4,
    existingTargets: ["existing"],
    isDuplicateTarget: (targetText, previousTargets) => previousTargets.includes(targetText),
    createInsufficientError: () => new Error("not enough"),
    generateCandidates: async () => [
      makeCandidate("existing"),
      makeCandidate("fresh"),
      makeCandidate("fresh"),
      makeCandidate("other"),
    ],
  });

  assert.deepEqual(pack.map((item) => item.targetText), ["fresh", "other"]);
});

test("normalizes candidate generation errors before throwing", async () => {
  const errors: string[] = [];

  await assert.rejects(
    () =>
      generatePhrasePack<Candidate>({
        packSize: 1,
        initialTargetCount: 2,
        maxAttempts: 2,
        retryBuffer: 2,
        retryMinTargetCount: 4,
        existingTargets: [],
        isDuplicateTarget: (targetText, previousTargets) => previousTargets.includes(targetText),
        createInsufficientError: () => new Error("not enough"),
        normalizeError: () => new Error("normalized"),
        onAttemptError: (event) => errors.push(`${event.attempt}:${event.error.message}`),
        generateCandidates: async () => {
          throw new Error("raw");
        },
      }),
    /normalized/,
  );

  assert.deepEqual(errors, ["1:normalized", "2:normalized"]);
});

function makeCandidate(targetText: string): Candidate {
  return { targetText, label: targetText };
}
