"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import BottomNav from "@/components/BottomNav";
import { getAuthHeaders } from "@/lib/auth-headers";
import { createId } from "@/lib/id";
import { addLocalPhrase, loadNickname, loadOwnerKey } from "@/lib/local-phrases";
import { playChinese, playJapanese, primeSpeech } from "@/lib/speech";
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

type Speaker = "ja" | "zh";

type Message = {
  id: string;
  speaker: Speaker;
  japanese: string;
  chinese: string;
  pinyin: string;
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

export default function ConversationPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [speaker, setSpeaker] = useState<Speaker>("ja");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState<Speaker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ownerKey] = useState(() => loadOwnerKey());
  const [nickname] = useState(() => loadNickname());
  const [inputFocused, setInputFocused] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const translatingRef = useRef(false);
  const suppressSpeechErrorRef = useRef(false);
  const speechTimeoutRef = useRef<number | null>(null);
  const highAccuracySpeech = useHighAccuracySpeech();

  useEffect(() => {
    primeSpeech();
  }, []);

  useEffect(() => {
    return () => {
      if (speechTimeoutRef.current) {
        window.clearTimeout(speechTimeoutRef.current);
      }
      recognitionRef.current?.stop();
    };
  }, []);

  const clearSpeechTimeout = () => {
    if (speechTimeoutRef.current) {
      window.clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
  };

  const handleHighAccuracyVoiceInput = (source: Speaker) => {
    setError(null);
    if (listening) {
      suppressSpeechErrorRef.current = true;
      recognitionRef.current?.stop();
      setListening(null);
    }
    setSpeaker(source);
    void highAccuracySpeech.startRecording({
      languageHint: source === "zh" ? "zh-CN" : "ja-JP",
      sourcePage: "conversation",
      onTranscript: setDraft,
    });
  };

  const translate = async (text: string, source: Speaker) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (translatingRef.current) return;

    const direction: PhraseDirection = source === "ja" ? "ja-to-zh" : "zh-to-ja";
    const phraseId = createId();
    translatingRef.current = true;
    setLoading(true);
    setError(null);

    try {
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
          categoryId: "conversation",
          shouldDrill: false,
          source: "conversation",
          generationMode: "fast",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "翻訳に失敗しました");
      }

      addLocalPhrase({
        id: phraseId,
        direction,
        japanese: data.japanese,
        chinese: data.chinese,
        pinyin: data.pinyin,
        explanation: data.explanation,
        audioUrl: null,
        categoryId: "conversation",
        shouldDrill: false,
        source: "conversation",
        usedAt: new Date().toISOString(),
      });

      setMessages((current) => [
        ...current,
        {
          id: phraseId,
          speaker: source,
          japanese: data.japanese,
          chinese: data.chinese,
          pinyin: data.pinyin,
          provider: data.provider,
        },
      ]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "翻訳に失敗しました");
    } finally {
      translatingRef.current = false;
      setLoading(false);
    }
  };

  const handleVoiceInput = (source: Speaker) => {
    setError(null);
    const direction: PhraseDirection = source === "ja" ? "ja-to-zh" : "zh-to-ja";
    if (shouldUseHighAccuracySpeechFirst()) {
      handleHighAccuracyVoiceInput(source);
      return;
    }

    if (listening) {
      suppressSpeechErrorRef.current = true;
      recognitionRef.current?.stop();
      setListening(null);
      return;
    }

    const supportError = getSpeechRecognitionSupportError();
    if (supportError) {
      recordWebSpeechUsageEvent({
        sourcePage: "conversation",
        direction,
        success: false,
        errorCode: "unsupported",
      });
      rememberHighAccuracySpeechPreference();
      setListening(null);
      recognitionRef.current = null;
      handleHighAccuracyVoiceInput(source);
      return;
    }

    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setError("このブラウザは音声入力に未対応です。手入力、またはスマホ標準キーボードのマイクを使ってください。");
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = source === "zh" ? "zh-CN" : "ja-JP";
    recognition.interimResults = true;
    recognition.continuous = false;

    let finalTranscript = "";
    const startedAt = Date.now();

    recognition.onstart = () => {
      clearSpeechTimeout();
      setSpeaker(source);
      setListening(source);
    };
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) finalTranscript += transcript;
        else interim += transcript;
      }
      setDraft((finalTranscript || interim).trim());
    };
    recognition.onerror = (event) => {
      if (
        suppressSpeechErrorRef.current ||
        event.error === "aborted"
      ) {
        suppressSpeechErrorRef.current = false;
        setListening(null);
        recognitionRef.current = null;
        return;
      }
      clearSpeechTimeout();
      recordWebSpeechUsageEvent({
        sourcePage: "conversation",
        direction,
        audioDurationMs: Date.now() - startedAt,
        success: false,
        errorCode: event.error,
      });
      if (shouldSwitchToHighAccuracySpeech(event.error)) {
        rememberHighAccuracySpeechPreference();
        setListening(null);
        recognitionRef.current = null;
        handleHighAccuracyVoiceInput(source);
        return;
      }
      setError(getSpeechRecognitionErrorMessage(event.error));
      setListening(null);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      clearSpeechTimeout();
      suppressSpeechErrorRef.current = false;
      setListening(null);
      recognitionRef.current = null;
      if (finalTranscript.trim()) {
        recordWebSpeechUsageEvent({
          sourcePage: "conversation",
          direction,
          outputChars: finalTranscript.trim().length,
          audioDurationMs: Date.now() - startedAt,
          success: true,
        });
        void translate(finalTranscript, source);
      }
    };

    try {
      speechTimeoutRef.current = window.setTimeout(() => {
        recognitionRef.current?.stop();
        recognitionRef.current = null;
        setListening(null);
        rememberHighAccuracySpeechPreference();
        recordWebSpeechUsageEvent({
          sourcePage: "conversation",
          direction,
          audioDurationMs: Date.now() - startedAt,
          success: false,
          errorCode: "start_timeout",
        });
        handleHighAccuracyVoiceInput(source);
      }, 8000);
      recognition.start();
    } catch {
      clearSpeechTimeout();
      setListening(null);
      recognitionRef.current = null;
      rememberHighAccuracySpeechPreference();
      recordWebSpeechUsageEvent({
        sourcePage: "conversation",
        direction,
        success: false,
        errorCode: "start_failed",
      });
      handleHighAccuracyVoiceInput(source);
    }
  };

  return (
    <main
      className={`flex min-h-screen flex-col bg-neutral-950 px-5 pt-8 transition-[padding] duration-200 ${
        inputFocused ? "pb-4" : "pb-28"
      }`}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <header className="grid shrink-0 grid-cols-3 items-center">
          <Link href="/" className="text-lg font-bold text-neutral-400 hover:text-neutral-100">
            ← 戻る
          </Link>
          <h1 className="text-center text-3xl font-extrabold text-neutral-100">
            会話
          </h1>
          <button
            type="button"
            onClick={() => setMessages([])}
            className="text-right text-lg font-bold text-neutral-400 hover:text-neutral-100"
          >
            会話を消去
          </button>
        </header>

        <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-4">
          {messages.length === 0 ? (
            <div className="flex h-full min-h-[180px] items-center justify-center text-center text-lg leading-relaxed text-neutral-500">
              日本語/中国語を切り替えて話すと、
              <br />
              その場で交互に翻訳できます。
            </div>
          ) : (
            messages.map((message) => (
              <ConversationBubble key={message.id} message={message} />
            ))
          )}
        </div>

        {(error || highAccuracySpeech.error) && (
          <div className="mb-3 rounded-2xl bg-red-900/20 px-4 py-3 text-base text-red-200">
            <div>
              {highAccuracySpeech.error || error}
            </div>
            <button
              type="button"
              onClick={() => handleHighAccuracyVoiceInput(speaker)}
              disabled={loading || highAccuracySpeech.transcribing}
              className="mt-3 rounded-full bg-red-100 px-3 py-1.5 text-xs font-bold text-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {highAccuracySpeech.recording ? "録音を停止" : "高精度音声入力で試す"}
            </button>
          </div>
        )}
        {(highAccuracySpeech.recording || highAccuracySpeech.transcribing) && (
          <div className="mb-2 text-right text-xs font-medium text-neutral-500">
            高精度音声入力起動中
          </div>
        )}

        <div className="shrink-0 overflow-hidden rounded-[28px] bg-neutral-900/80">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center bg-neutral-950/70 px-4 py-1.5 text-base font-bold">
            <button
              type="button"
              onClick={() => setSpeaker("ja")}
              className={`rounded-xl px-3 py-1.5 transition ${
                speaker === "ja"
                  ? "text-emerald-300"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
              }`}
            >
              日本語
            </button>
            <button
              type="button"
              onClick={() => setSpeaker((value) => (value === "ja" ? "zh" : "ja"))}
              aria-label="入力言語を切り替え"
              className="rounded-full px-3 py-0.5 text-2xl leading-none text-emerald-400 hover:bg-neutral-900"
            >
              ⇄
            </button>
            <button
              type="button"
              onClick={() => setSpeaker("zh")}
              className={`rounded-xl px-3 py-1.5 transition ${
                speaker === "zh"
                  ? "text-emerald-300"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
              }`}
            >
              中国語
            </button>
          </div>
          <div className="px-5 pt-3">
            <div className="mb-2 flex items-center justify-between text-base font-bold text-neutral-300">
              <span>{speaker === "ja" ? "日本語" : "中国語"}</span>
              <button
                type="button"
                onClick={() => setDraft("")}
                className="text-sm text-neutral-500 hover:text-neutral-200"
              >
                消去
              </button>
            </div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={speaker === "zh" ? "中国語を入力" : "日本語を入力"}
              rows={2}
              className="w-full resize-none bg-transparent text-2xl leading-relaxed text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
            />
          </div>
          <div className="mt-1 grid grid-cols-2 bg-neutral-950/30 text-emerald-300">
            <button
              type="button"
              onClick={() => translate(draft, speaker)}
              disabled={loading || !draft.trim()}
              aria-label="送信"
              className="flex min-h-14 flex-col items-center justify-center gap-1 text-emerald-300 transition hover:bg-neutral-950/50 active:bg-neutral-950/70 disabled:cursor-not-allowed disabled:text-neutral-600"
            >
              <SendIcon />
              <span className="text-xs font-bold">
                {loading ? "送信中" : "送信"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleVoiceInput(speaker)}
              disabled={loading || highAccuracySpeech.transcribing}
              aria-label="音声入力"
              aria-pressed={listening === speaker || highAccuracySpeech.recording}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 transition disabled:cursor-not-allowed disabled:text-neutral-600 ${
                listening === speaker || highAccuracySpeech.recording
                  ? "bg-emerald-500 text-neutral-950"
                  : "text-emerald-300 hover:bg-neutral-950/50 active:bg-neutral-950/70"
              }`}
            >
              <MicIcon active={listening === speaker || highAccuracySpeech.recording} />
              <span className="text-xs font-bold">
                {highAccuracySpeech.transcribing
                  ? "文字起こし中"
                  : listening === speaker || highAccuracySpeech.recording
                    ? "聞き取り中"
                    : "音声"}
              </span>
            </button>
          </div>
        </div>
      </div>
      <BottomNav />
    </main>
  );
}

function ConversationBubble({ message }: { message: Message }) {
  const isJapaneseSpeaker = message.speaker === "ja";
  const handlePlay = () => {
    if (isJapaneseSpeaker) {
      playChinese(message.chinese);
    } else {
      playJapanese(message.japanese);
    }
  };
  const primaryText = isJapaneseSpeaker ? message.japanese : message.chinese;
  const translatedText = isJapaneseSpeaker ? message.chinese : message.japanese;
  const textClass = "text-2xl font-bold leading-snug";
  return (
    <div className={`flex ${isJapaneseSpeaker ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[82%] rounded-[26px] px-5 py-4 ${
          isJapaneseSpeaker
            ? "rounded-bl-md bg-neutral-900 text-neutral-100"
            : "rounded-br-md bg-emerald-500 text-neutral-950"
        }`}
      >
        <div className={textClass}>
          {primaryText}
        </div>
        <div
          className={`${textClass} mt-1.5 ${
            isJapaneseSpeaker ? "text-neutral-400" : "text-neutral-800"
          }`}
        >
          {translatedText}
        </div>
        <button
          type="button"
          onClick={handlePlay}
          className={`mt-1.5 text-base font-bold ${
            isJapaneseSpeaker ? "text-emerald-300" : "text-neutral-800"
          }`}
        >
          ▶ 再生
        </button>
        {message.provider === "azure" && (
          <div
            className={`mt-1 text-xs font-medium ${
              isJapaneseSpeaker ? "text-neutral-500" : "text-neutral-700"
            }`}
          >
            Azure瞬間翻訳
          </div>
        )}
      </div>
    </div>
  );
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-7 w-7 ${active ? "animate-pulse" : ""}`}
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
