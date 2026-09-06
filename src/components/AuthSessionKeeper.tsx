"use client";

import { useEffect } from "react";
import { getBrowserSupabase } from "@/lib/supabase";
import {
  clearOwnedAccountPhraseData,
  synchronizeAccountPhraseData,
} from "@/lib/account-phrase-sync";

export default function AuthSessionKeeper() {
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    let currentSession: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] = null;
    let disposed = false;
    let authRevision = 0;

    const syncSession = async (session: typeof currentSession) => {
      if (disposed) return;
      currentSession = session;
      try {
        if (!session) {
          clearOwnedAccountPhraseData();
          return;
        }
        await synchronizeAccountPhraseData(session);
      } catch (error) {
        console.warn("[AuthSessionKeeper] account data sync failed", error);
      }
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (authRevision === 0) void syncSession(data.session);
    }).catch((error) => {
      console.warn("[AuthSessionKeeper] session check failed", error);
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "TOKEN_REFRESHED") return;
      authRevision += 1;
      const revision = authRevision;
      window.setTimeout(() => {
        if (revision === authRevision) void syncSession(session);
      }, 0);
    });

    const refreshOnFocus = () => {
      if (currentSession) void syncSession(currentSession);
    };
    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") refreshOnFocus();
    };
    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("online", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      disposed = true;
      data.subscription.unsubscribe();
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener("online", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, []);

  return null;
}
