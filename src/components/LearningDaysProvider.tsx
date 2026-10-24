"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useDataOwner } from "@/lib/translation-draft";
import { getBrowserSupabase } from "@/lib/supabase";
import { syncLearningDays } from "@/lib/learning-days-sync";
import { currentDataOwner } from "@/infrastructure/local/account-cache-storage";
import { LEARNING_DAYS_CHANGED, LEARNING_STORAGE_PREFIX, SRS_STORAGE_KEY, loadLearningSnapshot, recoverLearningReceipts, type LearningSnapshot } from "@/infrastructure/local/learning-days-storage";
import { learningDayAt, learningDaySummary } from "@/domain/practice/learning-days";

type LearningState = { snapshot: LearningSnapshot | null; error: string | null; syncError: boolean; syncing: boolean; now: number; retry: () => void };
const LearningContext = createContext<LearningState>({ snapshot: null, error: null, syncError: false, syncing: false, now: 0, retry: () => {} });

export default function LearningDaysProvider({ children }: { children: ReactNode }) {
  const owner = useDataOwner();
  return <OwnedLearningDays key={owner} owner={owner}>{children}</OwnedLearningDays>;
}

function OwnedLearningDays({ owner, children }: { owner: string; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<LearningSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(0);
  const [retryNumber, setRetryNumber] = useState(0);
  const retry = useCallback(() => setRetryNumber((value) => value + 1), []);

  useEffect(() => {
    let disposed = false;
    let busy = false;
    let deferred: ReturnType<typeof setTimeout> | undefined;
    const isCurrent = () => !disposed && currentDataOwner() === owner;
    const read = () => {
      if (!isCurrent()) return;
      setNow(Date.now());
      try {
        recoverLearningReceipts();
        setSnapshot(loadLearningSnapshot(owner));
        setError(null);
      } catch { setError("学習記録を読み込み・保存できませんでした。回答は端末に残っています。データを削除せず、再試行してください。"); }
    };
    const sync = async () => {
      if (!isCurrent() || busy || owner === "guest" || document.visibilityState === "hidden") return;
      busy = true;
      setSyncing(true);
      try {
        const client = getBrowserSupabase();
        if (!client) throw new Error("unconfigured");
        const { data, error: authError } = await client.auth.getSession();
        if (authError || !data.session || data.session.user.id !== owner) throw new Error("session_missing");
        await syncLearningDays(owner, data.session.access_token, fetch, isCurrent);
        if (isCurrent()) { setSyncError(false); read(); }
      } catch { if (isCurrent()) setSyncError(true); }
      finally { busy = false; if (isCurrent()) setSyncing(false); }
    };
    const changed = () => {
      read();
      clearTimeout(deferred);
      deferred = setTimeout(() => {
        if (!isCurrent()) return;
        try { if (loadLearningSnapshot(owner).pending) void sync(); } catch { read(); }
      }, 1000);
    };
    const refresh = () => { read(); void sync(); };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === null || event.key === SRS_STORAGE_KEY || event.key.startsWith(`${LEARNING_STORAGE_PREFIX}${owner}:`)) refresh();
    };
    queueMicrotask(refresh);
    const interval = setInterval(refresh, 30000);
    window.addEventListener(LEARNING_DAYS_CHANGED, changed);
    window.addEventListener("storage", storageChanged);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      clearTimeout(deferred);
      clearInterval(interval);
      window.removeEventListener(LEARNING_DAYS_CHANGED, changed);
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [owner, retryNumber]);

  return <LearningContext.Provider value={{ snapshot, error, syncError, syncing, now, retry }}>{children}</LearningContext.Provider>;
}

export function useLearningDays() {
  const state = useContext(LearningContext);
  const summary = state.snapshot?.timeZone && state.now
    ? learningDaySummary(state.snapshot.days, learningDayAt(state.now, state.snapshot.timeZone)) : null;
  return { ...state, summary };
}
