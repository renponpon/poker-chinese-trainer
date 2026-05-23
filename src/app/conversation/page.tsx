"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import BottomNav from "@/components/BottomNav";
import GenerationModeToggle from "@/components/GenerationModeToggle";
import { getAuthHeaders } from "@/lib/auth-headers";
import type { GenerationMode } from "@/lib/generation-mode";
import { createId } from "@/lib/id";
import { addLocalPhrase, loadLocalPhrases, loadNickname, loadOwnerKey, updateLocalPhrase } from "@/lib/local-phrases";
import { ensureSrsItems, loadSrsData } from "@/lib/srs";
import { playChinese, playJapanese, primeSpeech, stopSpeech } from "@/lib/speech";
import type { SpeechPlayOptions } from "@/lib/speech";
import {
  getSpeechRecognitionErrorMessage,
  getSpeechRecognitionSupportError,
  rememberHighAccuracySpeechPreference,
  shouldSwitchToHighAccuracySpeech,
  shouldUseHighAccuracySpeechFirst,
} from "@/lib/speech-recognition";
import { useHighAccuracySpeech } from "@/lib/use-high-accuracy-speech";
import { recordWebSpeechUsageEvent } from "@/lib/usage-events";
import type { PhraseDirection, Phrase } from "@/lib/types";

type Speaker = "ja" | "zh";

type Message = {
  id: string;
  speaker: Speaker;
  direction: PhraseDirection;
  japanese: string;
  chinese: string;
  pinyin: string;
  explanation: string;
  provider?: string;
  inDrill?: boolean;
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
  const [generationMode, setGenerationMode] = useState<GenerationMode>("speed");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState<Speaker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ownerKey] = useState(() => loadOwnerKey());
  const [nickname] = useState(() => loadNickname());
  const [inputFocused, setInputFocused] = useState(false);
  const [selectingForDrill, setSelectingForDrill] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addingToDrill, setAddingToDrill] = useState(false);
  const [drillAddError, setDrillAddError] = useState<string | null>(null);
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
          shouldDrill: true,
          source: "conversation",
          generationMode,
          persist: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "翻訳に失敗しました");
      }

      setMessages((current) => [
        ...current,
        {
          id: phraseId,
          speaker: source,
          direction,
          japanese: data.japanese,
          chinese: data.chinese,
          pinyin: data.pinyin ?? "",
          explanation: data.explanation ?? "",
          provider: data.provider,
          inDrill: false,
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

  const startDrillSelection = () => {
    const byId = new Map(loadLocalPhrases().map((phrase) => [phrase.id, phrase]));
    setMessages((current) =>
      current.map((message) => {
        const stored = byId.get(message.id);
        return {
          ...message,
          inDrill: stored?.shouldDrill ?? message.inDrill ?? false,
          pinyin: stored?.pinyin ?? message.pinyin,
          explanation: stored?.explanation ?? message.explanation,
        };
      }),
    );
    setSelectedIds(new Set());
    setDrillAddError(null);
    setSelectingForDrill(true);
  };

  const cancelDrillSelection = () => {
    setSelectingForDrill(false);
    setSelectedIds(new Set());
    setDrillAddError(null);
  };

  const togglePhraseSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enrichPhraseForDrill = async (
    message: Message,
    authHeaders: Record<string, string>,
  ): Promise<Phrase> => {
    let pinyin = message.pinyin;
    let explanation = message.explanation;
    const needsEnrich = !pinyin.trim() || !explanation.trim();

    if (needsEnrich) {
      const res = await fetch("/api/phrase/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          phraseId: message.id,
          direction: message.direction,
          japanese: message.japanese,
          chinese: message.chinese,
          pinyin: message.pinyin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "解説生成に失敗しました");
      }
      if (data.pinyin) pinyin = data.pinyin;
      explanation = data.explanation ?? explanation;
    }

    const existing = loadLocalPhrases().some((phrase) => phrase.id === message.id);
    if (existing) {
      updateLocalPhrase(message.id, {
        shouldDrill: true,
        pinyin,
        explanation,
      });
      return loadLocalPhrases().find((phrase) => phrase.id === message.id)!;
    }

    return addLocalPhrase({
      id: message.id,
      direction: message.direction,
      japanese: message.japanese,
      chinese: message.chinese,
      pinyin,
      explanation,
      audioUrl: null,
      categoryId: null,
      shouldDrill: true,
      source: "conversation",
      usedAt: new Date().toISOString(),
    });
  };

  const persistPhrasesToCloud = async (
    phrases: Phrase[],
    authHeaders: Record<string, string>,
  ) => {
    const chunkSize = 10;
    for (let index = 0; index < phrases.length; index += chunkSize) {
      const chunk = phrases.slice(index, index + chunkSize);
      const res = await fetch("/api/phrase/save-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          ownerKey,
          nickname,
          phrases: chunk,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "クラウドへの保存に失敗しました");
      }
    }
  };

  const handleAddSelectedToDrill = async () => {
    const targets = messages.filter(
      (message) => selectedIds.has(message.id) && !message.inDrill,
    );
    if (targets.length === 0) return;

    setAddingToDrill(true);
    setDrillAddError(null);

    try {
      const authHeaders = await getAuthHeaders();
      const savedPhrases: Phrase[] = [];
      for (const message of targets) {
        const phrase = await enrichPhraseForDrill(message, authHeaders);
        savedPhrases.push(phrase);
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id
              ? {
                  ...item,
                  inDrill: true,
                  pinyin: phrase.pinyin,
                  explanation: phrase.explanation,
                }
              : item,
          ),
        );
      }
      ensureSrsItems(loadLocalPhrases(), loadSrsData());
      await persistPhrasesToCloud(savedPhrases, authHeaders);
      setSelectedIds(new Set());
      setSelectingForDrill(false);
    } catch (err) {
      setDrillAddError(
        err instanceof Error ? err.message : "ドリルへの追加に失敗しました",
      );
    } finally {
      setAddingToDrill(false);
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
        inputFocused ? "pb-4" : "pb-[5.5rem]"
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
            onClick={selectingForDrill ? cancelDrillSelection : startDrillSelection}
            disabled={!selectingForDrill && messages.length === 0}
            className="text-right text-lg font-bold text-neutral-400 transition hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {selectingForDrill ? "キャンセル" : "ドリルに追加"}
          </button>
        </header>

        <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-2">
          {messages.length === 0 ? (
            <p className="px-2 pt-1 text-center text-lg leading-relaxed text-neutral-500">
              日本語/中国語を切り替えて話すと、
              <br />
              その場で交互に翻訳できます。
            </p>
          ) : (
            messages.map((message) => (
              <ConversationBubble
                key={message.id}
                message={message}
                selectingForDrill={selectingForDrill}
                selected={selectedIds.has(message.id)}
                onToggleSelect={() => togglePhraseSelection(message.id)}
              />
            ))
          )}
        </div>

        {selectingForDrill && (
          <div className="mb-3 shrink-0 rounded-2xl bg-neutral-900/80 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-neutral-400">
                {selectedIds.size}件選択
              </span>
              <button
                type="button"
                onClick={() => void handleAddSelectedToDrill()}
                disabled={selectedIds.size === 0 || addingToDrill}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-neutral-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addingToDrill ? "追加中..." : "ドリルに追加"}
              </button>
            </div>
            {drillAddError && (
              <p className="mt-2 text-sm text-red-300">{drillAddError}</p>
            )}
          </div>
        )}

        <div className="mt-auto shrink-0">
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
          <div className="grid grid-cols-[1fr_auto_1fr] items-center bg-neutral-950/70 px-4 py-3 text-base font-bold">
            <button
              type="button"
              onClick={() => setSpeaker("ja")}
              className={`rounded-xl px-3 py-2 transition ${
                speaker === "ja"
                  ? "bg-emerald-500 text-neutral-950 shadow-sm shadow-emerald-500/30"
                  : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"
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
              className={`rounded-xl px-3 py-2 transition ${
                speaker === "zh"
                  ? "bg-emerald-500 text-neutral-950 shadow-sm shadow-emerald-500/30"
                  : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"
              }`}
            >
              中国語
            </button>
          </div>
          <div className="px-5 pt-5">
            <div className="mb-3 flex items-center justify-between text-base font-bold text-neutral-300">
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
          <div className="mt-3 grid grid-cols-2 bg-neutral-950/30 text-emerald-300">
            <button
              type="button"
              onClick={() => translate(draft, speaker)}
              disabled={loading || !draft.trim()}
              aria-label="送信"
              className="flex min-h-20 flex-col items-center justify-center gap-1 text-emerald-300 transition hover:bg-neutral-950/50 active:bg-neutral-950/70 disabled:cursor-not-allowed disabled:text-neutral-600"
            >
              <SendIcon />
              <span className="text-xs font-bold">
                {loading
                  ? generationMode === "quality"
                    ? "品質生成中"
                    : "送信中"
                  : "送信"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleVoiceInput(speaker)}
              disabled={loading || highAccuracySpeech.transcribing}
              aria-label="音声入力"
              aria-pressed={listening === speaker || highAccuracySpeech.recording}
              className={`flex min-h-20 flex-col items-center justify-center gap-1 transition disabled:cursor-not-allowed disabled:text-neutral-600 ${
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

        <div className="-mt-1">
          <div className="flex items-center justify-end rounded-2xl bg-neutral-950/50 px-3 py-2">
            <GenerationModeToggle
              value={generationMode}
              onChange={setGenerationMode}
            />
          </div>
        </div>
        </div>
      </div>
      <BottomNav />
    </main>
  );
}

function ConversationBubble({
  message,
  selectingForDrill = false,
  selected = false,
  onToggleSelect,
}: {
  message: Message;
  selectingForDrill?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const isJapaneseSpeaker = message.speaker === "ja";
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const selectable = selectingForDrill && !message.inDrill;

  const play = useCallback(
    (options: SpeechPlayOptions) => {
      if (isJapaneseSpeaker) {
        playChinese(message.chinese, options);
      } else {
        playJapanese(message.japanese, options);
      }
    },
    [isJapaneseSpeaker, message.chinese, message.japanese],
  );

  useEffect(() => {
    return () => {
      if (playingRef.current) {
        stopSpeech();
      }
    };
  }, []);

  const handleCardClick = () => {
    if (selectable) {
      onToggleSelect?.();
      return;
    }
    if (selectingForDrill) return;

    if (playingRef.current) {
      stopSpeech();
      playingRef.current = false;
      setPlaying(false);
      return;
    }

    playingRef.current = true;
    setPlaying(true);
    play({
      onEnd: () => {
        playingRef.current = false;
        setPlaying(false);
      },
    });
  };

  const primaryText = isJapaneseSpeaker ? message.japanese : message.chinese;
  const translatedText = isJapaneseSpeaker ? message.chinese : message.japanese;
  const textClass = "text-2xl font-bold leading-snug";
  const playLabel = isJapaneseSpeaker
    ? `中国語訳「${message.chinese}」を再生`
    : `日本語訳「${message.japanese}」を再生`;

  return (
    <div className={`flex ${isJapaneseSpeaker ? "justify-start" : "justify-end"}`}>
      <button
        type="button"
        onClick={handleCardClick}
        disabled={selectingForDrill && Boolean(message.inDrill)}
        aria-label={
          selectable
            ? selected
              ? "選択を解除"
              : "ドリルに追加するフレーズとして選択"
            : playing
              ? "再生を停止"
              : playLabel
        }
        aria-pressed={selectable ? selected : playing}
        className={`relative max-w-[82%] rounded-[26px] px-5 py-4 text-left transition active:scale-[0.98] ${
          isJapaneseSpeaker
            ? "rounded-bl-md bg-neutral-900 text-neutral-100 hover:bg-neutral-800"
            : "rounded-br-md bg-emerald-500 text-neutral-950 hover:bg-emerald-400"
        } ${
          playing ? "ring-2 ring-emerald-300/70" : ""
        } ${
          selected ? "ring-2 ring-emerald-400" : ""
        } ${
          message.inDrill && selectingForDrill ? "opacity-50" : ""
        } ${
          selectable ? "cursor-pointer" : ""
        } disabled:cursor-not-allowed`}
      >
        {selectable && (
          <span
            className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              selected
                ? "bg-emerald-400 text-neutral-950"
                : isJapaneseSpeaker
                  ? "border border-neutral-600 text-transparent"
                  : "border border-neutral-800/60 text-transparent"
            }`}
            aria-hidden="true"
          >
            ✓
          </span>
        )}
        {message.inDrill && selectingForDrill && (
          <span className="absolute right-3 top-3 rounded-full bg-neutral-950/20 px-2 py-0.5 text-[10px] font-bold">
            追加済
          </span>
        )}
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
      </button>
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
