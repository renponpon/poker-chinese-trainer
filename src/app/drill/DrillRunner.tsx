"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  selectDueDrillPhrases,
  syncDrillSchedule,
} from "@/application/practice/drill-schedule";
import { recordDrillPracticeResult } from "@/application/practice/record-practice-result";
import Flashcard from "@/components/Flashcard";
import { getAuthHeaders } from "@/lib/auth-headers";
import { ACTIVE_TARGET_LANGUAGE_CODES, getLanguageLabel } from "@/lib/languages";
import {
  loadLocalSrsItems,
  saveLocalSrsItems,
} from "@/infrastructure/local/srs-storage";
import {
  loadLocalPhrases,
  loadOwnerKey,
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
import type { LanguageCode, Phrase, Score, SrsItem } from "@/lib/types";
import PersonalPhrasePackFlow from "./PersonalPhrasePackFlow";

export default function DrillRunner() {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [items, setItems] = useState<SrsItem[]>([]);
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>("zh");
  const [hydrated, setHydrated] = useState(false);
  const [queue, setQueue] = useState<Phrase[]>([]);
  const [completed, setCompleted] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [cardResetKey, setCardResetKey] = useState(0);
  const [pendingExplanationIds, setPendingExplanationIds] = useState<Set<string>>(new Set());
  const skipNextQueueResetRef = useRef(false);

  useEffect(() => {
    primeSpeech();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const localPhrases = loadLocalPhrases();
      setPhrases(localPhrases);
      const { items: stored } = syncDrillSchedule({
        phrases: localPhrases,
        items: loadLocalSrsItems(),
        storage: { saveSrsItems: saveLocalSrsItems },
      });
      setItems(stored);
      const due = selectDueDrillPhrases({
        phrases: filterPhrasesByTarget(localPhrases, "zh"),
        items: stored,
      });
      const shuffled = [...due].sort(() => Math.random() - 0.5);
      setQueue(shuffled);
      setSessionTotal(shuffled.length);
      setPendingExplanationIds(new Set(getPendingExplanationIds()));
      resumePendingPackJobs();
      recordProductAnalyticsEvent({
        eventName: "drill_open",
        sourcePage: "drill",
        targetLanguage: "zh",
      });
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextQueueResetRef.current) {
      skipNextQueueResetRef.current = false;
      return;
    }
    const due = selectDueDrillPhrases({
      phrases: filterPhrasesByTarget(phrases, targetLanguage),
      items,
    });
    const shuffled = [...due].sort(() => Math.random() - 0.5);
    setQueue(shuffled);
    setSessionTotal(shuffled.length);
    setCompleted(0);
  }, [hydrated, items, phrases, targetLanguage]);

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

    window.addEventListener(PHRASE_UPDATED_EVENT, syncPhrases);
    window.addEventListener(PENDING_EXPLANATIONS_CHANGED_EVENT, syncPending);
    return () => {
      window.removeEventListener(PHRASE_UPDATED_EVENT, syncPhrases);
      window.removeEventListener(PENDING_EXPLANATIONS_CHANGED_EVENT, syncPending);
    };
  }, []);

  const total = sessionTotal;
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
    if (!current) return;
    recordProductAnalyticsEvent({
      eventName: "drill_answer",
      sourcePage: "drill",
      direction: current.direction,
      targetLanguage: current.targetLanguage,
      score,
      success: true,
    });
    const result = recordDrillPracticeResult({
      items,
      phraseId: current.id,
      score,
      storage: { saveSrsItems: saveLocalSrsItems },
    });
    if (result.updatedItem) {
      skipNextQueueResetRef.current = true;
    }
    setItems(result.items);

    const ownerKey = loadOwnerKey();
    if (result.updatedItem) {
      void getAuthHeaders().then((authHeaders) => fetch("/api/srs/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          ownerKey,
          phrase: current,
          srsItem: result.updatedItem,
        }),
      })).catch((error) => {
        console.warn("[DrillRunner] SRS cloud sync failed", error);
      });
    }

    setQueue((prev) => {
      const rest = prev.slice(1);
      // Score=1 のときは末尾に戻して同セッション中に再出題
      return score === 1 ? [...rest, current] : rest;
    });
    setCardResetKey((key) => key + 1);
    if (score !== 1) {
      setCompleted((c) => c + 1);
    }
  };

  const handlePackSaved = (newPhrases: Phrase[]) => {
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

  if (!hydrated) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-sm text-neutral-500">
        読み込み中...
      </div>
    );
  }

  if (phrases.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-neutral-900/70 p-10 text-center">
        <div className="text-lg font-semibold text-neutral-200">
          まだフレーズがありません
        </div>
        <div className="text-sm text-neutral-500">
          翻訳すると、保存したフレーズをあとで練習できます。
        </div>
        <div className="flex flex-wrap justify-center gap-2">
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

  if (drillPhraseCount === 0) {
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
          今日のドリル完了
        </div>
        <div className="text-sm text-neutral-400">
          {completed} 件をレビューしました。お疲れさま。
        </div>
        <div className="mt-2 flex gap-2">
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
        <div className="flex h-12 items-center justify-between gap-3">
          <h1 className="min-w-0 text-2xl font-extrabold leading-none text-neutral-100">
            {getLanguageLabel(targetLanguage)}ドリル
          </h1>
          <div className="flex h-10 items-center gap-3">
            <div className="flex w-[60px] justify-end">
              <PersonalPhrasePackFlow
                phrases={phrases}
                targetLanguage={targetLanguage}
                onSaved={handlePackSaved}
                buttonClassName="rounded-xl bg-neutral-900 px-3 py-2 text-sm font-bold text-neutral-200 hover:bg-neutral-800"
              />
            </div>
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
        <Flashcard
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
