"use client";

import Link from "next/link";
import { useLearningDays } from "./LearningDaysProvider";

export function LearningWeek() {
  const { summary } = useLearningDays();
  if (!summary) return null;
  return <div className="grid grid-cols-7 gap-1 text-center text-xs" aria-label="今週の学習日">
    {summary.week.map((entry, index) => <div key={entry.day} aria-label={`${entry.day}${entry.learned ? " 学習済み" : " 未記録"}${entry.today ? " 今日" : ""}`} className={`rounded-lg px-1 py-2 ${entry.learned ? "bg-emerald-950 text-emerald-300" : "bg-neutral-900 text-neutral-400"} ${entry.today ? "ring-1 ring-emerald-500" : ""}`}>
      <span className="block">{["月", "火", "水", "木", "金", "土", "日"][index]}</span><span aria-hidden="true" className="block pt-1">{entry.learned ? "✓" : "—"}</span>
    </div>)}
  </div>;
}

export function LearningDaysStats() {
  const { summary } = useLearningDays();
  if (!summary) return null;
  return <dl className="grid grid-cols-3 gap-2 text-center">
    {[["今週", summary.weekly], ["連続", summary.streak], ["累計", summary.total]].map(([label, count]) => <div key={label} className="rounded-xl bg-neutral-900 p-3"><dt className="text-sm text-neutral-400">{label}</dt><dd className="mt-2 text-2xl font-bold">{count}<span className="text-sm font-normal"> 日</span></dd></div>)}
  </dl>;
}

export default function LearningDaysSummary({ completion = false, issuesOnly = false }: { completion?: boolean; issuesOnly?: boolean }) {
  const { summary, snapshot, error, syncError } = useLearningDays();
  if (error) return <Link href="/learning" className="text-xs text-amber-300">学習記録の保存を確認する ›</Link>;
  if (!summary?.total) {
    return snapshot?.pending ? <Link href="/learning" className="text-xs text-neutral-400">学習日は同期後に確定します ›</Link> : null;
  }
  if (issuesOnly) return syncError ? <Link href="/learning" className="text-xs text-amber-300">学習記録の同期を確認する ›</Link> : null;
  if (!completion) return <Link href="/learning" className="block text-sm text-neutral-400">今週 {summary.weekly}日{summary.streak >= 2 ? ` · ${summary.streak}日連続` : ""} · 学習記録 ›</Link>;
  return <section aria-label="今回の学習記録" className="w-full max-w-lg space-y-4 rounded-2xl bg-neutral-950/60 p-4 text-left">
    <h2 className="text-base font-semibold">学習記録</h2>
    <LearningDaysStats />
    <LearningWeek />
    <Link href="/learning" className="block text-sm text-neutral-400">学習記録の詳細 ›</Link>
    {(snapshot?.owner === "guest" || snapshot?.pending || syncError) ? <p className="text-xs text-neutral-400">{snapshot?.owner === "guest" ? "この端末の記録" : "端末に保存済み・同期を待っています"}</p> : null}
  </section>;
}
