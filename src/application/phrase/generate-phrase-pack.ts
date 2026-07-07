export type PhrasePackCandidate = {
  targetText: string;
};

export type GeneratePhrasePackAttempt = {
  attempt: number;
  missingCount: number;
  targetCount: number;
  seenTargets: string[];
};

export type GeneratePhrasePackInput<TCandidate extends PhrasePackCandidate> = {
  packSize: number;
  initialTargetCount: number;
  maxAttempts: number;
  retryBuffer: number;
  retryMinTargetCount: number;
  existingTargets: string[];
  generateCandidates: (attempt: GeneratePhrasePackAttempt) => Promise<TCandidate[]>;
  isDuplicateTarget: (targetText: string, previousTargets: string[]) => boolean;
  createInsufficientError: () => Error;
  normalizeError?: (error: unknown) => Error;
  onAttemptError?: (event: {
    attempt: number;
    error: Error;
    originalError: unknown;
  }) => void;
};

export async function generatePhrasePack<TCandidate extends PhrasePackCandidate>(
  input: GeneratePhrasePackInput<TCandidate>,
): Promise<TCandidate[]> {
  let lastError: Error | null = null;
  const collected: TCandidate[] = [];
  const seenTargets = [...input.existingTargets];

  for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
    try {
      const missingCount = Math.max(0, input.packSize - collected.length);
      const targetCount =
        attempt === 1
          ? input.initialTargetCount
          : Math.max(missingCount + input.retryBuffer, input.retryMinTargetCount);
      const candidates = await input.generateCandidates({
        attempt,
        missingCount,
        targetCount,
        seenTargets: [...seenTargets],
      });

      for (const candidate of candidates) {
        if (collected.length >= input.packSize) break;
        if (input.isDuplicateTarget(candidate.targetText, seenTargets)) continue;
        seenTargets.push(candidate.targetText);
        collected.push(candidate);
      }

      if (collected.length >= input.packSize) {
        return collected.slice(0, input.packSize);
      }
      lastError = input.createInsufficientError();
    } catch (error) {
      const normalized = input.normalizeError?.(error) ?? toError(error);
      lastError = normalized;
      input.onAttemptError?.({ attempt, error: normalized, originalError: error });
    }
  }

  throw lastError ?? input.createInsufficientError();
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
