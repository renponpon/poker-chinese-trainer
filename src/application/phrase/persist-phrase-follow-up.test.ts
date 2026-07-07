import assert from "node:assert/strict";
import test from "node:test";
import { persistPhraseFollowUp } from "./persist-phrase-follow-up";

test("persisting phrase follow-up retries targets that are not updated on first attempt", async () => {
  let attempts = 0;
  const sleeps: number[] = [];

  const result = await persistPhraseFollowUp({
    followUp: {
      phraseId: "phrase-1",
      explanation: "explanation",
      pinyin: "pin yin",
    },
    retryDelayMs: 25,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    targets: [
      {
        name: "eventual",
        updateFollowUp: async () => {
          attempts += 1;
          return attempts >= 2;
        },
      },
    ],
  });

  assert.deepEqual(sleeps, [25]);
  assert.deepEqual(result, {
    attemptedTargets: ["eventual"],
    updatedTargets: ["eventual"],
    failedTargets: [],
  });
});

test("persisting phrase follow-up records failed targets", async () => {
  const errors: string[] = [];
  const result = await persistPhraseFollowUp({
    followUp: {
      phraseId: "phrase-1",
      explanation: "explanation",
    },
    sleep: async () => undefined,
    onError: (_error, targetName) => {
      errors.push(targetName);
    },
    targets: [
      {
        name: "throws",
        updateFollowUp: async () => {
          throw new Error("failed");
        },
      },
      {
        name: "not-found",
        updateFollowUp: async () => false,
      },
    ],
  });

  assert.deepEqual(errors, ["throws"]);
  assert.deepEqual(result, {
    attemptedTargets: ["throws", "not-found"],
    updatedTargets: [],
    failedTargets: ["throws", "not-found"],
  });
});
