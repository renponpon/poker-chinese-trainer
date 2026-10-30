"use client";

import { useEffect, useState } from "react";
import { DEFAULT_DRILL_LIMIT, type DrillLimit } from "@/domain/practice/drill-preferences";
import { currentDataOwner } from "@/infrastructure/local/account-cache-storage";
import { DRILL_PREFERENCES_CHANGED, DRILL_PREFERENCES_PREFIX, loadDrillPreferences, setDrillLimit } from "@/infrastructure/local/drill-preferences-storage";
import { getBrowserSupabase } from "./supabase";
import { syncDrillPreferences } from "./drill-preferences-sync";

export function useDrillPreferences(owner: string) {
  const [limit, setLimit] = useState<DrillLimit>(DEFAULT_DRILL_LIMIT);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    let busy = false;
    let deferred: ReturnType<typeof setTimeout> | undefined;
    const isCurrent = () => !disposed && currentDataOwner() === owner;
    const read = () => {
      if (!isCurrent()) return;
      try { const state = loadDrillPreferences(owner); setLimit(state.limit); setPending(Boolean(state.pendingId)); setReady(true); }
      catch { setError("出題数の設定を読み込めませんでした。再試行してください。"); }
    };
    const sync = async () => {
      if (!isCurrent() || busy || owner === "guest" || document.visibilityState === "hidden") return;
      busy = true;
      let sentId: string | null = null;
      try {
        sentId = loadDrillPreferences(owner).pendingId;
        const client = getBrowserSupabase();
        if (!client) throw new Error("unconfigured");
        const { data, error: authError } = await client.auth.getSession();
        if (authError || !data.session || data.session.user.id !== owner) throw new Error("session_missing");
        await syncDrillPreferences(owner, data.session.access_token, fetch, isCurrent);
        if (isCurrent()) { setError(null); read(); }
      } catch { if (isCurrent()) setError("出題数は端末内で利用できますが、設定の同期は未完了です。"); }
      finally {
        busy = false;
        if (isCurrent()) {
          try { const nextId = loadDrillPreferences(owner).pendingId; if (nextId && nextId !== sentId) deferred = setTimeout(() => void sync(), 200); } catch { read(); }
        }
      }
    };
    const changed = () => { read(); clearTimeout(deferred); deferred = setTimeout(() => void sync(), 200); };
    const refresh = () => { read(); void sync(); };
    const storage = (event: StorageEvent) => { if (!event.key || event.key === DRILL_PREFERENCES_PREFIX + owner) refresh(); };
    queueMicrotask(refresh);
    const interval = setInterval(refresh, 30000);
    window.addEventListener(DRILL_PREFERENCES_CHANGED, changed);
    window.addEventListener("storage", storage);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { disposed = true; clearTimeout(deferred); clearInterval(interval); window.removeEventListener(DRILL_PREFERENCES_CHANGED, changed); window.removeEventListener("storage", storage); window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [owner, retry]);
  return { limit, ready, error, pending, retry: () => setRetry((value) => value + 1), change: (value: DrillLimit) => {
    try { setDrillLimit(owner, value); setLimit(value); setError(null); return true; }
    catch { setError("出題数を保存できませんでした。設定は変更していません。"); return false; }
  } };
}
