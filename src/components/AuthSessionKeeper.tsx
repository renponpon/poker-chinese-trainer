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

    const syncSession = (session: typeof currentSession) => {
      currentSession = session;
      if (!session) {
        clearOwnedAccountPhraseData();
        return;
      }
      void synchronizeAccountPhraseData(session).catch((error) => {
        console.warn("[AuthSessionKeeper] account data sync failed", error);
      });
    };

    void supabase.auth.getSession().then(({ data }) => {
      syncSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      queueMicrotask(() => syncSession(session));
    });

    const refreshOnFocus = () => {
      if (currentSession) syncSession(currentSession);
    };
    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") refreshOnFocus();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, []);

  return null;
}
