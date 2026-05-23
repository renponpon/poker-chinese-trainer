"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      router.replace("/");
      return;
    }

    async function finishLogin() {
      if (!supabase) return;
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("[auth/callback] session exchange failed", error);
        }
      } else {
        await supabase.auth.getSession();
      }

      router.replace("/");
    }

    void finishLogin();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <p className="text-base text-neutral-400">ログイン処理中...</p>
    </main>
  );
}
