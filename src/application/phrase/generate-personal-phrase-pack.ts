import { generatePhrasePack, type GeneratePhrasePackAttempt } from "./generate-phrase-pack";
import type { LanguageCode, PhraseDirection, ReadingType } from "../../lib/types";

export type PhrasePackDraft = {
  direction: PhraseDirection;
  japanese: string;
  chinese: string;
  pinyin: string;
  sourceLanguage: "ja";
  targetLanguage: LanguageCode;
  sourceText: string;
  targetText: string;
  reading: string;
  readingType: ReadingType;
  categoryId: string;
};

export type GeneratedPersonalPhrasePackItem = PhrasePackDraft & {
  id: string;
  explanation: string;
};

export type GeneratePersonalPhrasePackInput = {
  packSize: number;
  initialTargetCount: number;
  maxAttempts: number;
  retryBuffer: number;
  retryMinTargetCount: number;
  existingTargets: string[];
  createId: () => string;
  generateCandidates: (attempt: GeneratePhrasePackAttempt) => Promise<PhrasePackDraft[]>;
  isDuplicateTarget: (targetText: string, previousTargets: string[]) => boolean;
  createInsufficientError: () => Error;
  normalizeError?: (error: unknown) => Error;
  onAttemptError?: (event: {
    attempt: number;
    error: Error;
    originalError: unknown;
  }) => void;
};

export type GeneratePersonalPhrasePackResult = {
  phrases: GeneratedPersonalPhrasePackItem[];
  outputChars: number;
};

export async function generatePersonalPhrasePack(
  input: GeneratePersonalPhrasePackInput,
): Promise<GeneratePersonalPhrasePackResult> {
  const drafts = await generatePhrasePack<PhrasePackDraft>({
    packSize: input.packSize,
    initialTargetCount: input.initialTargetCount,
    maxAttempts: input.maxAttempts,
    retryBuffer: input.retryBuffer,
    retryMinTargetCount: input.retryMinTargetCount,
    existingTargets: input.existingTargets,
    generateCandidates: input.generateCandidates,
    isDuplicateTarget: input.isDuplicateTarget,
    createInsufficientError: input.createInsufficientError,
    normalizeError: input.normalizeError,
    onAttemptError: input.onAttemptError,
  });

  return {
    phrases: drafts.map((phrase) => ({
      id: input.createId(),
      ...phrase,
      explanation: "",
    })),
    outputChars: drafts.reduce(
      (sum, phrase) =>
        sum + phrase.japanese.length + phrase.targetText.length + phrase.reading.length,
      0,
    ),
  };
}
