import type { Session } from "@supabase/supabase-js";
import { mergeAccountPhraseData } from "@/application/phrase/merge-account-phrase-data";
import { normalizeAccountPhraseSnapshot } from "@/application/phrase/account-phrase-sync";
import type { SavedPhraseSnapshot } from "@/application/phrase/load-saved-phrases";
import { syncDrillSchedule } from "@/application/practice/drill-schedule";
import {
  loadLocalPhrases,
  saveLocalPhrases,
} from "@/infrastructure/local/phrase-storage";
import {
  loadLocalSrsItems,
  saveLocalSrsItems,
} from "@/infrastructure/local/srs-storage";
import { STARTER_PHRASES } from "@/lib/starter-phrases";
import type { Phrase, SrsItem } from "@/lib/types";
import { getAuthHeaders } from "./auth-headers";

export const ACCOUNT_PHRASE_DATA_SYNCED_EVENT = "phrabit-account-phrase-data-synced";

const CACHE_OWNER_KEY = "phrabit-account-cache-owner-v1";
const INITIAL_SYNC_PREFIX = "phrabit-account-initial-sync-v1:";
let activeSync: Promise<void> | null = null;

export function synchronizeAccountPhraseData(session: Session): Promise<void> {
  if (activeSync) return activeSync;
  activeSync = performAccountSync(session).finally(() => {
    activeSync = null;
  });
  return activeSync;
}

export function clearOwnedAccountPhraseData(): void {
  if (typeof window === "undefined" || !localStorage.getItem(CACHE_OWNER_KEY)) return;
  saveLocalPhrases([]);
  saveLocalSrsItems([]);
  localStorage.removeItem(CACHE_OWNER_KEY);
  emitAccountPhraseDataSynced();
}

export async function syncPhraseStateToCloud(
  phrase: Phrase,
  srsItem: SrsItem | null,
): Promise<boolean> {
  return mutateCloud("PATCH", { phrase, srsItem });
}

export async function deletePhrasesFromCloud(phraseIds: string[]): Promise<boolean> {
  if (phraseIds.length === 0) return true;
  return mutateCloud("DELETE", { phraseIds });
}

async function performAccountSync(session: Session): Promise<void> {
  if (typeof window === "undefined") return;
  const userId = session.user.id;
  const cacheOwner = localStorage.getItem(CACHE_OWNER_KEY);
  const initialSyncKey = `${INITIAL_SYNC_PREFIX}${userId}`;
  const needsMerge =
    cacheOwner !== userId || localStorage.getItem(initialSyncKey) !== "1";
  const local = loadSnapshotForAccount(cacheOwner, userId);
  const cloud = await fetchCloudSnapshot(session.access_token);
  let result = cloud;

  if (needsMerge) {
    const merged = completeDrillSchedule(mergeAccountPhraseData(local, cloud));
    const uploaded = await mutateCloudSnapshot(session.access_token, merged);
    result = completeDrillSchedule(mergeAccountPhraseData(merged, uploaded));
  }

  saveLocalPhrases(result.phrases);
  saveLocalSrsItems(result.srsItems);
  localStorage.setItem(CACHE_OWNER_KEY, userId);
  localStorage.setItem(initialSyncKey, "1");
  emitAccountPhraseDataSynced();
}

function loadSnapshotForAccount(
  cacheOwner: string | null,
  userId: string,
): SavedPhraseSnapshot {
  if (cacheOwner && cacheOwner !== userId) {
    return completeDrillSchedule({ phrases: STARTER_PHRASES, srsItems: [] });
  }
  return completeDrillSchedule({
    phrases: loadLocalPhrases(),
    srsItems: loadLocalSrsItems(),
  });
}

function completeDrillSchedule(snapshot: SavedPhraseSnapshot): SavedPhraseSnapshot {
  const { items } = syncDrillSchedule({
    phrases: snapshot.phrases,
    items: snapshot.srsItems,
  });
  return { phrases: snapshot.phrases, srsItems: items };
}

async function fetchCloudSnapshot(accessToken: string): Promise<SavedPhraseSnapshot> {
  const response = await fetch("/api/phrases", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "クラウドデータの取得に失敗しました");
  }
  return normalizeAccountPhraseSnapshot(data);
}

async function mutateCloudSnapshot(
  accessToken: string,
  snapshot: SavedPhraseSnapshot,
): Promise<SavedPhraseSnapshot> {
  const response = await fetch("/api/phrases", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(snapshot),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "既存データの統合に失敗しました");
  }
  return normalizeAccountPhraseSnapshot(data);
}

async function mutateCloud(method: "PATCH" | "DELETE", body: unknown): Promise<boolean> {
  const authHeaders = await getAuthHeaders();
  if (!authHeaders.Authorization) return false;
  const response = await fetch("/api/phrases", {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? "クラウドデータの更新に失敗しました");
  }
  return true;
}

function emitAccountPhraseDataSynced(): void {
  window.dispatchEvent(new Event(ACCOUNT_PHRASE_DATA_SYNCED_EVENT));
}
