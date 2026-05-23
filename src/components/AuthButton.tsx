"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getBrowserSupabase, getAuthCallbackUrl, isSupabaseConfigured } from "@/lib/supabase";

export default function AuthButton() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setEmail(data.session?.user?.email ?? "");
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setEmail(session?.user?.email ?? "");
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setStatus("Supabaseの環境変数が未設定です。");
      return;
    }
    const nextEmail = email.trim();
    if (!nextEmail) return;
    setStatus("ログインリンクを送信中...");
    const { error } = await supabase.auth.signInWithOtp({
      email: nextEmail,
      options: {
        emailRedirectTo: getAuthCallbackUrl(),
      },
    });
    setStatus(
      error
        ? error.message
        : "メールを確認してください。ログインリンクを送信しました。",
    );
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
            <form onSubmit={handleSubmit}>
              <div className="text-lg font-bold text-neutral-100">
                ログイン
              </div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                メールに届くリンクからログインします。ログイン後はフレーズをクラウドに保存できます。
              </p>
              {!configured && (
                <p className="mt-3 rounded-xl bg-yellow-900/20 px-3 py-2 text-sm text-yellow-100">
                  Supabase未設定です。環境変数を入れると使えます。
                </p>
              )}
              <label className="mt-4 block text-sm font-bold text-neutral-500">
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-xl bg-neutral-900 px-4 py-3 text-base text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <button
                type="submit"
                className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-base font-bold text-neutral-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                disabled={!configured || !email.trim()}
              >
                ログインリンクを送る
              </button>
              {status && (
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                  {status}
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
