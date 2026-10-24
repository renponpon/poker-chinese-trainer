"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  selectDueDrillPhrases,
  syncDrillSchedule,
} from "@/application/practice/drill-schedule";
import { recordLearningPractice } from "@/infrastructure/local/record-learning-practice";
import LearningDaysSummary from "@/components/LearningDaysSummary";
import Flashcard from "@/components/Flashcard";
import { ACTIVE_TARGET_LANGUAGE_CODES, getLanguageLabel } from "@/lib/languages";
import {
  loadLocalSrsItems,
  saveLocalSrsItems,
} from "@/infrastructure/local/srs-storage";
import {
  loadLocalPhrases,
} from "@/infrastructure/local/phrase-storage";
import {
  getPendingExplanationIds,
  isExplanationPending,
  PENDING_EXPLANATIONS_CHANGED_EVENT,
  PHRASE_UPDATED_EVENT,
  refreshPhrasesFromStorage,
  resumePendingPackJobs,
} from "@/lib/pending-pack-explanations";
import { primeSpeech } from "@/lib/speech";
import { recordProductAnalyticsEvent } from "@/lib/product-analytics";
import { ACCOUNT_PHRASE_DATA_SYNCED_EVENT, syncPhraseStateToCloud, syncSavedPhrases } from "@/lib/account-phrase-sync";
import { getPracticeSamples } from "@/lib/starter-phrases";
import { loadLearningLanguage } from "@/infrastructure/local/learning-language-storage";
import { useLearningLanguage } from "@/lib/use-learning-language";
import { useDataOwner } from "@/lib/translation-draft";
import { currentDataOwner } from "@/infrastructure/local/account-cache-storage";
import type { LanguageCode, Phrase, Score, SrsItem } from "@/lib/types";
import PersonalPhrasePackFlow from "./PersonalPhrasePackFlow";

export default function DrillRunner() {
  return <Suspense fallback={<div className="p-10 text-center text-sm text-neutral-500">読み込み中...</div>}><OwnedPracticeSession /></Suspense>;
}

function OwnedPracticeSession() {
  const owner = useDataOwner();
  const params = useSearchParams();
  const phraseIds = params.get("phrases") ?? "";
  const focusedIds = useMemo(() => phraseIds.split(",").filter(Boolean).slice(0, 100), [phraseIds]);
  const oneAnswerMode = params.get("practice") === "once";
  return <PracticeSession key={`${owner}:${phraseIds}:${oneAnswerMode}`} owner={owner} focusedIds={focusedIds} oneAnswerMode={oneAnswerMode} />;
}

function PracticeSession({ owner, focusedIds, oneAnswerMode }: { owner: string; focusedIds: string[]; oneAnswerMode: boolean }) {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [items, setItems] = useState<SrsItem[]>([]);
  const { targetLanguage, setTargetLanguage, languageReady } = useLearningLanguage();
  const [hydrated, setHydrated] = useState(false);
  const [queue, setQueue] = useState<Phrase[]>([]);
  const [completed, setCompleted] = useState(0);
  const [cardResetKey, setCardResetKey] = useState(0);
  const [pendingExplanationIds, setPendingExplanationIds] = useState<Set<string>>(new Set());
  const skipNextQueueResetRef = useRef(false);
  const [sampleMode, setSampleMode] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recordedLearning, setRecordedLearning] = useState(false);
  const [initializationError, setInitializationError] = useState(false);
  const lastScoredCardRef = useRef<number | null>(null);
  const activeSessionRef = useRef(false);
  const completionTitleRef = useRef<HTMLHeadingElement>(null);
  const sessionIdentityRef = useRef("");
  const completedPhraseIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (oneAnswerMode && completed === 1) completionTitleRef.current?.focus();
  }, [completed, oneAnswerMode]);

  useEffect(() => {
    activeSessionRef.current = true;
    primeSpeech();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const localPhrases = loadLocalPhrases();
        setPhrases(localPhrases);
        const { items: stored } = syncDrillSchedule({
          phrases: localPhrases,
          items: loadLocalSrsItems(),
          storage: { saveSrsItems: saveLocalSrsItems },
        });
        setItems(stored);
        setPendingExplanationIds(new Set(getPendingExplanationIds()));
        resumePendingPackJobs();
        recordProductAnalyticsEvent({
          eventName: "drill_open",
          sourcePage: "drill",
          targetLanguage: loadLearningLanguage(),
        });
        setHydrated(true);
      } catch {
        setInitializationError(true);
      }
    });
    return () => {
      cancelled = true;
      activeSessionRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !languageReady) return;
    const identity = targetLanguage + ":" + focusedIds.join(",") + ":" + sampleMode;
    const newSession = sessionIdentityRef.current !== identity;
    if (newSession) {
      sessionIdentityRef.current = identity;
      completedPhraseIdsRef.current.clear();
      lastScoredCardRef.current = null;
      setSaveError(null);
      setRecordedLearning(false);
    }
    if (sampleMode && !newSession) return;
    if (skipNextQueueResetRef.current && !newSession) {
      skipNextQueueResetRef.current = false;
      return;
    }
    const due = selectDueDrillPhrases({
      phrases: filterPhrasesByTarget(phrases, targetLanguage),
      items,
    });
    const focused = phrases.filter((phrase) => focusedIds.includes(phrase.id) && !completedPhraseIdsRef.current.has(phrase.id) && phrase.shouldDrill && phrase.targetLanguage === targetLanguage);
    const shuffled = oneAnswerMode ? focusedIds.length === 1 ? focused : []
      : sampleMode ? getPracticeSamples(targetLanguage)
      : focusedIds.length ? focused : due.filter((phrase) => !completedPhraseIdsRef.current.has(phrase.id)).sort(() => Math.random() - 0.5);
    if (newSession) {
      setQueue(shuffled);
      setCompleted(0);
    } else {
      const currentPhrases = new Map(phrases.filter((phrase) => phrase.shouldDrill && phrase.targetLanguage === targetLanguage).map((phrase) => [phrase.id, phrase]));
      setQueue((previous) => {
        const remaining = previous.flatMap((phrase) => {
          const current = currentPhrases.get(phrase.id);
          return current && !completedPhraseIdsRef.current.has(phrase.id) ? [current] : [];
        });
        const remainingIds = new Set(remaining.map((phrase) => phrase.id));
        return [...remaining, ...shuffled.filter((phrase) => !remainingIds.has(phrase.id))];
      });
    }
  }, [hydrated, items, phrases, targetLanguage, languageReady, focusedIds, sampleMode, oneAnswerMode]);

  useEffect(() => {
    const syncPhrases = () => {
      const localPhrases = refreshPhrasesFromStorage();
      setPhrases(localPhrases);
      setQueue((prev) =>
        prev.map((phrase) => localPhrases.find((item) => item.id === phrase.id) ?? phrase),
      );
    };
    const syncPending = () => {
      setPendingExplanationIds(new Set(getPendingExplanationIds()));
    };
    const syncAccountData = () => {
      try {
        const localPhrases = loadLocalPhrases();
        const { items: stored } = syncDrillSchedule({
          phrases: localPhrases,
          items: loadLocalSrsItems(),
          storage: { saveSrsItems: saveLocalSrsItems },
        });
        setPhrases(localPhrases);
        setItems(stored);
      } catch {
        setInitializationError(true);
      }
    };

    window.addEventListener(PHRASE_UPDATED_EVENT, syncPhrases);
    window.addEventListener(PENDING_EXPLANATIONS_CHANGED_EVENT, syncPending);
    window.addEventListener(ACCOUNT_PHRASE_DATA_SYNCED_EVENT, syncAccountData);
    return () => {
      window.removeEventListener(PHRASE_UPDATED_EVENT, syncPhrases);
      window.removeEventListener(PENDING_EXPLANATIONS_CHANGED_EVENT, syncPending);
      window.removeEventListener(ACCOUNT_PHRASE_DATA_SYNCED_EVENT, syncAccountData);
    };
  }, []);

  const total = completed + queue.length;
  const current = queue[0] ?? null;
  const drillPhraseCount = useMemo(
    () =>
      phrases.filter(
        (phrase) => phrase.shouldDrill && phrase.targetLanguage === targetLanguage,
      ).length,
    [phrases, targetLanguage],
  );
  const showLanguageTabs = ACTIVE_TARGET_LANGUAGE_CODES.length > 1;

  const handleScore = (score: Score) => {
    if (!activeSessionRef.current || !current || currentDataOwner() !== owner || lastScoredCardRef.current === cardResetKey) return;
    lastScoredCardRef.current = cardResetKey;
    setSaveError(null);
    if (sampleMode) {
      setQueue((previous) => score === 1 ? [...previous.slice(1), current] : previous.slice(1));
      if (score !== 1) setCompleted((value) => value + 1);
      setCardResetKey((value) => value + 1);
      return;
    }
    let result;
    try {
      const storedItems = loadLocalSrsItems();
      const storedPhrase = loadLocalPhrases().find((phrase) => phrase.id === current.id && phrase.shouldDrill);
      if (!storedPhrase || !storedItems.some((item) => item.id === current.id)) throw new Error("practice_item_missing");
      result = recordLearningPractice({
        items: storedItems,
        phraseId: current.id,
        score,
        owner,
        eligible: storedPhrase.source !== "prototype",
      });
      if (!result.updatedItem) throw new Error("practice_item_missing");
      if (storedPhrase.source !== "prototype") setRecordedLearning(true);
    } catch {
      setSaveError("練習を保存できませんでした。もう一度お試しください。");
      setCardResetKey((value) => value + 1);
      recordProductAnalyticsEvent({
        eventName: "drill_answer", sourcePage: "drill",
        direction: current.direction, targetLanguage: current.targetLanguage,
        score, success: false, errorCode: "save_failed",
      });
      return;
    }
    recordProductAnalyticsEvent({
      eventName: "drill_answer",
      sourcePage: "drill",
      direction: current.direction,
      targetLanguage: current.targetLanguage,
      score,
      success: true,
    });
    if (result.updatedItem) {
      skipNextQueueResetRef.current = true;
    }
    setItems(result.items);

    if (result.updatedItem) {
      void syncPhraseStateToCloud(current, result.updatedItem).catch((error) => {
        console.warn("[DrillRunner] SRS cloud sync failed", error);
      });
    }

    setQueue((prev) => {
      const rest = prev.slice(1);
      return score === 1 && !oneAnswerMode ? [...rest, current] : rest;
    });
    setCardResetKey((key) => key + 1);
    if (score !== 1 || oneAnswerMode) {
      completedPhraseIdsRef.current.add(current.id);
      setCompleted((value) => value + 1);
    }
  };

  const handlePackSaved = (newPhrases: Phrase[]) => {
    void syncSavedPhrases(newPhrases).catch((error) => console.warn("[DrillRunner] 端末に保存済み・同期失敗", error));
    const nextPhrases = [...newPhrases, ...phrases];
    setPhrases(nextPhrases);
    const { items: nextItems } = syncDrillSchedule({
      phrases: nextPhrases,
      items,
      storage: { saveSrsItems: saveLocalSrsItems },
    });
    setItems(nextItems);
    setQueue((prev) => [
      ...prev,
      ...newPhrases.filter((phrase) => phrase.targetLanguage === targetLanguage),
    ]);
    setPendingExplanationIds(new Set(getPendingExplanationIds()));
  };

  if (initializationError) {
    return <div role="alert" className="space-y-4 rounded-xl bg-neutral-900 p-6 text-sm text-amber-200">
      <p>端末の練習記録を確認できないため、ドリルを停止しました。データを削除せず、学習記録の再読み込みまたはバックアップ・復旧をご確認ください。</p>
      <Link href="/learning" className="block underline">学習記録を確認する</Link>
      <Link href="/data-safety" className="block underline">バックアップ・復旧</Link>
    </div>;
  }

  if (!hydrated || !languageReady) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-sm text-neutral-500">
        読み込み中...
      </div>
    );
  }

  if (oneAnswerMode && !current) {
    const practiced = completed === 1;
    const savedPhrase = phrases.find((phrase) => phrase.id === focusedIds[0] && phrase.shouldDrill && phrase.targetLanguage === targetLanguage);
    return (
      <section aria-labelledby="once-practice-title" className="flex flex-col items-center gap-4 overflow-y-auto rounded-3xl bg-neutral-900/70 p-6 pb-24 text-center sm:p-10">
        <h1 ref={completionTitleRef} tabIndex={-1} id="once-practice-title" className="text-lg font-semibold text-neutral-200 focus:outline-none">{practiced ? "1回練習しました" : "この一言を練習できません"}</h1>
        <p className="text-sm text-neutral-400">{practiced ? "出なかった一言も、また練習できます。" : "保存済みのフレーズと学習言語を確認してください。"}</p>
        {practiced && recordedLearning && <LearningDaysSummary completion />}
        {!practiced && showLanguageTabs && <LanguageTabs value={targetLanguage} onChange={setTargetLanguage} />}
        <div className="flex flex-wrap justify-center gap-2">
          {practiced && savedPhrase && <button type="button" className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-500" onClick={() => {
            completedPhraseIdsRef.current.clear();
            setCompleted(0);
            setQueue([savedPhrase]);
            setCardResetKey((value) => value + 1);
          }}>もう1回</button>}
          <Link href="/" className="rounded-xl bg-neutral-950/80 px-5 py-3 text-sm text-neutral-200 hover:bg-neutral-800">翻訳へ戻る</Link>
        </div>
      </section>
    );
  }

  if (phrases.length === 0 && !sampleMode) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-neutral-900/70 p-10 text-center">
        <div className="text-lg font-semibold text-neutral-200">
          まだフレーズがありません
        </div>
        <div className="text-sm text-neutral-500">
          翻訳すると、保存したフレーズをあとで練習できます。
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/" className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-neutral-950">自分の一言を追加</Link>
          <button type="button" onClick={() => setSampleMode(true)} className="rounded-xl bg-neutral-900 px-5 py-3 text-sm text-neutral-200">サンプルで試す</button>
          <PersonalPhrasePackFlow
            phrases={phrases}
            targetLanguage={targetLanguage}
            onSaved={handlePackSaved}
          />
          <Link
            href="/"
            className="rounded-xl bg-neutral-950/80 px-5 py-3 text-sm font-bold text-neutral-200 hover:bg-neutral-800"
          >
            翻訳する
          </Link>
        </div>
      </div>
    );
  }

  if (drillPhraseCount === 0 && !sampleMode) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-neutral-900/70 p-10 text-center">
        {showLanguageTabs && (
          <LanguageTabs
            value={targetLanguage}
            onChange={setTargetLanguage}
          />
        )}
        <div className="text-lg font-semibold text-neutral-200">
          {getLanguageLabel(targetLanguage)}のドリル対象がありません
        </div>
        <div className="text-sm text-neutral-500">
          ライブラリから覚えたいフレーズを「ドリルに追加」できます。
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <PersonalPhrasePackFlow
            phrases={phrases}
            targetLanguage={targetLanguage}
            onSaved={handlePackSaved}
          />
          <Link
            href="/library"
            className="rounded-xl bg-neutral-950/80 px-5 py-3 text-sm font-bold text-neutral-200 hover:bg-neutral-800"
          >
            ライブラリへ
          </Link>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-neutral-900/70 p-10 text-center">
        {showLanguageTabs && (
          <LanguageTabs
            value={targetLanguage}
            onChange={setTargetLanguage}
          />
        )}
        <div className="text-3xl">🎉</div>
        <div className="text-lg font-semibold text-neutral-200">
          {sampleMode ? "サンプルの練習完了" : focusedIds.length ? "追加した一言の練習完了" : "今日のドリル完了"}
        </div>
        <div className="text-sm text-neutral-400">
          {completed} 件をレビューしました。お疲れさま。
        </div>
        {!sampleMode && recordedLearning && <LearningDaysSummary completion />}
        <div className="mt-2 flex gap-2">
          {(sampleMode || focusedIds.length > 0) && <Link href="/drill" onClick={() => setSampleMode(false)} className="rounded-xl bg-neutral-900 px-4 py-3 text-sm text-neutral-200">通常のドリルへ</Link>}
          <PersonalPhrasePackFlow
            phrases={phrases}
            targetLanguage={targetLanguage}
            onSaved={handlePackSaved}
            buttonClassName="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-neutral-950 hover:bg-emerald-400"
          />
          <Link
            href="/"
            className="rounded-xl bg-neutral-950/80 px-5 py-3 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
          >
            翻訳へ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden overscroll-none pb-[180px] sm:pb-0">
      <div className="shrink-0 touch-none">
        {!sampleMode && <LearningDaysSummary />}
        <div className="flex h-12 items-center justify-between gap-3">
          <h1 className="min-w-0 text-lg font-extrabold leading-none text-neutral-100">
            {oneAnswerMode ? "この一言を1回練習" : sampleMode ? "サンプル" : getLanguageLabel(targetLanguage) + "ドリル"}
          </h1>
          <div className="flex h-10 items-center gap-3">
            {!oneAnswerMode && <Link href="/" className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-neutral-950">追加</Link>}
            {!oneAnswerMode && <div className="flex w-[60px] justify-end">
              <PersonalPhrasePackFlow
                phrases={phrases}
                targetLanguage={targetLanguage}
                onSaved={handlePackSaved}
                buttonLabel="例文"
                buttonClassName="rounded-xl bg-neutral-900 px-3 py-2 text-sm font-bold text-neutral-200 hover:bg-neutral-800"
              />
            </div>}
            <div className="w-[84px] whitespace-nowrap text-right text-sm leading-none text-neutral-500">
              {completed}/{total} · {total > 0 ? Math.round((completed / total) * 100) : 0}%
            </div>
          </div>
        </div>
      </div>

      <div className="h-1.5 w-full shrink-0 touch-none overflow-hidden rounded-full bg-neutral-900">
        <div
          className="h-full bg-emerald-500 transition-all duration-500 ease-out"
          style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
        />
      </div>
      {showLanguageTabs && (
        <LanguageTabs
          value={targetLanguage}
          onChange={setTargetLanguage}
        />
      )}

      <div className="min-h-0 flex-1">
        {saveError && <p role="alert" className="mb-3 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{saveError}</p>}
        <Flashcard
          key={`${targetLanguage}:${sampleMode}`}
          phrase={current}
          onScore={handleScore}
          resetKey={cardResetKey}
          explanationPending={
            pendingExplanationIds.has(current.id) || isExplanationPending(current.id)
          }
        />
      </div>
    </div>
  );
}

function filterPhrasesByTarget(phrases: Phrase[], targetLanguage: LanguageCode): Phrase[] {
  return phrases.filter((phrase) => phrase.targetLanguage === targetLanguage);
}

function LanguageTabs({
  value,
  onChange,
}: {
  value: LanguageCode;
  onChange: (value: LanguageCode) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {ACTIVE_TARGET_LANGUAGE_CODES.map((language) => (
        <button
          key={language}
          type="button"
          onClick={() => onChange(language)}
          aria-pressed={value === language}
          title="翻訳・ドリル・保存・会話で共通の学習言語"
          className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
            value === language
              ? "bg-emerald-500 text-neutral-950"
              : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
          }`}
        >
          {getLanguageLabel(language)}
        </button>
      ))}
    </div>
  );
}
