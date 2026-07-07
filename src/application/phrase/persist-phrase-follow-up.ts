export type PhraseFollowUp = {
  phraseId: string;
  explanation: string;
  pinyin?: string;
};

export type PhraseFollowUpTarget = {
  name: string;
  updateFollowUp: (followUp: PhraseFollowUp) => Promise<boolean>;
};

export type PersistPhraseFollowUpResult = {
  attemptedTargets: string[];
  updatedTargets: string[];
  failedTargets: string[];
};

export async function persistPhraseFollowUp(input: {
  followUp: PhraseFollowUp;
  targets: PhraseFollowUpTarget[];
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onError?: (error: unknown, targetName: string) => void;
}): Promise<PersistPhraseFollowUpResult> {
  const attemptedTargets: string[] = [];
  const updatedTargets: string[] = [];
  const failedTargets: string[] = [];
  const sleep = input.sleep ?? defaultSleep;
  const retryDelayMs = input.retryDelayMs ?? 1000;

  for (const target of input.targets) {
    attemptedTargets.push(target.name);
    try {
      const updated = await target.updateFollowUp(input.followUp);
      if (updated) {
        updatedTargets.push(target.name);
        continue;
      }

      await sleep(retryDelayMs);
      const retryUpdated = await target.updateFollowUp(input.followUp);
      if (retryUpdated) {
        updatedTargets.push(target.name);
      } else {
        failedTargets.push(target.name);
      }
    } catch (error) {
      failedTargets.push(target.name);
      input.onError?.(error, target.name);
    }
  }

  return {
    attemptedTargets,
    updatedTargets,
    failedTargets,
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
