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

export default function LearningDaysSummary({ completion = false }: { completion?: boolean }) {
  const { summary, snapshot, error, syncError } = useLearningDays();
  if (error) return <Link href="/learning" className="text-xs text-amber-300">学習記録の保存を確認する ›</Link>;
  if (!summary?.total) {
    return snapshot?.pending ? <Link href="/learning" className="text-xs text-neutral-400">学習日は同期後に確定します ›</Link> : null;
  }
  if (!completion) return <Link href="/learning" className="block text-sm text-neutral-400">今週 {summary.weekly}日{summary.streak >= 2 ? ` · ${summary.streak}日連続` : ""} · 学習記録 ›</Link>;
  return <section aria-label="今回の学習記録" className="w-full max-w-sm space-y-3 rounded-2xl bg-neutral-950/60 p-4 text-left">
    <p className="text-sm font-semibold text-emerald-300">{summary.learnedToday ? "今日の学習を記録しました" : "これまでの学習記録"}</p>
    <LearningWeek />
    <Link href="/learning" className="block text-sm text-neutral-300">今週 {summary.weekly}日 · {summary.streak}日連続 · 累計 {summary.total}日 ›</Link>
    {(snapshot?.owner === "guest" || snapshot?.pending || syncError) ? <p className="text-xs text-neutral-400">{snapshot?.owner === "guest" ? "この端末の記録" : "端末に保存済み・同期を待っています"}</p> : null}
  </section>;
}
