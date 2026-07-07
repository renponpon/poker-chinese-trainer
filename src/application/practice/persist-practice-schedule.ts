import type { Phrase, SrsItem } from "../../lib/types";

export type PersistPracticeScheduleStorage = {
  savePracticeSchedule: (input: {
    phrase: Phrase;
    srsItem: SrsItem;
  }) => Promise<void>;
};

export class PracticeScheduleSyncRequestError extends Error {
  status = 400;
  code = "validation_error";

  constructor(message: string) {
    super(message);
    this.name = "PracticeScheduleSyncRequestError";
  }
}

export type NormalizedPracticeScheduleSyncRequest = {
  ownerKey: string;
  schedule: {
    phrase: Phrase;
    srsItem: SrsItem;
  } | null;
};

export function normalizePracticeScheduleSyncRequest(
  value: unknown,
): NormalizedPracticeScheduleSyncRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PracticeScheduleSyncRequestError("Request body must be an object.");
  }

  const raw = value as {
    ownerKey?: unknown;
    phrase?: unknown;
    srsItem?: unknown;
  };
  const ownerKey = typeof raw.ownerKey === "string" ? raw.ownerKey.trim() : "";
  if (!raw.phrase || !raw.srsItem) {
    return { ownerKey, schedule: null };
  }
  if (
    typeof raw.phrase !== "object" ||
    Array.isArray(raw.phrase) ||
    typeof raw.srsItem !== "object" ||
    Array.isArray(raw.srsItem)
  ) {
    throw new PracticeScheduleSyncRequestError("Practice schedule shape is invalid.");
  }

  return {
    ownerKey,
    schedule: {
      phrase: raw.phrase as Phrase,
      srsItem: raw.srsItem as SrsItem,
    },
  };
}

export async function persistPracticeSchedule(input: {
  phrase: Phrase;
  srsItem: SrsItem;
  storage: PersistPracticeScheduleStorage;
}): Promise<void> {
  await input.storage.savePracticeSchedule({
    phrase: input.phrase,
    srsItem: input.srsItem,
  });
}
