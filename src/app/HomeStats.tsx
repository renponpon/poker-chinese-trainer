"use client";

import { useEffect, useState } from "react";
import { loadLocalPhrases } from "@/lib/local-phrases";
import {
  ensureSrsItems,
  getDuePhrases,
  getStatusCounts,
  loadSrsData,
} from "@/lib/srs";
import type { Phrase } from "@/lib/types";

export default function HomeStats() {
  const [total, setTotal] = useState<number | null>(null);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [counts, setCounts] = useState<{ mastered: number; maintenance: number } | null>(
    null,
  );

  const refreshStats = (phrases: Phrase[]) => {
    let items = loadSrsData();
    items = ensureSrsItems(phrases, items);
    const due = getDuePhrases(phrases, items);
    setTotal(phrases.length);
    setDueCount(due.length);
    const sc = getStatusCounts(phrases, items);
    setCounts({ mastered: sc.mastered, maintenance: sc.maintenance });
  };

  useEffect(() => {
    const phrases = loadLocalPhrases();
    refreshStats(phrases);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat
          label="登録フレーズ"
          value={total === null ? "…" : total.toString()}
          accent="text-neutral-200"
        />
        <Stat
          label="今日のドリル"
          value={dueCount === null ? "…" : dueCount.toString()}
          accent="text-indigo-300"
        />
        <Stat
          label="習得 / メンテ"
          value={counts ? `${counts.mastered} / ${counts.maintenance}` : "…"}
          accent="text-emerald-300"
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-3">
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
        {label}
      </div>
    </div>
  );
}
