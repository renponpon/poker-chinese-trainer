import type { SrsItem } from "../../lib/types";

const STORAGE_KEY = "poker-chinese-srs-v1";

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function loadLocalSrsItems(): SrsItem[] {
  if (!isClient()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SrsItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveLocalSrsItems(items: SrsItem[]): void {
  if (!isClient()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}
