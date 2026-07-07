import { getAuthHeaders } from "@/lib/auth-headers";
import {
  loadLocalPhrases,
  loadNickname,
  loadOwnerKey,
  updateLocalPhrase,
} from "@/infrastructure/local/phrase-storage";
import type { Phrase } from "@/lib/types";

export const PHRASE_UPDATED_EVENT = "phrabit-phrases-updated";
export const PENDING_EXPLANATIONS_CHANGED_EVENT = "phrabit-pending-explanations-changed";

const SESSION_KEY = "phrabit-pending-pack-jobs-v1";

type PendingPackJob = {
  packRequestId: string;
  phrases: Phrase[];
};

const pendingIds = new Set<string>();
let processing = false;

function isClient(): boolean {
  return typeof window !== "undefined";
}

function loadJobs(): PendingPackJob[] {
  if (!isClient()) return [];
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingPackJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJobs(jobs: PendingPackJob[]) {
  if (!isClient()) return;
  if (!jobs.length) {
    window.sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(jobs));
}

function syncPendingIdsFromJobs() {
  pendingIds.clear();
  for (const job of loadJobs()) {
    for (const phrase of job.phrases) {
      pendingIds.add(phrase.id);
    }
  }
}

function emitPendingChanged() {
  if (!isClient()) return;
  window.dispatchEvent(new CustomEvent(PENDING_EXPLANATIONS_CHANGED_EVENT));
}

function emitPhrasesUpdated(ids: string[]) {
  if (!isClient()) return;
  window.dispatchEvent(new CustomEvent(PHRASE_UPDATED_EVENT, { detail: { ids } }));
}

export function isExplanationPending(phraseId: string): boolean {
  return pendingIds.has(phraseId);
}

export function getPendingExplanationIds(): string[] {
  return [...pendingIds];
}

export function enqueuePackExplanationJob(job: PendingPackJob) {
  if (!isClient()) return;

  for (const phrase of job.phrases) {
    pendingIds.add(phrase.id);
  }

  const jobs = loadJobs();
  jobs.push(job);
  saveJobs(jobs);
  emitPendingChanged();
  void processQueue();
}

export function resumePendingPackJobs() {
  if (!isClient()) return;
  syncPendingIdsFromJobs();
  emitPendingChanged();
  void processQueue();
}

async function processQueue() {
  if (processing || !isClient()) return;
  processing = true;

  try {
    while (true) {
      const jobs = loadJobs();
      const job = jobs[0];
      if (!job) break;

      await runJob(job);
      saveJobs(jobs.slice(1));
    }
  } finally {
    syncPendingIdsFromJobs();
    emitPendingChanged();
    processing = false;
  }
}

async function runJob(job: PendingPackJob) {
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/phrase/generate-pack/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        packRequestId: job.packRequestId,
        phrases: job.phrases.map((phrase) => ({
          id: phrase.id,
          japanese: phrase.japanese,
          chinese: phrase.chinese,
          pinyin: phrase.pinyin,
          direction: phrase.direction,
          sourceLanguage: phrase.sourceLanguage,
          targetLanguage: phrase.targetLanguage,
          sourceText: phrase.sourceText,
          targetText: phrase.targetText,
          reading: phrase.reading,
          readingType: phrase.readingType,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "解説の生成に失敗しました");
    }

    const explanationMap = parseExplanationMap(data.explanations);
    const updatedIds: string[] = [];
    const savedPhrases: Phrase[] = [];

    for (const phrase of job.phrases) {
      const explanation = explanationMap.get(phrase.id);
      if (!explanation) continue;
      updateLocalPhrase(phrase.id, { explanation });
      pendingIds.delete(phrase.id);
      updatedIds.push(phrase.id);
      savedPhrases.push({ ...phrase, explanation });
    }

    if (updatedIds.length) {
      emitPhrasesUpdated(updatedIds);
      emitPendingChanged();
    }

    if (savedPhrases.length) {
      await fetch("/api/phrase/save-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          ownerKey: loadOwnerKey(),
          nickname: loadNickname(),
          phrases: savedPhrases,
        }),
        keepalive: true,
      });
    }

    if (updatedIds.length < job.phrases.length) {
      throw new Error("一部の解説を生成できませんでした");
    }
  } catch (error) {
    console.warn("[pending-pack-explanations] job failed", error);
    for (const phrase of job.phrases) {
      pendingIds.delete(phrase.id);
    }
    emitPhrasesUpdated(job.phrases.map((phrase) => phrase.id));
    emitPendingChanged();
  }
}

function parseExplanationMap(value: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(value)) return map;

  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const id = (row as { id?: unknown }).id;
    const explanation = (row as { explanation?: unknown }).explanation;
    if (typeof id === "string" && typeof explanation === "string" && explanation.trim()) {
      map.set(id, explanation.trim());
    }
  }
  return map;
}

export function refreshPhrasesFromStorage(): Phrase[] {
  return loadLocalPhrases();
}
