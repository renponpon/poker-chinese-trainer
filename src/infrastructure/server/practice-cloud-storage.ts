import { updatePhraseSrs } from "../../lib/notion";
import type { Phrase, SrsItem } from "../../lib/types";
import { upsertSupabaseSrsItem } from "./supabase-phrase-repository";

export type PracticeCloudStorageInput = {
  accessToken: string;
  ownerKey: string;
};

export function createPracticeCloudStorage(input: PracticeCloudStorageInput) {
  return {
    savePracticeSchedule: async ({
      phrase,
      srsItem,
    }: {
      phrase: Phrase;
      srsItem: SrsItem;
    }): Promise<void> => {
      if (input.accessToken) {
        await upsertSupabaseSrsItem(input.accessToken, phrase, srsItem);
      }

      if (!input.ownerKey) return;

      await updatePhraseSrs({
        ownerKey: input.ownerKey,
        phrase,
        srsItem,
      });
    },
  };
}
