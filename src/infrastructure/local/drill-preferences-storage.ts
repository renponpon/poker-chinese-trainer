import { DEFAULT_DRILL_LIMIT, isDrillLimit, type DrillLimit } from "../../domain/practice/drill-preferences";
import { currentDataOwner } from "./account-cache-storage";
import { ensureDeviceBackup, isDeviceRecoveryActive } from "./device-backup";

export const DRILL_PREFERENCES_CHANGED = "phrabit-drill-preferences-changed";
export const DRILL_PREFERENCES_PREFIX = "phrabit-drill-preferences-v1:";
export type DrillPreferences = { limit: DrillLimit; pendingId: string | null };

export function loadDrillPreferences(owner: string): DrillPreferences {
  if (currentDataOwner() !== owner || isDeviceRecoveryActive()) throw new Error("drill_owner_unavailable");
  const raw = window.localStorage.getItem(DRILL_PREFERENCES_PREFIX + owner);
  if (!raw) return { limit: DEFAULT_DRILL_LIMIT, pendingId: null };
  const state = JSON.parse(raw) as DrillPreferences;
  if (!isDrillLimit(state.limit) || !(state.pendingId === null || typeof state.pendingId === "string")) throw new Error("drill_preferences_invalid");
  return state;
}

export function writeDrillPreferences(owner: string, state: DrillPreferences): void {
  if (currentDataOwner() !== owner || isDeviceRecoveryActive() || !isDrillLimit(state.limit)) throw new Error("drill_owner_unavailable");
  ensureDeviceBackup();
  const key = DRILL_PREFERENCES_PREFIX + owner;
  const raw = JSON.stringify(state);
  window.localStorage.setItem(key, raw);
  if (window.localStorage.getItem(key) !== raw) throw new Error("drill_preferences_write_failed");
  window.dispatchEvent(new Event(DRILL_PREFERENCES_CHANGED));
}

export function setDrillLimit(owner: string, limit: DrillLimit): void {
  writeDrillPreferences(owner, { limit, pendingId: owner === "guest" ? null : crypto.randomUUID() });
}
