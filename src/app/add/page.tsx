"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveGeneratedTranslation } from "@/application/phrase/save-generated-translation";
import AddTutorial from "@/components/AddTutorial";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getAuthHeaders } from "@/lib/auth-headers";
import { formatExplanationForReading } from "@/lib/explanation-format";
import { createId } from "@/lib/id";
import {
  addLocalPhrase,
  loadLocalPhrases,
  loadNickname,
  loadOwnerKey,
  updateLocalPhrase,
} from "@/infrastructure/local/phrase-storage";
import {
  loadLocalSrsItems,
  saveLocalSrsItems,
} from "@/infrastructure/local/srs-storage";
import {
  addLocalTranslationHistoryItem,
  loadLocalTranslationHistory,
  updateLocalTranslationHistoryItem,
} from "@/infrastructure/local/translation-history-storage";
import SpeechPlayButton from "@/components/SpeechPlayButton";
import TargetLanguageSelect from "@/components/TargetLanguageSelect";
import { playSpeechForLang, prefetchSpeechForLang, primeSpeech } from "@/lib/speech";
import {
  buildDirection,
  getLanguageLabel,
  LANGUAGE_CONFIGS,
  parseDirection,
} from "@/lib/languages";
import {
  getSpeechRecognitionErrorMessage,
  getSpeechRecognitionSupportError,
  isMicrophoneAccessError,
  rememberHighAccuracySpeechPreference,
  shouldSwitchToHighAccuracySpeech,
  shouldUseHighAccuracySpeechFirst,
} from "@/lib/speech-recognition";
import { useHighAccuracySpeech } from "@/lib/use-high-accuracy-speech";
import { useLearningLanguage } from "@/lib/use-learning-language";
import { currentDataOwner } from "@/infrastructure/local/account-cache-storage";
import { syncSavedPhrases } from "@/lib/account-phrase-sync";
import { completeSavedExplanation } from "@/lib/saved-phrase-explanation";
import { getDraftExplanation, trackDraftExplanation, TRANSLATION_DRAFT_CHANGED_EVENT, loadTranslationDraft, saveTranslationDraft, updateDraftResult, useDataOwner } from "@/lib/translation-draft";
import { recordWebSpeechUsageEvent } from "@/lib/usage-events";
import { recordProductAnalyticsEvent } from "@/lib/product-analytics";
import { toStudyPhraseFields } from "@/lib/study-phrase";
import {
  TRANSLATION_WARMUP_DELAY_MS,
  triggerTranslationWarmup,
} from "@/lib/translation-warmup";
import type { LanguageCode, PhraseDirection } from "@/lib/types";

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
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  sourceText: string;
  targetText: string;
  reading: string;
  readingType: "pinyin" | "none";
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
  const owner = useDataOwner();
  return <TranslationPage key={owner} owner={owner} />;
}

function TranslationPage({ owner }: { owner: string }) {
  const [restored] = useState(() => loadTranslationDraft(owner));
  const { targetLanguage, setTargetLanguage, languageReady } = useLearningLanguage();
  const [reverseTranslation, setReverseTranslation] = useState(restored?.reverseTranslation ?? false);
  const direction = useMemo(
    () => reverseTranslation
      ? buildDirection(targetLanguage, "ja")
      : buildDirection("ja", targetLanguage),
    [targetLanguage, reverseTranslation],
  );
  const [inputText, setInputText] = useState(restored?.inputText ?? "");
  const [categoryId] = useState<string>("other");
  const [generationMode, setGenerationMode] = useState<GenerationMode>(restored?.generationMode ?? "normal");
  const [loading, setLoading] = useState(false);
  const [nuanceText, setNuanceText] = useState(restored?.nuanceText ?? "");
  const [nuanceDialogOpen, setNuanceDialogOpen] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refinementError, setRefinementError] = useState<string | null>(null);
  const [addingToDrill, setAddingToDrill] = useState(false);
  const [drillAdded, setDrillAdded] = useState(() => Boolean(restored?.result?.id && loadLocalPhrases().some((phrase) => phrase.id === restored.result?.id && phrase.shouldDrill)));
  const [drillAddError, setDrillAddError] = useState<string | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(restored?.result ?? null);
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [needsMicrophonePermission, setNeedsMicrophonePermission] = useState(false);
  const [ownerKey] = useState(() => loadOwnerKey());
  const [nickname] = useState(() => loadNickname());
  const [inputFocused, setInputFocused] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const suppressSpeechErrorRef = useRef(false);
  const speechTimeoutRef = useRef<number | null>(null);
  const activePhraseIdRef = useRef<string | null>(restored?.requestId ?? null);
  const savingRef = useRef(false);
  const nuanceDialogRef = useRef<HTMLDialogElement | null>(null);
  const explanationPromiseRef = useRef<Promise<Result> | null>(getDraftExplanation(restored?.result?.id ?? null));
  const inputStartRecordedRef = useRef(false);
  const highAccuracySpeech = useHighAccuracySpeech();

  useEffect(() => {
    const dialog = nuanceDialogRef.current;
    if (!nuanceDialogOpen || !dialog) return;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    dialog.querySelector("textarea")?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [nuanceDialogOpen]);

  useEffect(() => {
    saveTranslationDraft(owner, {
      inputText, reverseTranslation, generationMode, result, nuanceText, drillAdded,
      requestId: activePhraseIdRef.current,
    });
  }, [owner, inputText, reverseTranslation, generationMode, result, nuanceText, drillAdded]);

  useEffect(() => {
    const refresh = () => {
      const draft = loadTranslationDraft(owner);
      if (draft?.result?.id === activePhraseIdRef.current) {
        setResult(draft.result);
        setExplanationLoading(false);
      }
    };
    const refreshSaved = () => {
      const id = activePhraseIdRef.current;
      if (id) setDrillAdded(loadLocalPhrases().some((phrase) => phrase.id === id && phrase.shouldDrill));
    };
    window.addEventListener(TRANSLATION_DRAFT_CHANGED_EVENT, refresh);
    window.addEventListener("phrabit-account-phrase-data-synced", refreshSaved);
    return () => {
      window.removeEventListener(TRANSLATION_DRAFT_CHANGED_EVENT, refresh);
      window.removeEventListener("phrabit-account-phrase-data-synced", refreshSaved);
    };
  }, [owner]);

  useEffect(() => {
    return () => {
      if (speechTimeoutRef.current) {
        window.clearTimeout(speechTimeoutRef.current);
      }
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!languageReady) return;
    const timer = window.setTimeout(
      () => triggerTranslationWarmup(targetLanguage),
      TRANSLATION_WARMUP_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [targetLanguage, languageReady]);

  const handleGenerate = async () => {
    const trimmed = inputText.trim();
    if (!languageReady || !trimmed || loading || refining || addingToDrill) return;
    recordProductAnalyticsEvent({
      eventName: "translation_submit",
      sourcePage: "add",
      direction,
      targetLanguage,
      generationMode,
      inputChars: trimmed.length,
    });
    setLoading(true);
    setError(null);
    setNuanceText("");
    setNuanceDialogOpen(false);
    setRefinementError(null);
    setDrillAddError(null);
    setDrillAdded(false);
    setExplanationError(null);
    setExplanationLoading(false);
    explanationPromiseRef.current = null;
    setResult(null);
    try {
      primeSpeech();
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
          shouldDrill: false,
          generationMode,
          persist: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "生成に失敗しました");
      }
      recordProductAnalyticsEvent({
        eventName: "translation_success",
        sourcePage: "add",
        direction,
        targetLanguage,
        generationMode,
        inputChars: trimmed.length,
        success: true,
      });
      const nextResult = { ...(data as Result), id: phraseId };
      setResult(nextResult);
      setLoading(false);
      if (!nextResult.explanation?.trim()) {
        setExplanationError(null);
        const explanationPromise = generateExplanation(nextResult, authHeaders);
        explanationPromiseRef.current = explanationPromise;
        trackDraftExplanation(phraseId, explanationPromise);
        void explanationPromise.finally(() => {
          if (explanationPromiseRef.current === explanationPromise) {
            explanationPromiseRef.current = null;
          }
        });
      } else {
        setExplanationError(null);
      }
    } catch (err) {
      recordProductAnalyticsEvent({
        eventName: "translation_failure",
        sourcePage: "add",
        direction,
        targetLanguage,
        generationMode,
        inputChars: trimmed.length,
        success: false,
        errorCode: "translation_failed",
      });
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const generateExplanation = async (
    baseResult: Result,
    authHeaders: Record<string, string>,
  ): Promise<Result> => {
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
          sourceText: baseResult.sourceText,
          targetText: baseResult.targetText,
          reading: baseResult.reading,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "解説生成に失敗しました");
      }
      const enrichedResult: Result = {
        ...baseResult,
        explanation: data.explanation,
        ...(data.pinyin ? { pinyin: data.pinyin, reading: data.pinyin } : {}),
      };
      updateDraftResult(owner, enrichedResult);
      if (activePhraseIdRef.current !== baseResult.id) return enrichedResult;
      setResult((current) =>
        current?.id === baseResult.id ? enrichedResult : current,
      );
      return enrichedResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : "解説生成に失敗しました";
      console.warn("[AddPage] explanation generation failed", err);
      if (activePhraseIdRef.current === baseResult.id) {
        setExplanationError(message);
      }
      return baseResult;
    } finally {
      if (activePhraseIdRef.current === baseResult.id) {
        setExplanationLoading(false);
      }
    }
  };

  const handleRefine = async () => {
    const nuance = nuanceText.trim();
    if (!result || !nuance || loading || refining || addingToDrill || drillAdded) return;
    const previousPhraseId = result.id;
    const previousExplanationPromise = explanationPromiseRef.current;
    const phraseId = createId();
    activePhraseIdRef.current = phraseId;
    explanationPromiseRef.current = null;
    setRefining(true);
    setRefinementError(null);
    setDrillAddError(null);
    setExplanationLoading(false);
    setExplanationError(null);
    recordProductAnalyticsEvent({
      eventName: "translation_refine_submit",
      sourcePage: "add",
      direction: result.direction,
      targetLanguage: result.targetLanguage,
      generationMode: "quality",
      inputChars: nuance.length,
    });

    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/phrase/add", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          direction: result.direction,
          text: result.sourceText,
          nuance,
          previousTargetText: result.targetText,
          ownerKey,
          nickname,
          phraseId,
          categoryId,
          shouldDrill: false,
          generationMode: "quality",
          persist: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "ニュアンスの反映に失敗しました");
      }
      if (activePhraseIdRef.current !== phraseId) return;
      const refinedResult = { ...(data as Result), id: phraseId };
      setResult(refinedResult);
      setNuanceText("");
      setNuanceDialogOpen(false);
      recordProductAnalyticsEvent({
        eventName: "translation_refine_success",
        sourcePage: "add",
        direction: refinedResult.direction,
        targetLanguage: refinedResult.targetLanguage,
        generationMode: "quality",
        inputChars: nuance.length,
        success: true,
      });
    } catch (err) {
      if (activePhraseIdRef.current !== phraseId) return;
      activePhraseIdRef.current = previousPhraseId;
      explanationPromiseRef.current = previousExplanationPromise;
      setRefinementError(
        err instanceof Error ? err.message : "ニュアンスの反映に失敗しました",
      );
      recordProductAnalyticsEvent({
        eventName: "translation_refine_failure",
        sourcePage: "add",
        direction: result.direction,
        targetLanguage: result.targetLanguage,
        generationMode: "quality",
        inputChars: nuance.length,
        success: false,
        errorCode: "refinement_failed",
      });
    } finally {
      setRefining(false);
    }
  };

  const handleAddToDrill = async () => {
    if (!result || loading || refining || addingToDrill || drillAdded || savingRef.current) return;
    if (currentDataOwner() !== owner) return;
    savingRef.current = true;
    setAddingToDrill(true);
    setDrillAddError(null);
    let savedLocally = false;

    try {
      const approvedResult = result;
      if (!approvedResult.id || activePhraseIdRef.current !== approvedResult.id) return;
      const saved = saveGeneratedTranslation({
        translation: {
          ...toStudyPhraseFields({
            ...approvedResult,
            id: approvedResult.id,
          }),
          id: approvedResult.id,
        },
        historyItemId: createId(),
        historySource: "add",
        savedPhraseSource: "manual",
        categoryId,
        savedAt: new Date().toISOString(),
        addToDrill: true,
        storage: {
          addPhrase: addLocalPhrase,
          updatePhrase: updateLocalPhrase,
          addHistoryItem: addLocalTranslationHistoryItem,
          loadHistoryItems: loadLocalTranslationHistory,
          updateHistoryItem: updateLocalTranslationHistoryItem,
          loadSrsItems: loadLocalSrsItems,
          saveSrsItems: saveLocalSrsItems,
        },
      });
      savedLocally = true;
      setResult({ ...approvedResult, id: saved.storedPhrase.id });
      setDrillAdded(true);
      setAddingToDrill(false);
      if (!approvedResult.explanation.trim()) {
        const task = explanationPromiseRef.current;
        void completeSavedExplanation(saved.storedPhrase, task ?? undefined);
      }
      await syncSavedPhrases([saved.storedPhrase]);
      recordProductAnalyticsEvent({
        eventName: "translation_drill_save",
        sourcePage: "add",
        direction: approvedResult.direction,
        targetLanguage: approvedResult.targetLanguage,
        generationMode,
        success: true,
      });
    } catch (err) {
      setDrillAddError(
        savedLocally
          ? "この端末のドリルには追加しましたが、クラウド同期に失敗しました。"
          : err instanceof Error
            ? err.message
            : "ドリルへの追加に失敗しました",
      );
      recordProductAnalyticsEvent({
        eventName: "translation_drill_save",
        sourcePage: "add",
        direction: result.direction,
        targetLanguage: result.targetLanguage,
        generationMode,
        success: false,
        errorCode: "save_failed",
      });
    } finally {
      savingRef.current = false;
      setAddingToDrill(false);
    }
  };

  const handleNext = () => {
    setInputText("");
    inputStartRecordedRef.current = false;
    setResult(null);
    setError(null);
    setSpeechError(null);
    setNeedsMicrophonePermission(false);
    setExplanationLoading(false);
    setExplanationError(null);
    setNuanceText("");
    setNuanceDialogOpen(false);
    setRefinementError(null);
    setAddingToDrill(false);
    setDrillAdded(false);
    setDrillAddError(null);
    explanationPromiseRef.current = null;
    activePhraseIdRef.current = null;
  };

  const clearSpeechTimeout = () => {
    if (speechTimeoutRef.current) {
      window.clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
  };

  const handleHighAccuracyVoiceInput = () => {
    triggerTranslationWarmup(targetLanguage);
    setSpeechError(null);
    setNeedsMicrophonePermission(false);
    if (listening) {
      suppressSpeechErrorRef.current = true;
      recognitionRef.current?.stop();
      setListening(false);
    }
    void highAccuracySpeech.startRecording({
      languageHint: LANGUAGE_CONFIGS[parseDirection(direction).sourceLanguage].speechRecognitionCode,
      sourcePage: "add",
      onTranscript: handleInputTextChange,
    });
  };

  const handleInputTextChange = (value: string) => {
    setInputText(value);
    if (!inputStartRecordedRef.current && value.trim()) {
      inputStartRecordedRef.current = true;
      recordProductAnalyticsEvent({
        eventName: "input_start",
        sourcePage: "add",
        direction,
        targetLanguage,
        generationMode,
        inputChars: value.trim().length,
      });
    }
  };

  const handleVoiceInput = () => {
    triggerTranslationWarmup(targetLanguage);
    setSpeechError(null);
    setNeedsMicrophonePermission(false);

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
    recognition.lang = LANGUAGE_CONFIGS[parseDirection(direction).sourceLanguage].speechRecognitionCode;
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
        handleInputTextChange(spoken);
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
      setNeedsMicrophonePermission(isMicrophoneAccessError(event.error));
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

  const showMicrophonePermissionHint =
    needsMicrophonePermission || highAccuracySpeech.errorKind === "microphone";

  return (
    <main
      className={`min-h-screen px-5 pt-8 transition-[padding] duration-200 ${
        inputFocused ? "pb-4" : "pb-28"
      }`}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <AppHeader hideSyncedStatus />

        <section
          data-tutorial="input-card"
          className="overflow-hidden rounded-[28px] bg-neutral-900/70"
        >
          <div
            data-tutorial="language-switch"
            className="grid grid-cols-[1fr_auto_1fr] items-center bg-neutral-950/70 px-4 py-3 text-base font-bold"
          >
            <button
              type="button"
              onClick={() => {
                setReverseTranslation(false);
              }}
              className={`rounded-xl px-3 py-2 transition ${
                parseDirection(direction).sourceLanguage === "ja"
                  ? "bg-emerald-500 text-neutral-950 shadow-sm shadow-emerald-500/30"
                  : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"
              }`}
            >
              日本語
            </button>
            <button
              type="button"
              onClick={() => setReverseTranslation((value) => !value)}
              aria-label="翻訳方向を切り替え"
              className="rounded-full px-3 py-1.5 text-3xl leading-none text-emerald-400 hover:bg-neutral-900"
            >
              ⇄
            </button>
            <TargetLanguageSelect
              value={targetLanguage}
              onChange={setTargetLanguage}
              disabled={!languageReady}
              active={parseDirection(direction).sourceLanguage === targetLanguage}
            />
          </div>

          <div className="px-5 pt-5">
            <div className="mb-3 flex items-center justify-between text-base font-bold text-neutral-300">
              <span>{getLanguageLabel(parseDirection(direction).sourceLanguage)}</span>
              <button
                type="button"
                onClick={() => {
                  setInputText("");
                  inputStartRecordedRef.current = false;
                }}
                className="text-sm text-neutral-500 hover:text-neutral-200"
              >
                消去
              </button>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => handleInputTextChange(e.target.value)}
              onFocus={() => {
                setInputFocused(true);
                triggerTranslationWarmup(targetLanguage);
              }}
              onBlur={() => setInputFocused(false)}
              placeholder={
                parseDirection(direction).sourceLanguage === "ja"
                  ? "日本語を入力"
                  : `${getLanguageLabel(targetLanguage)}を入力`
              }
              rows={3}
              className="w-full resize-none bg-transparent text-2xl leading-relaxed text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
            />
          </div>
          <div className="mt-3 grid grid-cols-3 bg-neutral-950/30 text-emerald-300">
            <Link
              href="/conversation"
              data-tutorial="conversation"
              aria-label="会話モードを開く"
              className="flex min-h-20 flex-col items-center justify-center gap-1 text-emerald-300 transition hover:bg-neutral-950/50 active:bg-neutral-950/70"
            >
              <ConversationIcon />
              <span className="text-xs font-bold">会話</span>
            </Link>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || refining || addingToDrill || !inputText.trim()}
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
              disabled={loading || refining || addingToDrill || highAccuracySpeech.transcribing}
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
              {showMicrophonePermissionHint ? (
                <div className="mt-3 rounded-2xl bg-yellow-100 px-3 py-2 text-xs font-bold leading-relaxed text-neutral-950">
                  マイク許可を確認してください。端末設定とブラウザのサイト設定でマイクを許可してから、もう一度「音声」を押してください。
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleHighAccuracyVoiceInput}
                  disabled={loading || highAccuracySpeech.transcribing}
                  className="mt-3 rounded-full bg-yellow-100 px-3 py-1.5 text-xs font-bold text-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {highAccuracySpeech.recording ? "録音を停止" : "高精度音声入力で試す"}
                </button>
              )}
            </div>
          )}
          {(highAccuracySpeech.recording || highAccuracySpeech.transcribing) && (
            <div className="mx-5 mb-3 text-right text-xs font-medium text-neutral-500">
              高精度音声入力起動中
            </div>
          )}
        </section>

        <div className="-mt-1 mb-0">
          <div className="flex flex-col gap-2 rounded-2xl bg-neutral-950/50 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-400">翻訳モード</span>
              <span data-tutorial="mode-controls" className="shrink-0">
                <GenerationModeToggle
                  value={generationMode}
                  onChange={setGenerationMode}
                  readingLabel={targetLanguage === "zh" ? "ピンイン" : ""}
                />
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-900/20 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {result && (
          <div className="-mt-2 flex flex-col gap-3 rounded-[28px] bg-neutral-900/70 p-4">
            <div className="flex items-center justify-end gap-2">
              <div className="flex shrink-0 items-center gap-2">
                {!drillAdded && (
                  <button
                    type="button"
                    onClick={() => setNuanceDialogOpen(true)}
                    disabled={loading || addingToDrill}
                    aria-haspopup="dialog"
                    aria-controls="translation-nuance-dialog"
                    className="min-h-11 rounded-full bg-neutral-950/80 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {refining ? "調整中..." : "調整"}
                  </button>
                )}
                {result.targetText && (
                  <SpeechPlayButton
                    play={(options) =>
                      playSpeechForLang(
                        result.targetText,
                        LANGUAGE_CONFIGS[result.targetLanguage].speechSynthesisCode,
                        options,
                      )
                    }
                    prefetch={() =>
                      prefetchSpeechForLang(
                        result.targetText,
                        LANGUAGE_CONFIGS[result.targetLanguage].speechSynthesisCode,
                      )
                    }
                    className="min-h-11 shrink-0 rounded-full bg-neutral-950/80 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
                    playingClassName="text-emerald-300"
                  />
                )}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-neutral-500">
                {getLanguageLabel(result.targetLanguage)}
              </div>
              <div className="mt-1 break-words [overflow-wrap:anywhere] text-3xl font-bold leading-snug text-white">
                {result.targetText}
              </div>
              {result.readingType === "pinyin" && (
                result.reading ? (
                  <div className="mt-1 text-base tracking-wide text-neutral-300">
                    {result.reading}
                  </div>
                ) : explanationLoading ? (
                  <div className="mt-1 text-base text-neutral-500">ピンインを生成中...</div>
                ) : null
              )}
              {result.targetLanguage === "ja" && result.sourceLanguage === "zh" && (
                <>
                  {result.chinese && (
                    <div className="mt-2 break-words [overflow-wrap:anywhere] text-xl leading-snug text-neutral-400">
                      {result.chinese}
                    </div>
                  )}
                  {result.reading ? (
                    <div className="mt-0.5 text-base tracking-wide text-neutral-300">
                      {result.reading}
                    </div>
                  ) : explanationLoading ? (
                    <div className="mt-0.5 text-base text-neutral-500">ピンインを生成中...</div>
                  ) : null}
                </>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleNext}
                disabled={addingToDrill || refining}
                className="flex-1 rounded-xl bg-neutral-950/80 px-4 py-3 text-sm font-medium text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-600"
              >
                別のフレーズ
              </button>
              {drillAdded ? (
                <Link
                  href={"/drill?phrases=" + result.id}
                  onClick={() => setTargetLanguage(result.targetLanguage === "ja" ? result.sourceLanguage : result.targetLanguage)}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white hover:bg-emerald-500"
                >
                  追加した一言を練習
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={handleAddToDrill}
                  disabled={addingToDrill || refining}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                >
                  {addingToDrill ? "追加中..." : "ドリルに追加"}
                </button>
              )}
            </div>
            {drillAdded && <p role="status" className="text-xs text-emerald-300">端末のドリルに追加済みです。解説の生成中でも練習できます。</p>}
            {refinementError && !nuanceDialogOpen && !drillAdded && (
              <p role="alert" className="text-sm text-red-200">調整に失敗しました。「調整」から再試行できます。</p>
            )}
            {drillAddError && (
              <div className="rounded-xl bg-yellow-900/20 px-3 py-2 text-sm text-yellow-100">
                {drillAddError}
              </div>
            )}
            {(explanationLoading || result.explanation || explanationError) && (
              <details key={result.id} open className="rounded-2xl bg-neutral-950/40 p-3">
                <summary className="cursor-pointer text-sm font-bold text-neutral-300">使い方・想定返答</summary>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
                  {explanationError ?? (result.explanation ? formatExplanationForReading(result.explanation) : "解説を生成中...")}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
      <dialog
        ref={nuanceDialogRef}
        id="translation-nuance-dialog"
        aria-labelledby="translation-nuance-title"
        aria-describedby="translation-nuance-help"
        onCancel={(event) => {
          event.preventDefault();
          setNuanceDialogOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), textarea:not(:disabled)");
          const firstControl = controls[0];
          const lastControl = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === firstControl) {
            event.preventDefault();
            lastControl?.focus();
          } else if (!event.shiftKey && document.activeElement === lastControl) {
            event.preventDefault();
            firstControl?.focus();
          }
        }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto overscroll-contain rounded-3xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-100 shadow-2xl backdrop:bg-black/70"
      >
        <form onSubmit={(event) => { event.preventDefault(); void handleRefine(); }}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="translation-nuance-title" className="text-base font-bold">ニュアンスを調整</h2>
            <button
              type="button"
              onClick={() => setNuanceDialogOpen(false)}
              className="min-h-11 shrink-0 rounded-full px-3 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            >
              閉じる
            </button>
          </div>
          <p id="translation-nuance-help" className="mt-2 text-sm leading-relaxed text-neutral-400">
            違うと感じた点を補足すると、その意図を含めて作り直します。
          </p>
          <textarea
            id="translation-nuance"
            aria-labelledby="translation-nuance-title"
            aria-describedby="translation-nuance-help"
            value={nuanceText}
            onChange={(event) => setNuanceText(event.target.value)}
            placeholder="例：もう少し丁寧に、相手を急かさない感じ"
            maxLength={300}
            rows={3}
            disabled={refining || addingToDrill || drillAdded}
            className="mt-4 w-full resize-none rounded-xl bg-neutral-950 px-3 py-3 text-base text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!result || !nuanceText.trim() || loading || refining || addingToDrill || drillAdded}
            className="mt-3 min-h-11 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            {refining ? "ニュアンスを反映中..." : "このニュアンスで作り直す"}
          </button>
          {refinementError && <p role="alert" className="mt-3 text-sm text-red-200">{refinementError}</p>}
        </form>
      </dialog>
      <BottomNav />
      <AddTutorial />
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




