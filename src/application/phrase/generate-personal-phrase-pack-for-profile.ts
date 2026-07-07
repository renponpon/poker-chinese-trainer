import { detectDuplicateInList } from "../../lib/phrase-dedupe";
import type { LanguageCode, PhrasePackProfile } from "../../lib/types";
import {
  generatePersonalPhrasePack,
  type GeneratePersonalPhrasePackResult,
  type PhrasePackDraft,
} from "./generate-personal-phrase-pack";
import type { GeneratePhrasePackAttempt } from "./generate-phrase-pack";

export const PERSONAL_PHRASE_PACK_SIZE = 10;

const INITIAL_TARGET_COUNT = 12;
const MAX_ATTEMPTS = 2;
const RETRY_BUFFER = 2;
const RETRY_MIN_TARGET_COUNT = 4;

export type CreatePersonalPhrasePackCandidateGeneratorInput = {
  profile: PhrasePackProfile;
  targetLanguage: LanguageCode;
  maxCandidates: number;
};

export type GeneratePersonalPhrasePackForProfileInput = {
  profile: PhrasePackProfile;
  targetLanguage: LanguageCode;
  existingTargets: string[];
  createId: () => string;
  createCandidateGenerator: (
    input: CreatePersonalPhrasePackCandidateGeneratorInput,
  ) => (attempt: GeneratePhrasePackAttempt) => Promise<PhrasePackDraft[]>;
  createInsufficientError: () => Error;
  normalizeError?: (error: unknown) => Error;
  onAttemptError?: (event: {
    attempt: number;
    error: Error;
    originalError: unknown;
  }) => void;
};

export async function generatePersonalPhrasePackForProfile(
  input: GeneratePersonalPhrasePackForProfileInput,
): Promise<GeneratePersonalPhrasePackResult> {
  return generatePersonalPhrasePack({
    packSize: PERSONAL_PHRASE_PACK_SIZE,
    initialTargetCount: INITIAL_TARGET_COUNT,
    maxAttempts: MAX_ATTEMPTS,
    retryBuffer: RETRY_BUFFER,
    retryMinTargetCount: RETRY_MIN_TARGET_COUNT,
    existingTargets: input.existingTargets,
    createId: input.createId,
    generateCandidates: input.createCandidateGenerator({
      profile: input.profile,
      targetLanguage: input.targetLanguage,
      maxCandidates: PERSONAL_PHRASE_PACK_SIZE,
    }),
    isDuplicateTarget: (targetText, previousTargets) =>
      Boolean(detectDuplicateInList(targetText, previousTargets)),
    createInsufficientError: input.createInsufficientError,
    normalizeError: input.normalizeError,
    onAttemptError: input.onAttemptError,
  });
}
