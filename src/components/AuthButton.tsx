"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getBrowserSupabase, isSupabaseConfigured } from "@/lib/supabase";

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const googleAuthStorageKey = "phrabit_google_auth";

export default function AuthButton() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const configured = isSupabaseConfigured() && Boolean(googleClientId);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoggingIn(false);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleGoogleLogin = async () => {
    if (!configured || !googleClientId) {
      setStatus("ログイン設定がまだ完了していません。");
      return;
    }

    setStatus(null);
    setLoggingIn(true);
    const noncePair = await createNoncePair();
    const state = createRandomValue();
    if (!noncePair || !state) {
      setLoggingIn(false);
      setStatus("このブラウザではGoogleログインを開始できませんでした。");
      return;
    }

    const authState = JSON.stringify({
      nonce: noncePair.raw,
      state,
      createdAt: Date.now(),
    });
    sessionStorage.setItem(googleAuthStorageKey, authState);
    localStorage.setItem(googleAuthStorageKey, authState);

    const redirectUri = `${window.location.origin}/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: "id_token",
      scope: "openid email profile",
      nonce: noncePair.hashed,
      state,
      prompt: "select_account",
    });

    window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  };

  const handleLogout = async () => {
    const supabase = getBrowserSupabase();
    if (supabase) {
      await supabase.auth.signOut({ scope: "local" });
    }
    setUser(null);
    setStatus(null);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-bold text-neutral-200 hover:bg-neutral-800"
      >
        {user ? user.email?.split("@")[0] : "ログイン"}
      </button>
      {open && (
        <div className="absolute right-0 top-14 z-50 w-80 rounded-2xl bg-neutral-950 p-5 text-left shadow-2xl shadow-black/50">
          {user ? (
            <div>
              <div className="text-lg font-bold text-neutral-100">
                ログイン中
              </div>
              <p className="mt-2 text-base leading-relaxed text-neutral-400">
                {user.email}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                このアカウントに新しく保存したフレーズを同期します。
              </p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-4 w-full rounded-xl bg-red-950/50 px-4 py-3 text-base font-bold text-red-100 hover:bg-red-900/50"
              >
                ログアウト
              </button>
            </div>
          ) : (
            <div>
              <div className="text-lg font-bold text-neutral-100">
                ログイン
              </div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                Googleアカウントでログインすると、保存したフレーズをクラウドに同期できます。
              </p>
              {!configured && (
                <p className="mt-3 rounded-xl bg-yellow-900/20 px-3 py-2 text-sm text-yellow-100">
                  ログイン設定がまだ完了していません。
                </p>
              )}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={!configured || loggingIn}
                className="mt-5 w-full rounded-xl bg-neutral-100 px-4 py-3 text-base font-bold text-neutral-950 hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
              >
                {loggingIn ? "Googleへ移動中..." : "Googleでログイン"}
              </button>
              {status && (
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                  {status}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

async function createNoncePair(): Promise<{ raw: string; hashed: string } | null> {
  const raw = createRandomValue();
  if (!raw || !globalThis.crypto?.subtle) {
    return null;
  }

  const encoded = new TextEncoder().encode(raw);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  const hashed = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { raw, hashed };
}

function createRandomValue(): string | null {
  if (!globalThis.crypto?.getRandomValues) return null;
  const random = new Uint8Array(32);
  globalThis.crypto.getRandomValues(random);
  return btoa(String.fromCharCode(...random))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
