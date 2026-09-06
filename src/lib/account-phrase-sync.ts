import type { Session } from "@supabase/supabase-js";
import { ensureDeviceBackup, isDeviceRecoveryActive } from "@/infrastructure/local/device-backup";
import { mergeAccountPhraseData } from "@/application/phrase/merge-account-phrase-data";
import { normalizeAccountPhraseSnapshot } from "@/application/phrase/account-phrase-sync";
import { reconcileAccountPhraseData, type PhraseMutation } from "@/application/phrase/reconcile-account-phrase-data";
import type { SavedPhraseSnapshot } from "@/application/phrase/load-saved-phrases";
import { syncDrillSchedule } from "@/application/practice/drill-schedule";
import { loadLocalPhrases, loadNickname, loadOwnerKey, saveLocalPhrases } from "@/infrastructure/local/phrase-storage";
import { loadLocalSrsItems, saveLocalSrsItems } from "@/infrastructure/local/srs-storage";
import {
  ACCOUNT_CACHE_OWNER_KEY, checkpointLocalData, currentDataOwner,
  readAccountCheckpoint, writeAccountCheckpoint,
} from "@/infrastructure/local/account-cache-storage";
import type { Phrase, SrsItem } from "@/lib/types";
import { getBrowserSupabase } from "./supabase";
import { createAccountStarterIdMap } from "./account-starter-ids";

export const ACCOUNT_PHRASE_DATA_SYNCED_EVENT = "phrabit-account-phrase-data-synced";
export const ACCOUNT_SYNC_STATUS_EVENT = "phrabit-account-sync-status";
let syncStatus = "";
let sessionEpoch = 0;
let requestedUser: string | null = null;
let activeSync: { userId: string; promise: Promise<void>; again: boolean } | null = null;

export function getAccountSyncStatus(): string { return syncStatus; }

function setSyncStatus(message: string): void {
  syncStatus = message;
  window.dispatchEvent(new Event(ACCOUNT_SYNC_STATUS_EVENT));
}

export async function synchronizeAccountPhraseData(session: Session): Promise<void> {
  ensureDeviceBackup();
  const userId = session.user.id;
  if (requestedUser !== userId) {
    activateAccount(userId);
    requestedUser = userId;
    sessionEpoch += 1;
  }
  if (activeSync?.userId === userId) {
    activeSync.again = true;
    return activeSync.promise;
  }
  const epoch = sessionEpoch;
  const task = { userId, again: false, promise: Promise.resolve() };
  const run = async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      task.again = false;
      assertCurrentAccount(userId, epoch);
      await performAccountSync(session, epoch);
      if (!task.again) break;
    }
  };
  task.promise = (navigator.locks
    ? navigator.locks.request("phrabit-account-sync", run)
    : Promise.resolve().then(run)
  ).then(() => undefined).catch((error) => {
    if (requestedUser === userId && epoch === sessionEpoch) {
      setSyncStatus("端末に未同期の変更があります。データを保持して再試行します。");
    }
    throw error;
  }).finally(() => {
    if (activeSync === task) activeSync = null;
  });
  activeSync = task;
  return task.promise;
}

export function clearOwnedAccountPhraseData(): void {
  if (typeof window === "undefined") return;
  ensureDeviceBackup();
  sessionEpoch += 1;
  requestedUser = null;
  if (currentDataOwner() !== "guest") {
    checkpointLocalData();
    localStorage.removeItem(ACCOUNT_CACHE_OWNER_KEY);
    saveLocalPhrases([]);
    saveLocalSrsItems([]);
  }
  setSyncStatus("");
  emitAccountPhraseDataSynced();
}

function activateAccount(userId: string): void {
  const owner = currentDataOwner();
  if (owner === userId) return;
  const guest = owner === "guest" ? readLocalSnapshot() : null;
  checkpointLocalData();
  const previous = readAccountCheckpoint(userId);
  const local = previous
    ? guest ? mergeAccountPhraseData(guest, previous.local) : previous.local
    : guest ?? { phrases: [], srsItems: [] };
  localStorage.removeItem(ACCOUNT_CACHE_OWNER_KEY);
  saveLocalPhrases(local.phrases);
  saveLocalSrsItems(local.srsItems);
  writeAccountCheckpoint(userId, { baseline: previous?.baseline ?? null, local });
  localStorage.setItem(ACCOUNT_CACHE_OWNER_KEY, userId);
  emitAccountPhraseDataSynced();
}

export async function syncPhraseStateToCloud(phrase: Phrase, srsItem: SrsItem | null): Promise<boolean> {
  if (await syncCurrentAccount()) return true;
  if (phrase.shouldDrill && srsItem) {
    await cloudRequest("", "POST", { phrase, srsItem, ownerKey: loadOwnerKey() }, "/api/srs/sync");
  }
  return false;
}

export async function deletePhrasesFromCloud(phraseIds: string[]): Promise<boolean> {
  return phraseIds.length === 0 ? true : syncCurrentAccount();
}

async function syncCurrentAccount(): Promise<boolean> {
  const owner = currentDataOwner();
  const supabase = getBrowserSupabase();
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (owner !== currentDataOwner()) throw new Error("アカウントが変わったため同期を中止しました");
  if (!session) {
    if (owner !== "guest") throw new Error("再ログインすると未同期データを送信できます");
    return false;
  }
  if (owner !== "guest" && owner !== session.user.id) throw new Error("アカウントを確認してください");
  await synchronizeAccountPhraseData(session);
  return true;
}

export async function syncSavedPhrases(phrases: Phrase[]): Promise<boolean> {
  const owner = currentDataOwner();
  if (await syncCurrentAccount()) return true;
  if (owner !== "guest" || currentDataOwner() !== owner) return false;
  const ids = new Set(phrases.map((phrase) => phrase.id));
  const current = loadLocalPhrases().filter((phrase) => ids.has(phrase.id));
  for (let offset = 0; offset < current.length; offset += 10) {
    await cloudRequest("", "POST", {
      ownerKey: loadOwnerKey(), nickname: loadNickname(), phrases: current.slice(offset, offset + 10),
    }, "/api/phrase/save-pack");
  }
  return false;
}

async function performAccountSync(session: Session, epoch: number): Promise<void> {
  const userId = session.user.id;
  setSyncStatus("端末に保存済み・同期中...");
  checkpointLocalData();
  let baseline = readAccountCheckpoint(userId)?.baseline;
  const cloud = completeDrillSchedule(normalizeAccountPhraseSnapshot(await cloudRequest(session.access_token, "GET")));
  assertCurrentAccount(userId, epoch);
  const starterIdMap = await createAccountStarterIdMap(userId, readLocalSnapshot(), baseline, cloud);
  assertCurrentAccount(userId, epoch);
  if (starterIdMap.size) {
    const latest = readLocalSnapshot();
    const migrated = mergeAccountPhraseData({
      phrases: latest.phrases.filter((phrase) => starterIdMap.has(phrase.id)).map((phrase) => ({ ...phrase, id: starterIdMap.get(phrase.id)! })),
      srsItems: latest.srsItems.filter((item) => starterIdMap.has(item.id)).map((item) => ({ ...item, id: starterIdMap.get(item.id)! })),
    }, {
      phrases: latest.phrases.filter((phrase) => !starterIdMap.has(phrase.id)),
      srsItems: latest.srsItems.filter((item) => !starterIdMap.has(item.id)),
    });
    saveLocalPhrases(migrated.phrases);
    saveLocalSrsItems(migrated.srsItems);
  }
  const local = readLocalSnapshot();
  if (!baseline) {
    baseline = cloud;
    const merged = completeDrillSchedule(mergeAccountPhraseData(local, cloud));
    saveLocalPhrases(merged.phrases);
    saveLocalSrsItems(merged.srsItems);
    writeAccountCheckpoint(userId, { baseline, local: merged });
  }
  const before = readLocalSnapshot();
  const plan = reconcileAccountPhraseData(baseline, before, cloud);
  const deferredIds = new Set<string>();
  let writeError: unknown;
  for (const [index, mutation] of plan.mutations.entries()) {
    assertCurrentAccount(userId, epoch);
    try {
      await sendMutation(session.access_token, mutation);
    } catch (error) {
      writeError = error;
      for (const deferred of plan.mutations.slice(index)) deferredIds.add(deferred.kind === "delete" ? deferred.id : deferred.phrase.id);
      break;
    }
  }
  const confirmed = plan.mutations.length
    ? completeDrillSchedule(normalizeAccountPhraseSnapshot(await cloudRequest(session.access_token, "GET")))
    : cloud;
  assertCurrentAccount(userId, epoch);
  const current = readLocalSnapshot();
  const pending = reconcileAccountPhraseData(before, current, confirmed);
  const conflictIds = new Set([...plan.conflicts, ...pending.conflicts]);
  const protectedIds = new Set([...conflictIds, ...deferredIds]);
  const result = completeDrillSchedule({
    phrases: [...pending.snapshot.phrases.filter((phrase) => !protectedIds.has(phrase.id)), ...current.phrases.filter((phrase) => protectedIds.has(phrase.id))],
    srsItems: [...pending.snapshot.srsItems.filter((item) => !protectedIds.has(item.id)), ...current.srsItems.filter((item) => protectedIds.has(item.id))],
  });
  const nextBaseline = {
    phrases: [...confirmed.phrases.filter((phrase) => !deferredIds.has(phrase.id)), ...baseline.phrases.filter((phrase) => deferredIds.has(phrase.id) || (conflictIds.has(phrase.id) && !confirmed.phrases.some((item) => item.id === phrase.id)))],
    srsItems: [...confirmed.srsItems.filter((item) => !deferredIds.has(item.id)), ...baseline.srsItems.filter((item) => deferredIds.has(item.id))],
  };
  saveLocalPhrases(result.phrases);
  saveLocalSrsItems(result.srsItems);
  writeAccountCheckpoint(userId, { baseline: nextBaseline, local: result });
  if (deferredIds.size) {
    emitAccountPhraseDataSynced();
    throw writeError;
  }
  if (pending.mutations.length && activeSync?.userId === userId) activeSync.again = true;
  setSyncStatus(conflictIds.size
    ? "別端末で削除されたフレーズに未同期の変更があります。端末に保持しています。不要なら保存画面で削除してください。"
    : pending.mutations.length ? "端末に保存済み・変更を同期中..." : "同期済み");
  emitAccountPhraseDataSynced();
}

function readLocalSnapshot(): SavedPhraseSnapshot {
  const snapshot = normalizeAccountPhraseSnapshot({
    phrases: loadLocalPhrases(),
    srsItems: loadLocalSrsItems(),
  });
  const completed = completeDrillSchedule(snapshot);
  if (JSON.stringify(completed.srsItems) !== JSON.stringify(snapshot.srsItems)) saveLocalSrsItems(completed.srsItems);
  return completed;
}

function completeDrillSchedule(snapshot: SavedPhraseSnapshot): SavedPhraseSnapshot {
  return { phrases: snapshot.phrases, srsItems: syncDrillSchedule({ phrases: snapshot.phrases, items: snapshot.srsItems }).items };
}

function assertCurrentAccount(userId: string, epoch: number): void {
  if (isDeviceRecoveryActive() || requestedUser !== userId || sessionEpoch !== epoch || currentDataOwner() !== userId) {
    throw new Error("アカウントが変わったため同期を中止しました");
  }
}

async function sendMutation(accessToken: string, mutation: PhraseMutation): Promise<void> {
  await cloudRequest(accessToken, mutation.kind === "delete" ? "DELETE" : "PATCH",
    mutation.kind === "delete" ? { phraseIds: [mutation.id] } : mutation);
}

async function cloudRequest(accessToken: string, method: string, body?: unknown, path = "/api/phrases"): Promise<unknown> {
  ensureDeviceBackup();
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: "Bearer " + accessToken } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "クラウドとの同期に失敗しました");
  return data;
}

function emitAccountPhraseDataSynced(): void {
  window.dispatchEvent(new Event(ACCOUNT_PHRASE_DATA_SYNCED_EVENT));
}
