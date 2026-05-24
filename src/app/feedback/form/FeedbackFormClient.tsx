"use client";

import Link from "next/link";
import { useState } from "react";

export default function FeedbackFormClient() {
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = Boolean(message.trim()) && !sending;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname,
          message,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error || "送信に失敗しました");
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <section className="rounded-[28px] bg-neutral-900/70 p-6">
        <div className="inline-flex rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">
          送信しました
        </div>
        <h1 className="mt-5 text-3xl font-extrabold leading-tight text-neutral-50">
          ありがとうございます
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-300">
          回答はGoogleフォームに保存されました。いただいた内容を次の改善に使います。
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href="/"
            className="rounded-3xl bg-emerald-500 px-5 py-4 text-center text-base font-extrabold text-neutral-950 transition hover:bg-emerald-400"
          >
            アプリに戻る
          </Link>
          <button
            type="button"
            onClick={() => {
              setMessage("");
              setSent(false);
            }}
            className="rounded-3xl bg-neutral-950/70 px-5 py-4 text-base font-extrabold text-neutral-200 transition hover:bg-neutral-800"
          >
            もう一件送る
          </button>
        </div>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[28px] bg-neutral-900/70 p-6"
    >
      <h1 className="text-3xl font-extrabold leading-tight text-neutral-50">
        運営へのご要望
      </h1>

      <label className="mt-6 block">
        <span className="text-sm font-bold text-neutral-300">
          名前 ※匿名可
        </span>
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          maxLength={80}
          placeholder="匿名"
          className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-3 text-base text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-400 focus:outline-none"
        />
      </label>

      <label className="mt-5 block">
        <span className="text-sm font-bold text-neutral-300">
          記入欄 <span className="text-emerald-300">*</span>
        </span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={2000}
          required
          rows={6}
          placeholder="使っていて気になったことを一言でも書いてください"
          className="mt-2 w-full resize-none rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-3 text-base leading-relaxed text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-400 focus:outline-none"
        />
      </label>

      {error && (
        <div className="mt-4 rounded-2xl bg-red-900/20 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-6 w-full rounded-3xl bg-emerald-500 px-5 py-4 text-base font-extrabold text-neutral-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
      >
        {sending ? "送信中" : "送信"}
      </button>
    </form>
  );
}
