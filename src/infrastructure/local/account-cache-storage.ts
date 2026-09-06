import type { SavedPhraseSnapshot } from "../../application/phrase/load-saved-phrases";
import { ensureDeviceBackup } from "./device-backup";

export const ACCOUNT_CACHE_OWNER_KEY = "phrabit-account-cache-owner-v1";
export const LOCAL_PHRASE_DATA_CHANGED_EVENT = "phrabit-local-data-changed";
const CACHE_PREFIX = "phrabit-account-checkpoint-v1:";
const PHRASES_KEY = "poker-chinese-local-phrases-v1";
const SRS_KEY = "poker-chinese-srs-v1";

export type AccountCheckpoint = {
  baseline: SavedPhraseSnapshot | null;
  local: SavedPhraseSnapshot;
};

export function currentDataOwner(): string {
  return typeof window === "undefined" ? "guest" : window.localStorage.getItem(ACCOUNT_CACHE_OWNER_KEY) ?? "guest";
}

export function readAccountCheckpoint(userId: string): AccountCheckpoint | null {
  const raw = window.localStorage.getItem(`${CACHE_PREFIX}${userId}`);
  if (!raw) return null;
  const checkpoint = JSON.parse(raw) as AccountCheckpoint;
  if (!Array.isArray(checkpoint.local?.phrases) || !Array.isArray(checkpoint.local?.srsItems)) {
    throw new Error("端末の同期記録を読み込めません。データを保護するため同期を停止しました。");
  }
  return checkpoint;
}

export function writeAccountCheckpoint(userId: string, checkpoint: AccountCheckpoint): void {
  ensureDeviceBackup();
  window.localStorage.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify(checkpoint));
}

export function checkpointLocalData(): void {
  if (typeof window === "undefined") return;
  ensureDeviceBackup();
  const owner = currentDataOwner();
  if (owner !== "guest") {
    const previous = readAccountCheckpoint(owner);
    writeAccountCheckpoint(owner, {
      baseline: previous?.baseline ?? null,
      local: {
        phrases: JSON.parse(window.localStorage.getItem(PHRASES_KEY) ?? "[]"),
        srsItems: JSON.parse(window.localStorage.getItem(SRS_KEY) ?? "[]"),
      },
    });
  }
  window.dispatchEvent(new Event(LOCAL_PHRASE_DATA_CHANGED_EVENT));
}
