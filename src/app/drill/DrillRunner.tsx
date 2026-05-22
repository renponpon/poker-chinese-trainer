"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Flashcard from "@/components/Flashcard";
import { getAuthHeaders } from "@/lib/auth-headers";
import { loadLocalPhrases, loadOwnerKey } from "@/lib/local-phrases";
import {
  getPendingExplanationIds,
  isExplanationPending,
  PENDING_EXPLANATIONS_CHANGED_EVENT,
  PHRASE_UPDATED_EVENT,
  refreshPhrasesFromStorage,
  resumePendingPackJobs,
} from "@/lib/pending-pack-explanations";
import {
  applyScore,
  ensureSrsItems,
  getDuePhrases,
  loadSrsData,
  saveSrsData,
} from "@/lib/srs";
import { primeSpeech } from "@/lib/speech";
import type { Phrase, Score, SrsItem } from "@/lib/types";
import PersonalPhrasePackFlow from "./PersonalPhrasePackFlow";

export default function DrillRunner() {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [items, setItems] = useState<SrsItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [queue, setQueue] = useState<Phrase[]>([]);
  const [completed, setCompleted] = useState(0);
  const [pendingExplanationIds, setPendingExplanationIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    primeSpeech();
    const localPhrases = loadLocalPhrases();
    setPhrases(localPhrases);
    let stored = loadSrsData();
    stored = ensureSrsItems(localPhrases, stored);
    setItems(stored);
    const due = getDuePhrases(localPhrases, stored);
    const shuffled = [...due].sort(() => Math.random() - 0.5);
    setQueue(shuffled);
    setPendingExplanationIds(new Set(getPendingExplanationIds()));
    resumePendingPackJobs();
    setHydrated(true);
  }, []);

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

  const total = useMemo(() => queue.length + completed, [queue.length, completed]);
  const current = queue[0] ?? null;
  const drillPhraseCount = useMemo(
    () => phrases.filter((phrase) => phrase.shouldDrill).length,
    [phrases],
  );

  const handleScore = (score: Score) => {
    if (!current) return;
    const idx = items.findIndex((it) => it.id === current.id);
    let nextItems = items;
    let updatedItem: SrsItem | null = null;
    if (idx >= 0) {
      const updated = applyScore(items[idx], score);
      nextItems = [...items];
      nextItems[idx] = updated;
      updatedItem = updated;
    }
    setItems(nextItems);
    saveSrsData(nextItems);

    const ownerKey = loadOwnerKey();
    if (updatedItem) {
      void getAuthHeaders().then((authHeaders) => fetch("/api/srs/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          ownerKey,
          phrase: current,
          srsItem: updatedItem,
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
    setCompleted((c) => c + 1);
  };

  const handlePackSaved = (newPhrases: Phrase[]) => {
    const nextPhrases = [...newPhrases, ...phrases];
    setPhrases(nextPhrases);
    const nextItems = ensureSrsItems(nextPhrases, items);
    setItems(nextItems);
    setQueue((prev) => [...prev, ...newPhrases]);
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
          <PersonalPhrasePackFlow phrases={phrases} onSaved={handlePackSaved} />
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
        <div className="text-lg font-semibold text-neutral-200">
          ドリル対象がありません
        </div>
        <div className="text-sm text-neutral-500">
          ライブラリから覚えたいフレーズを「ドリルに追加」できます。
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <PersonalPhrasePackFlow phrases={phrases} onSaved={handlePackSaved} />
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
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-2xl font-extrabold text-neutral-100">
            今日のドリル
          </h1>
          <div className="flex items-center gap-3">
            <PersonalPhrasePackFlow
              phrases={phrases}
              onSaved={handlePackSaved}
              buttonClassName="rounded-xl bg-neutral-900 px-3 py-2 text-sm font-bold text-neutral-200 hover:bg-neutral-800"
            />
            <div className="text-right text-sm text-neutral-500">
              <span>
                残り <span className="font-bold text-emerald-300">{queue.length}</span>{" "}
                件 / 完了 {completed} 件
              </span>
              <span className="ml-3">
                {total > 0 ? Math.round((completed / total) * 100) : 0}%
              </span>
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

      <div className="min-h-0 flex-1">
        <Flashcard
          phrase={current}
          onScore={handleScore}
          explanationPending={
            pendingExplanationIds.has(current.id) || isExplanationPending(current.id)
          }
        />
      </div>
    </div>
  );
}
