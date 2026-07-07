import { createPhrase } from "../../lib/notion";
import type { Phrase } from "../../lib/types";
import { createSupabasePhrase } from "./supabase-phrase-repository";

export type PhraseCloudStorageInput = {
  accessToken: string;
  ownerKey: string;
  nickname: string;
};

export function createPhraseCloudStorage(input: PhraseCloudStorageInput) {
  return {
    savePhrase: async (phrase: Phrase): Promise<void> => {
      if (input.accessToken) {
        await createSupabasePhrase(input.accessToken, phrase);
      }
      await createPhrase({
        phraseId: phrase.id,
        japanese: phrase.japanese,
        chinese: phrase.chinese,
        pinyin: phrase.pinyin,
        sourceLanguage: phrase.sourceLanguage,
        targetLanguage: phrase.targetLanguage,
        sourceText: phrase.sourceText,
        targetText: phrase.targetText,
        reading: phrase.reading,
        readingType: phrase.readingType,
        explanation: phrase.explanation,
        ownerKey: input.ownerKey,
        nickname: input.nickname,
        direction: phrase.direction,
        categoryId: phrase.categoryId,
        shouldDrill: phrase.shouldDrill,
        source: phrase.source,
        usedAt: phrase.usedAt,
      });
    },
  };
}
