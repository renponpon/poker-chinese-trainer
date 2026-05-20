"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getAuthHeaders } from "@/lib/auth-headers";
import { createId } from "@/lib/id";
import { addLocalPhrase, loadNickname, loadOwnerKey } from "@/lib/local-phrases";
import { playChinese, primeSpeech } from "@/lib/speech";
import type { PhraseDirection } from "@/lib/types";

type Result = {
  id: string | null;
  direction: PhraseDirection;
  japanese: string;
  chinese: string;
  pinyin: string;
  explanation: string;
};

type SpeechRecognitionEvent = Event & {
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEvent = Event & {
  error: string;
};

type SpeechRecognitionConstructor = new () => SpeechRecognition;

type SpeechRecognition = EventTarget & {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export default function AddPage() {
  const [direction, setDirection] = useState<PhraseDirection>("ja-to-zh");
  const [inputText, setInputText] = useState("");
  const [categoryId, setCategoryId] = useState<string>("other");
  const [shouldDrill, setShouldDrill] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [ownerKey, setOwnerKey] = useState("");
  const [nickname, setNickname] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const suppressSpeechErrorRef = useRef(false);

  useEffect(() => {
    setOwnerKey(loadOwnerKey());
    setNickname(loadNickname());
  }, []);

  useEffect(() => {
    setShouldDrill(direction === "ja-to-zh");
  }, [direction]);

  const handleGenerate = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      primeSpeech();
      const phraseId = createId();
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/phrase/add", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          direction,
          text: trimmed,
          ownerKey,
          nickname,
          phraseId,
          categoryId,
          shouldDrill,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "生成に失敗しました");
      }
      const localPhrase = addLocalPhrase({
        id: phraseId,
        direction,
        japanese: data.japanese,
        chinese: data.chinese,
        pinyin: data.pinyin,
        explanation: data.explanation,
        audioUrl: null,
        categoryId,
        shouldDrill,
        source: "manual",
        usedAt: null,
      });
      const nextResult = { ...(data as Result), id: localPhrase.id };
      setResult(nextResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    setInputText("");
    setResult(null);
    setError(null);
    setSpeechError(null);
  };

  const handleVoiceInput = () => {
    setSpeechError(null);

    if (listening) {
      suppressSpeechErrorRef.current = true;
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechError(
        "このブラウザは音声入力に未対応です。Chrome / Safari の最新版で試してください。",
      );
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = direction === "zh-to-ja" ? "zh-CN" : "ja-JP";
    recognition.interimResults = true;
    recognition.continuous = false;

    let finalTranscript = "";

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }

      const spoken = (finalTranscript || interim).trim();
      if (spoken) {
        setInputText(spoken);
      }
    };

    recognition.onerror = (event) => {
      if (
        suppressSpeechErrorRef.current ||
        event.error === "aborted" ||
        event.error === "no-speech"
      ) {
        suppressSpeechErrorRef.current = false;
        setListening(false);
        return;
      }
      setSpeechError(`音声入力エラー: ${event.error}`);
      setListening(false);
    };

    recognition.onend = () => {
      suppressSpeechErrorRef.current = false;
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      setListening(false);
      setSpeechError("音声入力を開始できませんでした。少し待って再度試してください。");
    }
  };

  return (
    <main
      className={`min-h-screen px-5 pt-8 transition-[padding] duration-200 ${
        inputFocused ? "pb-4" : "pb-28"
      }`}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <AppHeader />

        <section className="overflow-hidden rounded-[28px] bg-neutral-900/70">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center bg-neutral-950/70 px-4 py-3 text-base font-bold">
            <button
              type="button"
              onClick={() => setDirection("ja-to-zh")}
              className={`rounded-xl px-3 py-2.5 transition ${
                direction === "ja-to-zh"
                  ? "text-emerald-300"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
              }`}
            >
              日本語
            </button>
            <button
              type="button"
              onClick={() =>
                setDirection((value) =>
                  value === "ja-to-zh" ? "zh-to-ja" : "ja-to-zh",
                )
              }
              aria-label="翻訳方向を切り替え"
              className="rounded-full px-3 py-1.5 text-3xl leading-none text-emerald-400 hover:bg-neutral-900"
            >
              ⇄
            </button>
            <button
              type="button"
              onClick={() => setDirection("zh-to-ja")}
              className={`rounded-xl px-3 py-2.5 transition ${
                direction === "zh-to-ja"
                  ? "text-emerald-300"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
              }`}
            >
              中国語
            </button>
          </div>

          <div className="px-5 pt-5">
            <div className="mb-3 flex items-center justify-between text-base font-bold text-neutral-300">
              <span>{direction === "ja-to-zh" ? "日本語" : "中国語"}</span>
              <button
                type="button"
                onClick={() => setInputText("")}
                className="text-sm text-neutral-500 hover:text-neutral-200"
              >
                消去
              </button>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={
                direction === "ja-to-zh"
                  ? "日本語を入力"
                  : "中国語を入力"
              }
              rows={3}
              className="w-full resize-none bg-transparent text-2xl leading-relaxed text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
            />
          </div>
          <div className="mt-3 grid grid-cols-3 bg-neutral-950/30 text-emerald-300">
            <Link
              href="/conversation"
              aria-label="会話モードを開く"
              className="flex min-h-20 flex-col items-center justify-center gap-1 text-emerald-300 transition hover:bg-neutral-950/50 active:bg-neutral-950/70"
            >
              <ConversationIcon />
              <span className="text-xs font-bold">会話</span>
            </Link>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || !inputText.trim()}
              aria-label="送信"
              className="flex min-h-20 flex-col items-center justify-center gap-1 text-emerald-300 transition hover:bg-neutral-950/50 active:bg-neutral-950/70 disabled:cursor-not-allowed disabled:text-neutral-600"
            >
              <SendIcon />
              <span className="text-xs font-bold">
                {loading ? "送信中" : "送信"}
              </span>
            </button>
            <button
              type="button"
              onClick={handleVoiceInput}
              disabled={loading}
              aria-label="音声入力"
              aria-pressed={listening}
              className={`flex min-h-20 flex-col items-center justify-center gap-1 transition disabled:cursor-not-allowed disabled:text-neutral-600 ${
                listening
                  ? "bg-emerald-500 text-neutral-950"
                  : "text-emerald-300 hover:bg-neutral-950/50 active:bg-neutral-950/70"
              }`}
            >
              <MicIcon listening={listening} />
              <span className="text-xs font-bold">
                {listening ? "聞き取り中" : "音声"}
              </span>
            </button>
          </div>
          {speechError && (
            <div className="mx-5 mb-3 rounded-xl bg-yellow-900/20 px-4 py-3 text-sm text-yellow-100">
              {speechError}
            </div>
          )}
        </section>

        <div className="-mt-3 flex flex-col gap-3">
          <label className="flex items-start gap-3 rounded-2xl bg-neutral-950/50 p-3.5 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={shouldDrill}
              onChange={(e) => setShouldDrill(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>
              フレーズをドリルに追加
            </span>
          </label>
        </div>

        {error && (
          <div className="rounded-xl bg-red-900/20 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-4 rounded-[28px] bg-neutral-900/70 p-5">
            <div className="self-start rounded-full bg-neutral-950/70 px-3 py-1.5 text-xs font-bold text-neutral-300">
              {result.direction === "ja-to-zh" ? "日本語 → 中国語" : "中国語 → 日本語"}
              {shouldDrill ? " / ドリル対象" : " / ライブラリのみ"}
            </div>
            <div>
              <div className="text-sm font-bold text-neutral-500">
                {result.direction === "ja-to-zh" ? "中国語" : "日本語訳"}
              </div>
              <div className="mt-2 break-keep text-3xl font-bold text-white">
                {result.direction === "ja-to-zh" ? result.chinese : result.japanese}
              </div>
              {result.direction === "ja-to-zh" && (
                <button
                  onClick={() => playChinese(result.chinese)}
                  className="mt-4 rounded-full bg-neutral-950/80 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  ▶ 再生
                </button>
              )}
            </div>
            <div className="rounded-2xl bg-neutral-950/50 p-4">
              <div className="text-sm font-bold text-neutral-500">
                {result.direction === "ja-to-zh" ? "元の日本語" : "中国語"}
              </div>
              <div className="mt-1 text-xl text-neutral-100">
                {result.direction === "ja-to-zh" ? result.japanese : result.chinese}
              </div>
              <div className="mt-3 text-lg tracking-wide text-neutral-300">
                {result.pinyin}
              </div>
              {result.direction === "zh-to-ja" && (
                <button
                  onClick={() => playChinese(result.chinese)}
                  className="mt-4 rounded-full bg-neutral-950/80 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  ▶ 中国語を再生
                </button>
              )}
            </div>
            {result.explanation && (
              <div>
                <div className="text-sm font-bold text-neutral-500">
                  解説
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
                  {result.explanation}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleNext}
                className="flex-1 rounded-xl bg-neutral-950/80 px-4 py-3 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
              >
                続けてもう一つ追加
              </button>
              <Link
                href="/drill"
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white hover:bg-emerald-500"
              >
                ドリルへ
              </Link>
            </div>
          </div>
        )}
      </div>
      <BottomNav />
    </main>
  );
}

function ConversationIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 8h7" />
      <path d="M7 12h4" />
      <path d="M5 18a7 7 0 1 1 3.2 1.2L4 20l1-2Z" />
      <path d="M16 15.5a5 5 0 0 0 2.2-.7L21 16l-.7-2.8A5 5 0 0 0 16 5.5" />
    </svg>
  );
}

function MicIcon({ listening }: { listening: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-7 w-7 ${listening ? "animate-pulse" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
    </svg>
  );
}
