import type { PhraseFollowUpTarget } from "../../application/phrase/persist-phrase-follow-up";
import { updatePhraseFollowUp } from "../../lib/notion";
import { updateSupabasePhraseFollowUp } from "./supabase-phrase-repository";

export function createPhraseFollowUpCloudTargets(input: {
  accessToken: string;
}): PhraseFollowUpTarget[] {
  const targets: PhraseFollowUpTarget[] = [];

  if (input.accessToken) {
    targets.push({
      name: "supabase",
      updateFollowUp: (followUp) =>
        updateSupabasePhraseFollowUp(input.accessToken, followUp.phraseId, {
          explanation: followUp.explanation,
          pinyin: followUp.pinyin,
        }),
    });
  }

  targets.push({
    name: "notion",
    updateFollowUp: (followUp) =>
      updatePhraseFollowUp(followUp.phraseId, {
        explanation: followUp.explanation,
        pinyin: followUp.pinyin,
      }),
  });

  return targets;
}
