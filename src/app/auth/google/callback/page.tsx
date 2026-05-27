"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase";

type StoredGoogleAuth = {
  nonce?: string;
  state?: string;
  createdAt?: number;
};

const googleAuthStorageKey = "phrabit_google_auth";
const maxAuthAgeMs = 10 * 60 * 1000;

export default function GoogleAuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("ログイン処理中...");

  useEffect(() => {
    const finishLogin = async () => {
      const supabase = getBrowserSupabase();
      if (!supabase) {
        setMessage("ログイン設定がまだ完了していません。");
        return;
      }

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const error = hash.get("error");
      if (error) {
        setMessage("Googleログインがキャンセルされました。");
        return;
      }

      const idToken = hash.get("id_token");
      const state = hash.get("state");
      const stored = readStoredGoogleAuth();
      sessionStorage.removeItem(googleAuthStorageKey);

      if (!idToken || !state || !stored?.nonce || state !== stored.state) {
        setMessage("Googleログイン情報を確認できませんでした。もう一度ログインしてください。");
        return;
      }

      if (!stored.createdAt || Date.now() - stored.createdAt > maxAuthAgeMs) {
        setMessage("ログインの有効期限が切れました。もう一度ログインしてください。");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
        nonce: stored.nonce,
      });

      if (signInError) {
        console.error("[auth/google/callback] signInWithIdToken failed", signInError);
        setMessage("Googleログインに失敗しました。設定を確認してください。");
        return;
      }

      window.history.replaceState(null, "", "/auth/google/callback");
      router.replace("/");
    };

    void finishLogin();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <p className="text-base text-neutral-400">{message}</p>
    </main>
  );
}

function readStoredGoogleAuth(): StoredGoogleAuth | null {
  try {
    const raw = sessionStorage.getItem(googleAuthStorageKey);
    return raw ? (JSON.parse(raw) as StoredGoogleAuth) : null;
  } catch {
    return null;
  }
}
