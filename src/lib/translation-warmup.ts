import type { LanguageCode } from "@/lib/types";

const WARMUP_STORAGE_KEY_PREFIX = "phrabit.translationWarmupAt.v1";
const WARMUP_TTL_MS = 4 * 60 * 60 * 1000;
export const TRANSLATION_WARMUP_DELAY_MS = 1500;

const inFlightWarmups = new Set<LanguageCode>();

export function triggerTranslationWarmup(targetLanguage: LanguageCode): void {
  if (typeof window === "undefined") return;
  const storageKey = getWarmupStorageKey(targetLanguage);
  if (inFlightWarmups.has(targetLanguage)) return;
  if (shouldSkipWarmup(storageKey)) return;

  markWarmupAttempted(storageKey);
  inFlightWarmups.add(targetLanguage);
  void fetch("/api/phrase/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ warmup: true, targetLanguage }),
    keepalive: true,
  })
    .catch(() => undefined)
    .then(() => {
      inFlightWarmups.delete(targetLanguage);
    });
}

function shouldSkipWarmup(storageKey: string): boolean {
  try {
    const value = window.localStorage.getItem(storageKey);
    const warmedAt = value ? Number.parseInt(value, 10) : 0;
    return Number.isFinite(warmedAt) && Date.now() - warmedAt < WARMUP_TTL_MS;
  } catch {
    return false;
  }
}

function markWarmupAttempted(storageKey: string): void {
  try {
    window.localStorage.setItem(storageKey, String(Date.now()));
  } catch {
    // Best effort only.
  }
}

function getWarmupStorageKey(targetLanguage: LanguageCode): string {
  return `${WARMUP_STORAGE_KEY_PREFIX}.${targetLanguage}`;
}
