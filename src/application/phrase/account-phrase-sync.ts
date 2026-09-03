import type { Phrase, Score, SrsItem, SrsStatus } from "../../lib/types";
import type { SavedPhraseSnapshot } from "./load-saved-phrases";
import { normalizePersistSavedPhrasesRequest } from "./persist-saved-phrases";

const MAX_SYNC_PHRASES = 1000;

export class AccountPhraseSyncRequestError extends Error {
  status = 400;
  code = "validation_error";

  constructor(message: string) {
    super(message);
    this.name = "AccountPhraseSyncRequestError";
  }
}

export function normalizeAccountPhraseSnapshot(value: unknown): SavedPhraseSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountPhraseSyncRequestError("Request body must be an object.");
  }
  const raw = value as { phrases?: unknown; srsItems?: unknown };
  if (!Array.isArray(raw.phrases) || raw.phrases.length > MAX_SYNC_PHRASES) {
    throw new AccountPhraseSyncRequestError("Phrase count is invalid.");
  }
  if (!Array.isArray(raw.srsItems) || raw.srsItems.length > MAX_SYNC_PHRASES) {
    throw new AccountPhraseSyncRequestError("SRS item count is invalid.");
  }

  const phrases: Phrase[] = [];
  for (let offset = 0; offset < raw.phrases.length; offset += 10) {
    phrases.push(
      ...normalizePersistSavedPhrasesRequest({
        phrases: raw.phrases.slice(offset, offset + 10),
      }).phrases,
    );
  }
  const phraseById = new Map(phrases.map((phrase) => [phrase.id, phrase]));
  const srsItems = raw.srsItems
    .map(normalizeSrsItem)
    .filter((item) => phraseById.get(item.id)?.shouldDrill);

  return { phrases, srsItems };
}

export function normalizeAccountPhraseState(value: unknown): {
  phrase: Phrase;
  srsItem: SrsItem | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountPhraseSyncRequestError("Request body must be an object.");
  }
  const raw = value as { phrase?: unknown; srsItem?: unknown };
  const snapshot = normalizeAccountPhraseSnapshot({
    phrases: raw.phrase ? [raw.phrase] : [],
    srsItems: raw.srsItem ? [raw.srsItem] : [],
  });
  const phrase = snapshot.phrases[0];
  if (!phrase) {
    throw new AccountPhraseSyncRequestError("Phrase is required.");
  }
  return { phrase, srsItem: snapshot.srsItems[0] ?? null };
}

export function normalizeAccountPhraseIds(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountPhraseSyncRequestError("Request body must be an object.");
  }
  const raw = value as { phraseIds?: unknown };
  if (
    !Array.isArray(raw.phraseIds) ||
    raw.phraseIds.length === 0 ||
    raw.phraseIds.length > 100
  ) {
    throw new AccountPhraseSyncRequestError("Phrase IDs are invalid.");
  }
  return [...new Set(raw.phraseIds.map((id) => normalizeId(id)))];
}

function normalizeSrsItem(value: unknown): SrsItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountPhraseSyncRequestError("SRS item shape is invalid.");
  }
  const item = value as Partial<SrsItem>;
  return {
    id: normalizeId(item.id),
    status: normalizeStatus(item.status),
    nextReviewAt: normalizeNumber(item.nextReviewAt, "nextReviewAt"),
    intervalDays: normalizeNumber(item.intervalDays, "intervalDays"),
    easeFactor: normalizeNumber(item.easeFactor, "easeFactor"),
    consecutiveGood: normalizeNumber(item.consecutiveGood, "consecutiveGood"),
    lastScore: normalizeScore(item.lastScore),
    lastReviewedAt:
      item.lastReviewedAt === null || item.lastReviewedAt === undefined
        ? null
        : normalizeNumber(item.lastReviewedAt, "lastReviewedAt"),
  };
}

function normalizeId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 80) {
    throw new AccountPhraseSyncRequestError("Phrase ID is invalid.");
  }
  return value.trim();
}

function normalizeStatus(value: unknown): SrsStatus {
  if (
    value === "new" ||
    value === "learning" ||
    value === "review" ||
    value === "maintenance" ||
    value === "mastered"
  ) {
    return value;
  }
  throw new AccountPhraseSyncRequestError("SRS status is invalid.");
}

function normalizeScore(value: unknown): Score | null {
  if (value === null || value === undefined) return null;
  if (value === 1 || value === 2 || value === 3) return value;
  throw new AccountPhraseSyncRequestError("SRS score is invalid.");
}

function normalizeNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new AccountPhraseSyncRequestError(`${field} is invalid.`);
  }
  return value;
}
