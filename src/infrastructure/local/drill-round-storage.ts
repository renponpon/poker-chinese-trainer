import { validDrillRound, type DrillRound } from "../../application/practice/drill-round";
import { currentDataOwner } from "./account-cache-storage";
import { ensureDeviceBackup, isDeviceRecoveryActive } from "./device-backup";

export const DRILL_ROUND_PREFIX = "phrabit-drill-round-v1:";
export function drillRoundKey(owner: string, language: string) { return `${DRILL_ROUND_PREFIX}${owner}:${language}`; }

export function loadDrillRound(owner: string, language: string): DrillRound | null {
  if (currentDataOwner() !== owner || isDeviceRecoveryActive()) throw new Error("drill_owner_unavailable");
  const raw = window.localStorage.getItem(drillRoundKey(owner, language));
  if (!raw) return null;
  const round: unknown = JSON.parse(raw);
  if (!validDrillRound(round) || round.owner !== owner || round.language !== language) throw new Error("drill_round_invalid");
  return round;
}

export function saveDrillRound(round: DrillRound): void {
  if (currentDataOwner() !== round.owner || isDeviceRecoveryActive() || !validDrillRound(round)) throw new Error("drill_round_unavailable");
  ensureDeviceBackup();
  const key = drillRoundKey(round.owner, round.language);
  const raw = JSON.stringify(round);
  window.localStorage.setItem(key, raw);
  if (window.localStorage.getItem(key) !== raw) throw new Error("drill_round_write_failed");
}
