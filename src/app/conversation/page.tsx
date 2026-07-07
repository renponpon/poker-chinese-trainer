"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  linkTranslationHistoryToSavedPhrase,
  recordTranslationHistory,
} from "@/application/phrase/record-translation-history";
import { saveTranslationAsSavedPhrase } from "@/application/phrase/save-translation-as-saved-phrase";
import { syncDrillSchedule } from "@/application/practice/drill-schedule";
import BottomNav from "@/components/BottomNav";
import GenerationModeToggle from "@/components/GenerationModeToggle";
import TargetLanguageSelect from "@/components/TargetLanguageSelect";
import { getAuthHeaders } from "@/lib/auth-headers";
import type { GenerationMode } from "@/lib/generation-mode";
import { createId } from "@/lib/id";
import {
  buildDirection,
  getLanguageLabel,
  LANGUAGE_CONFIGS,
} from "@/lib/languages";
import {
  loadLocalSrsItems,
  saveLocalSrsItems,
} from "@/infrastructure/local/srs-storage";
import {
  addLocalTranslationHistoryItem,
  loadLocalTranslationHistory,
  updateLocalTranslationHistoryItem,
} from "@/infrastructure/local/translation-history-storage";
import {
  addLocalPhrase,
  loadLocalPhrases,
  loadNickname,
  loadOwnerKey,
  updateLocalPhrase,
} from "@/infrastructure/local/phrase-storage";
import { playSpeechForLang, prefetchSpeechForLang, primeSpeech, stopSpeech } from "@/lib/speech";
import type { SpeechPlayOptions } from "@/lib/speech";
import {
  getSpeechRecognitionErrorMessage,
  getSpeechRecognitionSupportError,
  isMicrophoneAccessError,
  rememberHighAccuracySpeechPreference,
  shouldSwitchToHighAccuracySpeech,
  shouldUseHighAccuracySpeechFirst,
} from "@/lib/speech-recognition";
import { useHighAccuracySpeech } from "@/lib/use-high-accuracy-speech";
import { recordWebSpeechUsageEvent } from "@/lib/usage-events";
import { recordProductAnalyticsEvent } from "@/lib/product-analytics";
import { toStudyPhraseFields } from "@/lib/study-phrase";
import {
  TRANSLATION_WARMUP_DELAY_MS,
  triggerTranslationWarmup,
} from "@/lib/translation-warmup";
import type { LanguageCode, PhraseDirection, Phrase } from "@/lib/types";

type Speaker = "ja" | "target";

type Message = {
  id: string;
  speaker: Speaker;
  direction: PhraseDirection;
  japanese: string;
  chinese: string;
  pinyin: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  sourceText: string;
  targetText: string;
  reading: string;
  readingType: "pinyin" | "none";
  explanation: string;
  provider?: string;
  inDrill?: boolean;
  historyItemId?: string;
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
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>("zh");
  const [speaker, setSpeaker] = useState<Speaker>("ja");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("speed");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState<Speaker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsMicrophonePermission, setNeedsMicrophonePermission] = useState(false);
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
  const inputStartRecordedRef = useRef(false);
  const highAccuracySpeech = useHighAccuracySpeech();

  const handleTargetLanguageChange = (language: LanguageCode) => {
    setTargetLanguage(language);
    setSpeaker("ja");
  };

  useEffect(() => {
    primeSpeech();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(
      () => triggerTranslationWarmup(targetLanguage),
      TRANSLATION_WARMUP_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [targetLanguage]);

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
    triggerTranslationWarmup(targetLanguage);
    setError(null);
    setNeedsMicrophonePermission(false);
    if (listening) {
      suppressSpeechErrorRef.current = true;
      recognitionRef.current?.stop();
      setListening(null);
    }
    setSpeaker(source);
    void highAccuracySpeech.startRecording({
      languageHint:
        source === "target"
          ? LANGUAGE_CONFIGS[targetLanguage].speechRecognitionCode
          : LANGUAGE_CONFIGS.ja.speechRecognitionCode,
      sourcePage: "conversation",
      onTranscript: handleDraftChange,
    });
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);
    if (!inputStartRecordedRef.current && value.trim()) {
      inputStartRecordedRef.current = true;
      const direction: PhraseDirection =
        speaker === "ja" ? buildDirection("ja", targetLanguage) : buildDirection(targetLanguage, "ja");
      recordProductAnalyticsEvent({
        eventName: "input_start",
        sourcePage: "conversation",
        direction,
        targetLanguage: speaker === "ja" ? targetLanguage : "ja",
        generationMode,
        inputChars: value.trim().length,
      });
    }
  };

  const translate = async (text: string, source: Speaker) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (translatingRef.current) return;

    const direction: PhraseDirection =
      source === "ja" ? buildDirection("ja", targetLanguage) : buildDirection(targetLanguage, "ja");
    const outputLanguage = source === "ja" ? targetLanguage : "ja";
    const phraseId = createId();
    recordProductAnalyticsEvent({
      eventName: "translation_submit",
      sourcePage: "conversation",
      direction,
      targetLanguage: outputLanguage,
      generationMode,
      inputChars: trimmed.length,
    });
    translatingRef.current = true;
    setLoading(true);
    setError(null);
    setNeedsMicrophonePermission(false);

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
      recordProductAnalyticsEvent({
        eventName: "translation_success",
        sourcePage: "conversation",
        direction,
        targetLanguage: outputLanguage,
        generationMode,
        inputChars: trimmed.length,
        success: true,
      });

      const message: Message = {
        id: phraseId,
        speaker: source,
        direction,
        japanese: data.japanese,
        chinese: data.chinese,
        pinyin: data.pinyin ?? "",
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
        sourceText: data.sourceText,
        targetText: data.targetText,
        reading: data.reading ?? data.pinyin ?? "",
        readingType: data.readingType,
        explanation: data.explanation ?? "",
        provider: data.provider,
        inDrill: false,
      };
      const history = recordTranslationHistory({
        historyItemId: createId(),
        translation: toStudyPhraseFields(message),
        source: "conversation",
        translatedAt: new Date().toISOString(),
        storage: { addHistoryItem: addLocalTranslationHistoryItem },
      });

      setMessages((current) => [
        ...current,
        {
          ...message,
          historyItemId: history.id,
        },
      ]);
      setDraft("");
      inputStartRecordedRef.current = false;
    } catch (err) {
      recordProductAnalyticsEvent({
        eventName: "translation_failure",
        sourcePage: "conversation",
        direction,
        targetLanguage: outputLanguage,
        generationMode,
        inputChars: trimmed.length,
        success: false,
        errorCode: "translation_failed",
      });
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
          reading: stored?.reading ?? message.reading,
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
    const studyPhrase = toStudyPhraseFields(message);
    let pinyin = studyPhrase.pinyin;
    let reading = studyPhrase.reading;
    let explanation = studyPhrase.explanation;
    const needsReading = studyPhrase.readingType === "pinyin" && !pinyin.trim();
    const needsEnrich = needsReading || !explanation.trim();

    if (needsEnrich) {
      const res = await fetch("/api/phrase/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          phraseId: studyPhrase.id,
          direction: studyPhrase.direction,
          japanese: studyPhrase.japanese,
          chinese: studyPhrase.chinese,
          pinyin: studyPhrase.pinyin,
          sourceText: studyPhrase.sourceText,
          targetText: studyPhrase.targetText,
          reading: studyPhrase.reading,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "解説生成に失敗しました");
      }
      if (data.pinyin) {
        pinyin = data.pinyin;
        reading = data.pinyin;
      }
      explanation = data.explanation ?? explanation;
    }

    const existing = loadLocalPhrases().some((phrase) => phrase.id === message.id);
    if (existing) {
      updateLocalPhrase(message.id, {
        direction: studyPhrase.direction,
        japanese: studyPhrase.japanese,
        chinese: studyPhrase.chinese,
        sourceLanguage: studyPhrase.sourceLanguage,
        targetLanguage: studyPhrase.targetLanguage,
        sourceText: studyPhrase.sourceText,
        targetText: studyPhrase.targetText,
        readingType: studyPhrase.readingType,
        shouldDrill: true,
        pinyin,
        reading,
        explanation,
      });
      const phrase = loadLocalPhrases().find((item) => item.id === message.id)!;
      if (message.historyItemId) {
        linkTranslationHistoryToSavedPhrase({
          historyItemId: message.historyItemId,
          savedPhrase: phrase,
          storage: {
            loadHistoryItems: loadLocalTranslationHistory,
            updateHistoryItem: updateLocalTranslationHistoryItem,
          },
        });
      }
      return phrase;
    }

    const savedAt = new Date().toISOString();
    const saved = saveTranslationAsSavedPhrase({
      translation: {
        ...studyPhrase,
        pinyin,
        reading,
        explanation,
      },
      categoryId: null,
      source: "conversation",
      savedAt,
      storage: { addPhrase: addLocalPhrase },
      shouldDrill: true,
      usedAt: savedAt,
    });
    if (message.historyItemId) {
      linkTranslationHistoryToSavedPhrase({
        historyItemId: message.historyItemId,
        savedPhrase: saved.savedPhrase,
        storage: {
          loadHistoryItems: loadLocalTranslationHistory,
          updateHistoryItem: updateLocalTranslationHistoryItem,
        },
      });
    }
    return saved.storedPhrase;
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
                  reading: phrase.reading,
                  explanation: phrase.explanation,
                }
              : item,
          ),
        );
      }
      syncDrillSchedule({
        phrases: loadLocalPhrases(),
        items: loadLocalSrsItems(),
        storage: { saveSrsItems: saveLocalSrsItems },
      });
      await persistPhrasesToCloud(savedPhrases, authHeaders);
      recordProductAnalyticsEvent({
        eventName: "conversation_drill_save",
        sourcePage: "conversation",
        targetLanguage,
        generationMode,
        success: true,
      });
      setSelectedIds(new Set());
      setSelectingForDrill(false);
    } catch (err) {
      recordProductAnalyticsEvent({
        eventName: "conversation_drill_save",
        sourcePage: "conversation",
        targetLanguage,
        generationMode,
        success: false,
        errorCode: "save_failed",
      });
      setDrillAddError(
        err instanceof Error ? err.message : "ドリルへの追加に失敗しました",
      );
    } finally {
      setAddingToDrill(false);
    }
  };

  const handleVoiceInput = (source: Speaker) => {
    triggerTranslationWarmup(targetLanguage);
    setError(null);
    setNeedsMicrophonePermission(false);
    const direction: PhraseDirection =
      source === "ja" ? buildDirection("ja", targetLanguage) : buildDirection(targetLanguage, "ja");
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
    recognition.lang =
      source === "target"
        ? LANGUAGE_CONFIGS[targetLanguage].speechRecognitionCode
        : LANGUAGE_CONFIGS.ja.speechRecognitionCode;
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
      handleDraftChange((finalTranscript || interim).trim());
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
      setNeedsMicrophonePermission(isMicrophoneAccessError(event.error));
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
        speechTimeoutRef.current = null;
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

  const showMicrophonePermissionHint =
    needsMicrophonePermission || highAccuracySpeech.errorKind === "microphone";

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
              日本語/{getLanguageLabel(targetLanguage)}を切り替えて話すと、
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
            {showMicrophonePermissionHint ? (
              <div className="mt-3 rounded-2xl bg-red-100 px-3 py-2 text-xs font-bold leading-relaxed text-neutral-950">
                マイク許可を確認してください。端末設定とブラウザのサイト設定でマイクを許可してから、もう一度「音声」を押してください。
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleHighAccuracyVoiceInput(speaker)}
                disabled={loading || highAccuracySpeech.transcribing}
                className="mt-3 rounded-full bg-red-100 px-3 py-1.5 text-xs font-bold text-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {highAccuracySpeech.recording ? "録音を停止" : "高精度音声入力で試す"}
              </button>
            )}
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
              onClick={() => setSpeaker((value) => (value === "ja" ? "target" : "ja"))}
              aria-label="入力言語を切り替え"
              className="rounded-full px-3 py-0.5 text-2xl leading-none text-emerald-400 hover:bg-neutral-900"
            >
              ⇄
            </button>
            <TargetLanguageSelect
              value={targetLanguage}
              onChange={handleTargetLanguageChange}
              active={speaker === "target"}
            />
          </div>
          <div className="px-5 pt-5">
            <div className="mb-3 flex items-center justify-between text-base font-bold text-neutral-300">
              <span>{speaker === "ja" ? "日本語" : getLanguageLabel(targetLanguage)}</span>
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  inputStartRecordedRef.current = false;
                }}
                className="text-sm text-neutral-500 hover:text-neutral-200"
              >
                消去
              </button>
            </div>
            <textarea
              value={draft}
              onChange={(event) => handleDraftChange(event.target.value)}
              onFocus={() => {
                setInputFocused(true);
                triggerTranslationWarmup(targetLanguage);
              }}
              onBlur={() => setInputFocused(false)}
              placeholder={speaker === "target" ? `${getLanguageLabel(targetLanguage)}を入力` : "日本語を入力"}
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
          <div className="flex flex-col gap-2 rounded-2xl bg-neutral-950/50 px-3 py-2">
            <div className="flex items-center justify-end">
              <GenerationModeToggle
                value={generationMode}
                onChange={setGenerationMode}
                readingLabel={targetLanguage === "zh" ? "ピンイン" : ""}
              />
            </div>
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
      playSpeechForLang(
        message.targetText,
        LANGUAGE_CONFIGS[message.targetLanguage].speechSynthesisCode,
        options,
      );
    },
    [message.targetLanguage, message.targetText],
  );

  const prefetchSpeech = useCallback(() => {
    prefetchSpeechForLang(
      message.targetText,
      LANGUAGE_CONFIGS[message.targetLanguage].speechSynthesisCode,
    );
  }, [message.targetLanguage, message.targetText]);

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

  const primaryText = message.sourceText;
  const translatedText = message.targetText;
  const textClass = "text-2xl font-bold leading-snug";
  const playLabel = isJapaneseSpeaker
    ? `${getLanguageLabel(message.targetLanguage)}訳「${message.targetText}」を再生`
    : `日本語訳「${message.targetText}」を再生`;

  return (
    <div className={`flex ${isJapaneseSpeaker ? "justify-start" : "justify-end"}`}>
      <button
        type="button"
        onClick={handleCardClick}
        onFocus={prefetchSpeech}
        onPointerEnter={prefetchSpeech}
        onTouchStart={prefetchSpeech}
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


