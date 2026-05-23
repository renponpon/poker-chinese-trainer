"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getAuthHeaders } from "@/lib/auth-headers";
import { createId } from "@/lib/id";
import {
  addLocalPhrase,
  deleteLocalPhraseAndSrs,
  loadNickname,
  loadOwnerKey,
  updateLocalPhrase,
} from "@/lib/local-phrases";
import SpeechPlayButton from "@/components/SpeechPlayButton";
import { playChinese, primeSpeech } from "@/lib/speech";
import {
  getSpeechRecognitionErrorMessage,
  getSpeechRecognitionSupportError,
  rememberHighAccuracySpeechPreference,
  shouldSwitchToHighAccuracySpeech,
  shouldUseHighAccuracySpeechFirst,
} from "@/lib/speech-recognition";
import { useHighAccuracySpeech } from "@/lib/use-high-accuracy-speech";
import { recordWebSpeechUsageEvent } from "@/lib/usage-events";
import type { PhraseDirection } from "@/lib/types";
import { getTranslationProviderLabel } from "@/lib/translation-provider-label";

import GenerationModeToggle from "@/components/GenerationModeToggle";
import {
  type GenerationMode,
} from "@/lib/generation-mode";

type Result = {
  id: string | null;
  direction: PhraseDirection;
  japanese: string;
  chinese: string;
  pinyin: string;
  explanation: string;
  provider?: string;
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
  const [categoryId] = useState<string>("other");
  const [shouldDrill, setShouldDrill] = useState(true);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("normal");
  const [loading, setLoading] = useState(false);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [ownerKey] = useState(() => loadOwnerKey());
  const [nickname] = useState(() => loadNickname());
  const [inputFocused, setInputFocused] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const suppressSpeechErrorRef = useRef(false);
  const speechTimeoutRef = useRef<number | null>(null);
  const lastSubmittedDraftKeyRef = useRef<string | null>(null);
  const lastSubmittedPhraseIdRef = useRef<string | null>(null);
  const activePhraseIdRef = useRef<string | null>(null);
  const highAccuracySpeech = useHighAccuracySpeech();

  useEffect(() => {
    return () => {
      if (speechTimeoutRef.current) {
        window.clearTimeout(speechTimeoutRef.current);
      }
      recognitionRef.current?.stop();
    };
  }, []);

  const handleGenerate = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setExplanationError(null);
    setExplanationLoading(false);
    setResult(null);
    try {
      primeSpeech();
      const draftKey = buildAddDraftKey(direction, trimmed);
      const supersededPhraseId =
        draftKey === lastSubmittedDraftKeyRef.current
          ? lastSubmittedPhraseIdRef.current
          : null;
      if (supersededPhraseId) {
        deleteLocalPhraseAndSrs(supersededPhraseId);
      }

      const phraseId = createId();
      activePhraseIdRef.current = phraseId;
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
          generationMode,
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
      lastSubmittedDraftKeyRef.current = draftKey;
      lastSubmittedPhraseIdRef.current = localPhrase.id;
      setResult(nextResult);
      setLoading(false);
      if (!data.explanation?.trim()) {
        setExplanationError(null);
        void generateExplanation(nextResult, authHeaders);
      } else {
        setExplanationError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const generateExplanation = async (
    baseResult: Result,
    authHeaders: Record<string, string>,
  ) => {
    setExplanationLoading(true);
    setExplanationError(null);
    try {
      const res = await fetch("/api/phrase/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          phraseId: baseResult.id,
          direction: baseResult.direction,
          japanese: baseResult.japanese,
          chinese: baseResult.chinese,
          pinyin: baseResult.pinyin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "解説生成に失敗しました");
      }
      updateLocalPhrase(baseResult.id ?? "", {
        explanation: data.explanation,
        ...(data.pinyin ? { pinyin: data.pinyin } : {}),
      });
      if (activePhraseIdRef.current !== baseResult.id) return;
      setResult((current) =>
        current?.id === baseResult.id
          ? {
              ...current,
              explanation: data.explanation,
              ...(data.pinyin ? { pinyin: data.pinyin } : {}),
            }
          : current,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "解説生成に失敗しました";
      console.warn("[AddPage] explanation generation failed", err);
      if (activePhraseIdRef.current === baseResult.id) {
        setExplanationError(message);
      }
    } finally {
      if (activePhraseIdRef.current === baseResult.id) {
        setExplanationLoading(false);
      }
    }
  };

  const handleNext = () => {
    setInputText("");
    setResult(null);
    setError(null);
    setSpeechError(null);
    setExplanationLoading(false);
    setExplanationError(null);
    lastSubmittedDraftKeyRef.current = null;
    lastSubmittedPhraseIdRef.current = null;
    activePhraseIdRef.current = null;
  };

  const clearSpeechTimeout = () => {
    if (speechTimeoutRef.current) {
      window.clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
  };

  const handleHighAccuracyVoiceInput = () => {
    setSpeechError(null);
    if (listening) {
      suppressSpeechErrorRef.current = true;
      recognitionRef.current?.stop();
      setListening(false);
    }
    void highAccuracySpeech.startRecording({
      languageHint: direction === "zh-to-ja" ? "zh-CN" : "ja-JP",
      sourcePage: "add",
      onTranscript: setInputText,
    });
  };

  const handleVoiceInput = () => {
    setSpeechError(null);

    if (shouldUseHighAccuracySpeechFirst()) {
      handleHighAccuracyVoiceInput();
      return;
    }

    if (listening) {
      suppressSpeechErrorRef.current = true;
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const supportError = getSpeechRecognitionSupportError();
    if (supportError) {
      recordWebSpeechUsageEvent({
        sourcePage: "add",
        direction,
        success: false,
        errorCode: "unsupported",
      });
      rememberHighAccuracySpeechPreference();
      setListening(false);
      recognitionRef.current = null;
      handleHighAccuracyVoiceInput();
      return;
    }

    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechError(
        "このブラウザは音声入力に未対応です。手入力、またはスマホ標準キーボードのマイクを使ってください。",
      );
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = direction === "zh-to-ja" ? "zh-CN" : "ja-JP";
    recognition.interimResults = true;
    recognition.continuous = false;

    let finalTranscript = "";
    const startedAt = Date.now();

    recognition.onstart = () => {
      clearSpeechTimeout();
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
        event.error === "aborted"
      ) {
        suppressSpeechErrorRef.current = false;
        setListening(false);
        recognitionRef.current = null;
        return;
      }
      clearSpeechTimeout();
      recordWebSpeechUsageEvent({
        sourcePage: "add",
        direction,
        audioDurationMs: Date.now() - startedAt,
        success: false,
        errorCode: event.error,
      });
      if (shouldSwitchToHighAccuracySpeech(event.error)) {
        rememberHighAccuracySpeechPreference();
        setListening(false);
        recognitionRef.current = null;
        handleHighAccuracyVoiceInput();
        return;
      }
      setSpeechError(getSpeechRecognitionErrorMessage(event.error));
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      clearSpeechTimeout();
      suppressSpeechErrorRef.current = false;
      setListening(false);
      recognitionRef.current = null;
      if (finalTranscript.trim()) {
        recordWebSpeechUsageEvent({
          sourcePage: "add",
          direction,
          outputChars: finalTranscript.trim().length,
          audioDurationMs: Date.now() - startedAt,
          success: true,
        });
      }
    };

    try {
      speechTimeoutRef.current = window.setTimeout(() => {
        recognitionRef.current?.stop();
        recognitionRef.current = null;
        setListening(false);
        rememberHighAccuracySpeechPreference();
        recordWebSpeechUsageEvent({
          sourcePage: "add",
          direction,
          audioDurationMs: Date.now() - startedAt,
          success: false,
          errorCode: "start_timeout",
        });
        handleHighAccuracyVoiceInput();
      }, 8000);
      recognition.start();
    } catch {
      clearSpeechTimeout();
      setListening(false);
      recognitionRef.current = null;
      rememberHighAccuracySpeechPreference();
      recordWebSpeechUsageEvent({
        sourcePage: "add",
        direction,
        success: false,
        errorCode: "start_failed",
      });
      handleHighAccuracyVoiceInput();
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
              onClick={() => {
                setDirection("ja-to-zh");
                setShouldDrill(true);
              }}
              className={`rounded-xl px-3 py-2 transition ${
                direction === "ja-to-zh"
                  ? "bg-emerald-500 text-neutral-950 shadow-sm shadow-emerald-500/30"
                  : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"
              }`}
            >
              日本語
            </button>
            <button
              type="button"
              onClick={() =>
                setDirection((value) => {
                  const next = value === "ja-to-zh" ? "zh-to-ja" : "ja-to-zh";
                  setShouldDrill(next === "ja-to-zh");
                  return next;
                })
              }
              aria-label="翻訳方向を切り替え"
              className="rounded-full px-3 py-1.5 text-3xl leading-none text-emerald-400 hover:bg-neutral-900"
            >
              ⇄
            </button>
            <button
              type="button"
              onClick={() => {
                setDirection("zh-to-ja");
                setShouldDrill(false);
              }}
              className={`rounded-xl px-3 py-2 transition ${
                direction === "zh-to-ja"
                  ? "bg-emerald-500 text-neutral-950 shadow-sm shadow-emerald-500/30"
                  : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"
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
                {loading
                  ? generationMode === "quality"
                    ? "品質モード生成中"
                    : "送信中"
                  : "送信"}
              </span>
            </button>
            <button
              type="button"
              onClick={handleVoiceInput}
              disabled={loading || highAccuracySpeech.transcribing}
              aria-label="音声入力"
              aria-pressed={listening || highAccuracySpeech.recording}
              className={`flex min-h-20 flex-col items-center justify-center gap-1 transition disabled:cursor-not-allowed disabled:text-neutral-600 ${
                listening || highAccuracySpeech.recording
                  ? "bg-emerald-500 text-neutral-950"
                  : "text-emerald-300 hover:bg-neutral-950/50 active:bg-neutral-950/70"
              }`}
            >
              <MicIcon listening={listening || highAccuracySpeech.recording} />
              <span className="text-xs font-bold">
                {highAccuracySpeech.transcribing
                  ? "文字起こし中"
                  : listening || highAccuracySpeech.recording
                    ? "聞き取り中"
                    : "音声"}
              </span>
            </button>
          </div>
          {(speechError || highAccuracySpeech.error) && (
            <div className="mx-5 mb-3 rounded-xl bg-yellow-900/20 px-4 py-3 text-sm text-yellow-100">
              <div>
                {highAccuracySpeech.error || speechError}
              </div>
              <button
                type="button"
                onClick={handleHighAccuracyVoiceInput}
                disabled={loading || highAccuracySpeech.transcribing}
                className="mt-3 rounded-full bg-yellow-100 px-3 py-1.5 text-xs font-bold text-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {highAccuracySpeech.recording ? "録音を停止" : "高精度音声入力で試す"}
              </button>
            </div>
          )}
          {(highAccuracySpeech.recording || highAccuracySpeech.transcribing) && (
            <div className="mx-5 mb-3 text-right text-xs font-medium text-neutral-500">
              高精度音声入力起動中
            </div>
          )}
        </section>

        <div className="-mt-1 mb-0">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-950/50 px-3 py-2">
            <label className="flex min-w-0 flex-1 items-center gap-3 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={shouldDrill}
                onChange={(e) => setShouldDrill(e.target.checked)}
                className="h-4 w-4 shrink-0"
              />
              <span>フレーズをドリルに追加</span>
            </label>
            <GenerationModeToggle
              value={generationMode}
              onChange={setGenerationMode}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-900/20 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {result && (
          <div className="-mt-2 flex flex-col gap-3 rounded-[28px] bg-neutral-900/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="rounded-full bg-neutral-950/70 px-3 py-1 text-xs font-bold text-neutral-300">
                {result.direction === "ja-to-zh" ? "日本語 → 中国語" : "中国語 → 日本語"}
                {shouldDrill ? " / ドリル対象" : " / ライブラリのみ"}
                {(() => {
                  const providerLabel = getTranslationProviderLabel(result.provider);
                  return providerLabel ? ` / ${providerLabel}` : "";
                })()}
              </div>
              {result.chinese && (
                <SpeechPlayButton
                  play={(options) => playChinese(result.chinese, options)}
                  className="shrink-0 rounded-full bg-neutral-950/80 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
                  playingClassName="text-emerald-300"
                />
              )}
            </div>
            <div>
              <div className="text-xs font-bold text-neutral-500">
                {result.direction === "ja-to-zh" ? "中国語" : "日本語訳"}
              </div>
              <div className="mt-1 break-words [overflow-wrap:anywhere] text-3xl font-bold leading-snug text-white">
                {result.direction === "ja-to-zh" ? result.chinese : result.japanese}
              </div>
              {result.direction === "ja-to-zh" && (
                result.pinyin ? (
                  <div className="mt-1 text-base tracking-wide text-neutral-300">
                    {result.pinyin}
                  </div>
                ) : explanationLoading ? (
                  <div className="mt-1 text-base text-neutral-500">ピンインを生成中...</div>
                ) : null
              )}
              {result.direction === "zh-to-ja" && (
                <>
                  {result.chinese && (
                    <div className="mt-2 break-words [overflow-wrap:anywhere] text-xl leading-snug text-neutral-400">
                      {result.chinese}
                    </div>
                  )}
                  {result.pinyin ? (
                    <div className="mt-0.5 text-base tracking-wide text-neutral-300">
                      {result.pinyin}
                    </div>
                  ) : explanationLoading ? (
                    <div className="mt-0.5 text-base text-neutral-500">ピンインを生成中...</div>
                  ) : null}
                </>
              )}
            </div>
            {(explanationLoading || result.explanation || explanationError) && (
              <div>
                <div className="text-sm font-bold text-neutral-500">
                  解説
                </div>
                <div
                  className={`mt-2 whitespace-pre-wrap text-sm leading-relaxed ${
                    explanationError ? "text-red-200" : "text-neutral-300"
                  }`}
                >
                  {explanationError ??
                    result.explanation ??
                    "解説を生成中..."}
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

function buildAddDraftKey(direction: PhraseDirection, text: string): string {
  return `${direction}:${text}`;
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
