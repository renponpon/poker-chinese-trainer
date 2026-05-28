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
    const failAndReturnHome = (nextMessage: string) => {
      setMessage(nextMessage);
      window.setTimeout(() => {
        router.replace("/");
      }, 1800);
    };

    const finishLogin = async () => {
      const callbackHash = window.location.hash;
      window.history.replaceState(null, "", "/auth/google/callback");

      const supabase = getBrowserSupabase();
      if (!supabase) {
        failAndReturnHome("ログイン設定がまだ完了していません。");
        return;
      }

      const hash = new URLSearchParams(callbackHash.replace(/^#/, ""));
      const error = hash.get("error");
      if (error) {
        failAndReturnHome("Googleログインがキャンセルされました。");
        return;
      }

      const idToken = hash.get("id_token");
      const state = hash.get("state");
      const stored = readStoredGoogleAuth();
      sessionStorage.removeItem(googleAuthStorageKey);
      localStorage.removeItem(googleAuthStorageKey);

      if (!idToken || !state || !stored?.nonce || state !== stored.state) {
        failAndReturnHome("Googleログイン情報を確認できませんでした。ホームに戻ります。");
        return;
      }

      if (!stored.createdAt || Date.now() - stored.createdAt > maxAuthAgeMs) {
        failAndReturnHome("ログインの有効期限が切れました。ホームに戻ります。");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
        nonce: stored.nonce,
      });

      if (signInError) {
        console.error("[auth/google/callback] signInWithIdToken failed", signInError);
        failAndReturnHome("Googleログインに失敗しました。ホームに戻ります。");
        return;
      }

      router.replace("/");
    };

    void finishLogin();
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-6">
      <p className="text-center text-base text-neutral-400">{message}</p>
      <button
        type="button"
        onClick={() => router.replace("/")}
        className="rounded-full bg-neutral-100 px-5 py-3 text-sm font-bold text-neutral-950"
      >
        ホームへ戻る
      </button>
    </main>
  );
}

function readStoredGoogleAuth(): StoredGoogleAuth | null {
  try {
    const raw =
      sessionStorage.getItem(googleAuthStorageKey) ??
      localStorage.getItem(googleAuthStorageKey);
    return raw ? (JSON.parse(raw) as StoredGoogleAuth) : null;
  } catch {
    return null;
  }
}
