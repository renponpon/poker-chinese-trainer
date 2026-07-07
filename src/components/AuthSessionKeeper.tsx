"use client";

import { useEffect } from "react";
import { getBrowserSupabase } from "@/lib/supabase";

export default function AuthSessionKeeper() {
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    void supabase.auth.getSession();

    const { data } = supabase.auth.onAuthStateChange(() => {
      // Supabase persists/refreshes the session in localStorage automatically.
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  return null;
}
