import { learningDayAt, validLearningDay, validLearningReceipt, validTimeZone, type LearningReceipt } from "../../domain/practice/learning-days";
import { currentDataOwner } from "./account-cache-storage";
import { ensureDeviceBackup } from "./device-backup";

export const LEARNING_DAYS_CHANGED = "phrabit-learning-days-changed";
export const LEARNING_STORAGE_PREFIX = "phrabit-learning-days-v1:";
export const SRS_STORAGE_KEY = "poker-chinese-srs-v1";
export type LearningRecord = LearningReceipt & { day: string | null; synced: boolean; rejected: boolean };
export type LearningSnapshot = { owner: string; timeZone: string | null; days: string[]; records: LearningRecord[]; pending: number; rejected: number };

function prefix(owner: string) { return `${LEARNING_STORAGE_PREFIX}${owner}:`; }
function settingsKey(owner: string) { return `${prefix(owner)}zone`; }
function changed() { window.dispatchEvent(new Event(LEARNING_DAYS_CHANGED)); }
function write(key: string, value: unknown) {
  ensureDeviceBackup();
  const raw = JSON.stringify(value);
  window.localStorage.setItem(key, raw);
  if (window.localStorage.getItem(key) !== raw) throw new Error("learning_write_failed");
}

export function deviceLearningTimeZone(): string {
  const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return validTimeZone(value) ? value : "UTC";
}

export function loadLearningSnapshot(owner = currentDataOwner()): LearningSnapshot {
  const storage = window.localStorage;
  const zoneRaw = storage.getItem(settingsKey(owner));
  const timeZone: unknown = zoneRaw === null ? null : JSON.parse(zoneRaw);
  if (timeZone !== null && !validTimeZone(timeZone)) throw new Error("learning_zone_invalid");
  const records: LearningRecord[] = [];
  const days = new Set<string>();
  const ownerPrefix = prefix(owner);
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(ownerPrefix) || key === settingsKey(owner)) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    if (key.startsWith(`${ownerPrefix}day:`)) {
      const day: unknown = JSON.parse(raw);
      if (!validLearningDay(day) || key !== `${ownerPrefix}day:${day}`) throw new Error("learning_day_invalid");
      days.add(day);
    } else if (key.startsWith(`${ownerPrefix}event:`)) {
      const entry = JSON.parse(raw) as LearningRecord;
      if (!validLearningReceipt(entry) || entry.owner !== owner || key !== `${ownerPrefix}event:${entry.operationId}`
        || !(entry.day === null || validLearningDay(entry.day)) || typeof entry.synced !== "boolean" || typeof entry.rejected !== "boolean"
        || entry.day !== (entry.timeZone ? learningDayAt(entry.occurredAt, entry.timeZone) : null)) throw new Error("learning_record_invalid");
      records.push(entry);
      if (entry.day && !entry.rejected) days.add(entry.day);
    }
  }
  return { owner, timeZone: validTimeZone(timeZone) ? timeZone : null, days: [...days].sort(), records, pending: records.filter((entry) => !entry.synced && !entry.rejected).length, rejected: records.filter((entry) => entry.rejected).length };
}

export function createLearningReceipt(owner: string, reviewedAt: number): LearningReceipt | undefined {
  if (currentDataOwner() !== owner) throw new Error("learning_owner_changed");
  let state = loadLearningSnapshot(owner);
  if (owner === "guest" && !state.timeZone) {
    write(settingsKey(owner), deviceLearningTimeZone());
    state = loadLearningSnapshot(owner);
  }
  if (state.timeZone && state.days.includes(learningDayAt(reviewedAt, state.timeZone))) return undefined;
  return { version: 1, operationId: crypto.randomUUID(), owner, occurredAt: new Date(reviewedAt).toISOString(), timeZone: state.timeZone };
}

export function recoverLearningReceipts(): void {
  const raw = window.localStorage.getItem(SRS_STORAGE_KEY);
  if (!raw) return;
  const items: unknown = JSON.parse(raw);
  if (!Array.isArray(items)) throw new Error("srs_invalid");
  let wrote = false;
  for (const item of items) {
    if (!item?.learningReceipt) continue;
    const receipt: unknown = item.learningReceipt;
    if (!validLearningReceipt(receipt)) throw new Error("learning_receipt_invalid");
    const key = `${prefix(receipt.owner)}event:${receipt.operationId}`;
    if (window.localStorage.getItem(key) !== null) continue;
    const timeZone = receipt.timeZone ?? loadLearningSnapshot(receipt.owner).timeZone;
    write(key, { ...receipt, timeZone, day: timeZone ? learningDayAt(receipt.occurredAt, timeZone) : null, synced: receipt.owner === "guest", rejected: false } satisfies LearningRecord);
    wrote = true;
  }
  if (wrote) changed();
}

export type LearningSyncResponse = { userId: string; timeZone: string; days: string[]; accepted: string[]; rejected: string[] };

export function mergeLearningSync(owner: string, response: LearningSyncResponse, sentIds: string[]): void {
  if (currentDataOwner() !== owner || response.userId !== owner) throw new Error("learning_owner_changed");
  if (!validTimeZone(response.timeZone) || !Array.isArray(response.days) || response.days.some((day) => !validLearningDay(day))
    || !Array.isArray(response.accepted) || !Array.isArray(response.rejected)
    || [...response.accepted, ...response.rejected].some((id) => !sentIds.includes(id))
    || response.accepted.some((id) => response.rejected.includes(id))) throw new Error("learning_response_invalid");
  const state = loadLearningSnapshot(owner);
  if (state.timeZone && state.timeZone !== response.timeZone) throw new Error("learning_zone_conflict");
  write(settingsKey(owner), response.timeZone);
  for (const day of response.days) write(`${prefix(owner)}day:${day}`, day);
  for (const entry of state.records) {
    const accepted = response.accepted.includes(entry.operationId);
    const rejected = response.rejected.includes(entry.operationId);
    const timeZone = entry.timeZone ?? response.timeZone;
    if (accepted && !response.days.includes(learningDayAt(entry.occurredAt, timeZone))) throw new Error("learning_ack_missing_day");
    if (accepted || rejected || entry.timeZone === null) {
      write(`${prefix(owner)}event:${entry.operationId}`, { ...entry, timeZone, day: learningDayAt(entry.occurredAt, timeZone), synced: entry.synced || accepted, rejected: entry.rejected || rejected });
    }
  }
  changed();
}
