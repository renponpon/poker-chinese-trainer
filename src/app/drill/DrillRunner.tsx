"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { availableRoundPhrases, reconcileDrillRound, startDrillRound, type DrillRound } from "@/application/practice/drill-round";
import { learningDayAt } from "@/domain/practice/learning-days";
import { DRILL_ROUND_PREFIX, loadDrillRound, saveDrillRound } from "@/infrastructure/local/drill-round-storage";
import { useSharedDrillPreferences } from "@/components/DrillPreferencesProvider";
import {
  selectDueDrillPhrases,
  orderDrillPhrases,
  syncDrillSchedule,
} from "@/application/practice/drill-schedule";
import { recordLearningPractice } from "@/infrastructure/local/record-learning-practice";
import LearningDaysSummary from "@/components/LearningDaysSummary";
import { useLearningDays } from "@/components/LearningDaysProvider";
import { deviceLearningTimeZone } from "@/infrastructure/local/learning-days-storage";
import { manageDrillPhrase, type DrillPhraseAction } from "@/application/practice/manage-drill-phrase";
import Flashcard from "@/components/Flashcard";
import { ACTIVE_TARGET_LANGUAGE_CODES, getLanguageLabel } from "@/lib/languages";
import {
  loadLocalSrsItems,
  saveLocalSrsItems,
} from "@/infrastructure/local/srs-storage";
import {
  loadLocalPhrases,
  saveLocalPhrases,
  updateLocalPhrase,
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
import { ACCOUNT_PHRASE_DATA_SYNCED_EVENT, deletePhrasesFromCloud, syncPhraseStateToCloud, syncSavedPhrases } from "@/lib/account-phrase-sync";
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
  const learning = useLearningDays();
  const timeZone = learning.snapshot?.timeZone ?? deviceLearningTimeZone();
  const now = learning.now || undefined;
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
  const retryPhraseIdsRef = useRef(new Set<string>());
  const currentPhraseIdRef = useRef<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const preferences = useSharedDrillPreferences();
  const countedMode = !oneAnswerMode && !sampleMode && focusedIds.length === 0;
  const [round, setRound] = useState<DrillRound | null>(null);
  const roundRef = useRef<DrillRound | null>(null);
  const [roundError, setRoundError] = useState(false);
  const [roundRefresh, setRoundRefresh] = useState(0);
  const roundDay = now ? learningDayAt(now, timeZone) : "";

  const commitRound = useCallback((next: DrillRound, source: Phrase[]) => {
    if (currentDataOwner() !== owner) return;
    try { saveDrillRound(next); setRoundError(false); }
    catch { setRoundError(true); }
    if (currentPhraseIdRef.current !== next.queueIds[0]) setCardResetKey((value) => value + 1);
    roundRef.current = next;
    setRound(next);
    setCompleted(next.completedIds.length);
    const byId = new Map(source.map((phrase) => [phrase.id, phrase]));
    setQueue(next.queueIds.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []));
  }, [owner]);

  useEffect(() => {
    currentPhraseIdRef.current = queue[0]?.id ?? null;
  }, [queue]);

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
    if (countedMode) {
      if (!preferences.ready || !roundDay) return;
      try {
        const stored = loadDrillRound(owner, targetLanguage);
        const cached = roundRef.current?.language === targetLanguage ? roundRef.current : stored;
        const sameDayRound = cached?.day === roundDay && cached.timeZone === timeZone ? cached : null;
        const currentRound = sameDayRound && Object.keys(sameDayRound.reviewed).length > 0 ? sameDayRound : null;
        const base = currentRound ?? startDrillRound({ owner, language: targetLanguage, timeZone, now: now!, limit: preferences.limit, id: crypto.randomUUID(), phrases, items, completedToday: sameDayRound?.completedToday });
        if (!currentRound) saveDrillRound(base);
        const next = reconcileDrillRound(base, phrases, items);
        const removedCount = base.queueIds.length + base.completedIds.length - next.queueIds.length - next.completedIds.length;
        if (removedCount > 0) setActionNotice(`対象から外したため、今回は${next.queueIds.length + next.completedIds.length}問です。`);
        commitRound(next, phrases);
        return;
      } catch { setInitializationError(true); return; }
    }
    const identity = targetLanguage + ":" + focusedIds.join(",") + ":" + sampleMode;
    const newSession = sessionIdentityRef.current !== identity;
    if (newSession) {
      sessionIdentityRef.current = identity;
      completedPhraseIdsRef.current.clear();
      retryPhraseIdsRef.current.clear();
      lastScoredCardRef.current = null;
      setSaveError(null);
      setActionNotice(null);
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
      now,
      timeZone,
    });
    const focused = phrases.filter((phrase) => focusedIds.includes(phrase.id) && !completedPhraseIdsRef.current.has(phrase.id) && phrase.shouldDrill && phrase.targetLanguage === targetLanguage);
    const ordered = oneAnswerMode ? focusedIds.length === 1 ? focused : []
      : sampleMode ? getPracticeSamples(targetLanguage)
      : focusedIds.length ? orderDrillPhrases({ phrases: focused, items, now, timeZone }) : due.filter((phrase) => !completedPhraseIdsRef.current.has(phrase.id));
    if (newSession) {
      setQueue(ordered);
      setCompleted(0);
    } else {
      const currentPhrases = new Map(phrases.filter((phrase) => phrase.shouldDrill && phrase.targetLanguage === targetLanguage).map((phrase) => [phrase.id, phrase]));
      setQueue((previous) => {
        const remaining = previous.flatMap((phrase) => {
          const current = currentPhrases.get(phrase.id);
          return current && !completedPhraseIdsRef.current.has(phrase.id) ? [current] : [];
        });
        const remainingIds = new Set(remaining.map((phrase) => phrase.id));
        const combined = [...remaining, ...ordered.filter((phrase) => !remainingIds.has(phrase.id))];
        const currentCard = remaining.find((phrase) => phrase.id === previous[0]?.id);
        const rest = combined.filter((phrase) => phrase.id !== currentCard?.id);
        const next = orderDrillPhrases({ phrases: rest.filter((phrase) => !retryPhraseIdsRef.current.has(phrase.id)), items, now, timeZone });
        const retries = rest.filter((phrase) => retryPhraseIdsRef.current.has(phrase.id));
        return [...(currentCard ? [currentCard] : []), ...next, ...retries];
      });
    }
  }, [hydrated, items, phrases, targetLanguage, languageReady, focusedIds, sampleMode, oneAnswerMode, now, timeZone, countedMode, preferences.ready, preferences.limit, owner, roundDay, commitRound, roundRefresh]);

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
    const syncRound = (event: StorageEvent) => {
      if (event.key?.startsWith(DRILL_ROUND_PREFIX)) { roundRef.current = null; setRoundRefresh((value) => value + 1); }
      if (!event.key || event.key === "poker-chinese-srs-v1" || event.key === "poker-chinese-local-phrases-v1") syncAccountData();
    };

    window.addEventListener(PHRASE_UPDATED_EVENT, syncPhrases);
    window.addEventListener(PENDING_EXPLANATIONS_CHANGED_EVENT, syncPending);
    window.addEventListener(ACCOUNT_PHRASE_DATA_SYNCED_EVENT, syncAccountData);
    window.addEventListener("storage", syncRound);
    return () => {
      window.removeEventListener(PHRASE_UPDATED_EVENT, syncPhrases);
      window.removeEventListener(PENDING_EXPLANATIONS_CHANGED_EVENT, syncPending);
      window.removeEventListener(ACCOUNT_PHRASE_DATA_SYNCED_EVENT, syncAccountData);
      window.removeEventListener("storage", syncRound);
    };
  }, []);

  const total = completed + queue.length;
  const current = queue[0] ?? null;
  const drillPhraseCount = useMemo(
    () =>
      phrases.filter(
        (phrase) => phrase.shouldDrill && phrase.targetLanguage === targetLanguage && phrase.source !== "prototype",
      ).length,
    [phrases, targetLanguage],
  );
  const showLanguageTabs = ACTIVE_TARGET_LANGUAGE_CODES.length > 1;

  const handleScore = (score: Score) => {
    if (!activeSessionRef.current || !current || currentPhraseIdRef.current !== current.id || currentDataOwner() !== owner || lastScoredCardRef.current === cardResetKey) return;
    lastScoredCardRef.current = cardResetKey;
    setSaveError(null);
    setActionNotice(null);
    if (sampleMode) {
      setQueue((previous) => score === 1 ? [...previous.slice(1), current] : previous.slice(1));
      if (score !== 1) setCompleted((value) => value + 1);
      setCardResetKey((value) => value + 1);
      return;
    }
    let result;
    try {
      const storedItems = loadLocalSrsItems();
      const storedPhrases = loadLocalPhrases();
      const storedPhrase = storedPhrases.find((phrase) => phrase.id === current.id && phrase.shouldDrill);
      if (!storedPhrase || !storedItems.some((item) => item.id === current.id)) throw new Error("practice_item_missing");
      if (countedMode && roundRef.current) {
        const checked = reconcileDrillRound(roundRef.current, storedPhrases, storedItems);
        if (checked !== roundRef.current || checked.queueIds[0] !== current.id) {
          commitRound(checked, storedPhrases);
          setCardResetKey((value) => value + 1);
          setActionNotice("別の画面の練習結果を反映しました。");
          return;
        }
      }
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
    if (result.updatedItem && !countedMode) {
      skipNextQueueResetRef.current = true;
    }
    setItems(result.items);

    if (result.updatedItem) {
      void syncPhraseStateToCloud(current, result.updatedItem).catch((error) => {
        console.warn("[DrillRunner] SRS cloud sync failed", error);
      });
    }

    if (countedMode && roundRef.current) {
      commitRound(reconcileDrillRound(roundRef.current, phrases, result.items), phrases);
      setCardResetKey((value) => value + 1);
      return;
    }
    if (score === 1 && !oneAnswerMode) retryPhraseIdsRef.current.add(current.id);
    else retryPhraseIdsRef.current.delete(current.id);
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

  const handlePhraseAction = (action: DrillPhraseAction) => {
    if (!activeSessionRef.current || !current || sampleMode || currentDataOwner() !== owner || currentPhraseIdRef.current !== current.id) return;
    if (action === "delete" && !window.confirm(`「${current.sourceText || current.japanese}」を削除しますか？\n保存フレーズと復習記録を削除します。ログイン中は同期後に他の端末からも削除されます。元に戻せません。\n保存に残したい場合は「ドリルから外す」を選んでください。`)) return;
    if (currentDataOwner() !== owner) return;
    setSaveError(null);
    try {
      const result = manageDrillPhrase({ phraseId: current.id, action, storage: {
        loadPhrases: loadLocalPhrases, savePhrases: saveLocalPhrases, updatePhrase: updateLocalPhrase,
        loadSrsItems: loadLocalSrsItems, saveSrsItems: saveLocalSrsItems,
      } });
      setPhrases(result.phrases);
      setItems(result.srsItems);
      const updated = result.phrases.find((phrase) => phrase.id === current.id);
      if (action === "delete" || action === "pause") {
        retryPhraseIdsRef.current.delete(current.id);
        if (countedMode && roundRef.current) commitRound(reconcileDrillRound(roundRef.current, result.phrases, result.srsItems), result.phrases);
        else setQueue((previous) => previous.filter((phrase) => phrase.id !== current.id));
        currentPhraseIdRef.current = null;
        setCardResetKey((value) => value + 1);
      }
      setActionNotice(action === "delete" ? `この端末から削除しました。${countedMode ? `今回は${total - 1}問です。` : ""}` : action === "pause" ? `ドリルから外しました。${countedMode ? `今回は${total - 1}問です。` : "保存画面から戻せます。"}` : null);
      const sync = action === "delete" ? deletePhrasesFromCloud([current.id])
        : updated ? syncPhraseStateToCloud(updated, result.srsItems.find((item) => item.id === current.id) ?? null) : Promise.resolve(false);
      void sync.catch(() => {
        if (activeSessionRef.current && currentDataOwner() === owner) setSaveError("この端末への変更は保存済みですが、他の端末への同期は未完了です。オンラインで同期を再試行してください。");
      });
    } catch {
      setSaveError("変更を完了できませんでした。データを削除せず、保存内容を確認して再試行してください。");
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
    if (!countedMode) setQueue((prev) => [
      ...prev,
      ...newPhrases.filter((phrase) => phrase.targetLanguage === targetLanguage),
    ]);
    setPendingExplanationIds(new Set(getPendingExplanationIds()));
  };

  const messages = <>
    {countedMode && roundError && <p role="alert" className="text-xs text-amber-200">中断位置を保存できませんでした。保存済みの回答は復習記録から復元します。<button type="button" className="min-h-8 underline" onClick={() => { if (roundRef.current) commitRound(roundRef.current, phrases); }}>再試行</button></p>}
    {actionNotice && <p role="status" className="shrink-0 text-xs text-neutral-400">{actionNotice}</p>}
    {saveError && <p role="alert" className="shrink-0 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{saveError}</p>}
  </>;

  if (initializationError) {
    return <div role="alert" className="space-y-4 rounded-xl bg-neutral-900 p-6 text-sm text-amber-200">
      <p>端末の練習記録を確認できないため、ドリルを停止しました。データを削除せず、学習記録の再読み込みまたはバックアップ・復旧をご確認ください。</p>
      <Link href="/learning" className="block underline">学習記録を確認する</Link>
      <Link href="/data-safety" className="block underline">バックアップ・復旧</Link>
    </div>;
  }

  if (countedMode && !preferences.ready && preferences.error) return <div role="alert">{preferences.error}<button type="button" onClick={preferences.retry} className="min-h-11 underline">設定を再試行</button></div>;
  if (!hydrated || !languageReady || (countedMode && (!preferences.ready || !round || round.language !== targetLanguage || round.day !== roundDay))) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-sm text-neutral-500">
        読み込み中...
      </div>
    );
  }

  const remaining = countedMode ? availableRoundPhrases({ phrases, items, language: targetLanguage, now: now!, timeZone }, round?.completedToday) : [];
  const nextCount = preferences.limit === 0 ? remaining.length : Math.min(remaining.length, preferences.limit);
  const startNextRound = () => {
    if (currentDataOwner() !== owner) return;
    try {
      const localPhrases = loadLocalPhrases();
      const localItems = loadLocalSrsItems();
      const next = startDrillRound({ owner, language: targetLanguage, timeZone, now: Date.now(), limit: preferences.limit, id: crypto.randomUUID(), phrases: localPhrases, items: localItems, completedToday: round?.completedToday });
      saveDrillRound(next);
      setPhrases(localPhrases);
      setItems(localItems);
      commitRound(next, localPhrases);
      setActionNotice(null);
      setSaveError(null);
      lastScoredCardRef.current = null;
    } catch { setSaveError("次の問題を準備できませんでした。再試行してください。"); }
  };

  if (oneAnswerMode && !current) {
    const practiced = completed === 1;
    const savedPhrase = phrases.find((phrase) => phrase.id === focusedIds[0] && phrase.shouldDrill && phrase.targetLanguage === targetLanguage);
    return (
      <section aria-labelledby="once-practice-title" className="flex flex-col items-center gap-4 overflow-y-auto rounded-3xl bg-neutral-900/70 p-6 pb-24 text-center sm:p-10">
        {messages}
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
        {messages}
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
        {messages}
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

  if (!current && countedMode) {
    return <section className="flex flex-col items-center gap-4 overflow-y-auto rounded-3xl bg-neutral-900/70 p-6 pb-24 text-center">
      {messages}
      {showLanguageTabs && <LanguageTabs value={targetLanguage} onChange={setTargetLanguage} />}
      <h1 className="text-lg font-semibold">{completed ? `今回の${completed}問が完了しました` : "今回の対象カードはありません"}</h1>
      <p className="text-xs text-neutral-400">ドリル対象 {drillPhraseCount}枚</p>
      {!completed && !remaining.length && <p className="text-sm text-neutral-400">復習予定が来たら、また練習できます。</p>}
      {completed > 0 && <LearningDaysSummary completion />}
      <div className="flex flex-wrap justify-center gap-2"><Link href="/" className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-neutral-950">終了</Link>
        {remaining.length > 0 && <button type="button" onClick={startNextRound} className="rounded-xl bg-neutral-800 px-4 py-3 text-sm">{completed ? nextCount === remaining.length ? "あと" : "もう" : ""}{nextCount}問{completed ? "" : "を始める"}</button>}
      </div>
      <PersonalPhrasePackFlow phrases={phrases} targetLanguage={targetLanguage} onSaved={handlePackSaved} buttonLabel="例文を作る" />
    </section>;
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-neutral-900/70 p-10 text-center">
        {messages}
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
        <div className="flex h-12 items-center justify-between gap-2">
          <h1 className="min-w-0 text-base font-extrabold leading-tight text-neutral-100">
            {oneAnswerMode ? "この一言を1回練習" : sampleMode ? "サンプル" : getLanguageLabel(targetLanguage) + "ドリル"}
          </h1>
          <div className="flex h-10 items-center gap-2">
            {!oneAnswerMode && <Link href="/" className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-neutral-950">追加</Link>}
            {!oneAnswerMode && !countedMode && <div className="flex w-[60px] justify-end">
              <PersonalPhrasePackFlow
                phrases={phrases}
                targetLanguage={targetLanguage}
                onSaved={handlePackSaved}
                buttonLabel="例文"
                buttonClassName="rounded-xl bg-neutral-900 px-3 py-2 text-sm font-bold text-neutral-200 hover:bg-neutral-800"
              />
            </div>}
            <div aria-label="今回の進捗" className="whitespace-nowrap text-right text-xs leading-none text-neutral-400">
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

      {messages}
      <div className="min-h-0 flex-1">
        <Flashcard
          key={`${targetLanguage}:${sampleMode}`}
          phrase={current}
          onScore={handleScore}
          resetKey={cardResetKey}
          explanationPending={
            pendingExplanationIds.has(current.id) || isExplanationPending(current.id)
          }
          onPhraseAction={sampleMode ? undefined : handlePhraseAction}
          drillPhraseCount={sampleMode ? undefined : drillPhraseCount}
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
