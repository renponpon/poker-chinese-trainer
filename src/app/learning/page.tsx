"use client";

import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { useLearningDays } from "@/components/LearningDaysProvider";
import { LearningWeek } from "@/components/LearningDaysSummary";

export default function LearningRecordPage() {
  const { summary, snapshot, error, syncError, syncing, retry } = useLearningDays();
  return <main className="mx-auto max-w-lg space-y-6 px-4 pt-8 pb-32">
    <AppHeader />
    <h1 className="text-xl font-bold">学習記録</h1>
    {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
    {!snapshot && !error && <p>読み込み中…</p>}
    {snapshot && <>
      {summary?.total ? <>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[["今週", summary.weekly], ["連続", summary.streak], ["累計", summary.total]].map(([label, count]) => <div key={label} className="rounded-xl bg-neutral-900 p-3"><dt className="text-sm text-neutral-400">{label}</dt><dd className="mt-2 text-2xl font-bold">{count}<span className="text-sm font-normal"> 日</span></dd></div>)}
        </dl>
        <LearningWeek />
        <p className="text-sm text-neutral-400">{summary.learnedToday ? "今日は学習済みです。" : summary.streak ? "今日はまだ未記録です。昨日までの連続日数を表示しています。" : "また今日から、ひとつずつ。累計日数は残ります。"}</p>
        <p className="text-xs text-neutral-400">最初の記録：{summary.firstDay}（この機能の開始前の学習日は推測していません）</p>
      </> : <p className="text-sm text-neutral-300">{snapshot.pending ? "回答は保存済みです。アカウントの学習日付を同期してから日数を表示します。" : "保存した一言を1回練習すると、ここに学習日が残ります。"}</p>}
      <div className="space-y-2 text-sm text-neutral-400">
        <p>英語・中国語を合わせて、1日に何回練習しても1日。「出なかった」も、回答を保存できれば学習に数えます。翻訳・保存だけ、サンプルの練習、会話リハーサルは対象外です。</p>
        <p>週は月曜〜日曜。学習日付：{snapshot.timeZone ?? "初回同期で確定"}。移動先でも日付の基準は自動変更しません。</p>
        <p>{snapshot.owner === "guest" ? "この端末の記録です。ログインしても、この記録をアカウントへ自動統合しません。" : syncing ? "同期を確認中…" : syncError ? "同期を確認できません。端末の記録を保持し、再接続時に再試行します。" : snapshot.pending ? `端末に保存済み・${snapshot.pending}件の同期待ち` : "同じアカウントの学習日を共有します。"}</p>
        {snapshot.rejected > 0 && <p role="alert" className="text-amber-300">端末の時計などを確認できない記録が{snapshot.rejected}件あります。元の記録は保持し、日数には加えていません。端末日時をご確認ください。</p>}
      </div>
    </>}
    <div className="flex flex-wrap gap-3">
      <Link href="/drill" className="rounded-xl bg-emerald-500 px-4 py-3 font-bold text-neutral-950">ドリルへ</Link>
      <button type="button" onClick={retry} disabled={syncing} className="rounded-xl bg-neutral-800 px-4 py-3 disabled:opacity-50">記録を再読み込み</button>
      <Link href="/data-safety" className="px-2 py-3 text-sm text-neutral-400 underline">バックアップ・復旧</Link>
    </div>
    <BottomNav />
  </main>;
}
