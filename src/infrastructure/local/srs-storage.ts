import type { SrsItem } from "../../lib/types";
import { migrateStarterPhraseId } from "../../lib/starter-phrases";
import { checkpointLocalData } from "./account-cache-storage";
import { ensureDeviceBackup } from "./device-backup";

const STORAGE_KEY = "poker-chinese-srs-v1";

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function loadLocalSrsItems(): SrsItem[] {
  if (!isClient()) return [];
  ensureDeviceBackup();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SrsItem[];
    if (!Array.isArray(parsed)) return [];
    const migrated = parsed.map((item) => ({
      ...item,
      id: migrateStarterPhraseId(item.id),
    }));
    const normalized = [
      ...new Map(migrated.map((item) => [item.id, item])).values(),
    ];
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      saveLocalSrsItems(normalized);
    }
    return normalized;
  } catch {
    return [];
  }
}

export function saveLocalSrsItems(items: SrsItem[]): void {
  if (!isClient()) return;
  ensureDeviceBackup();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  checkpointLocalData();
}
