"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  captureDeviceData, downloadDeviceBackup, isDeviceRecoveryActive, readDeviceBackup,
  readPreRestoreBackup, restoreDeviceBackup, type DeviceBackup,
} from "@/infrastructure/local/device-backup";

export default function DataSafetyPage() {
  const [backup, setBackup] = useState<DeviceBackup | null>(null);
  const [rescue, setRescue] = useState<DeviceBackup | null>(null);
  const [message, setMessage] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      try { setRecovery(isDeviceRecoveryActive()); setRescue(readPreRestoreBackup()); setBackup(readDeviceBackup()); }
      catch (error) { setMessage(error instanceof Error ? error.message : "データを読み込めません。"); }
    });
    return () => { disposed = true; };
  }, []);

  const download = (original: boolean) => {
    try {
      const data = original ? backup : captureDeviceData();
      if (data) downloadDeviceBackup(data, original ? "before-update" : "current-device");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存に失敗しました。"); }
  };

  const restore = async () => {
    if (!backup || !confirmed || busy) return;
    setBusy(true);
    try {
      const run = () => restoreDeviceBackup(backup);
      if (navigator.locks) await navigator.locks.request("phrabit-account-sync", run);
      else run();
      setRecovery(true);
      setMessage("更新前のデータを端末へ戻しました。クラウドには送信していません。同期は停止中です。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "復元に失敗しました。"); }
    finally {
      try { setRecovery(isDeviceRecoveryActive()); setRescue(readPreRestoreBackup()); }
      catch { setRecovery(true); }
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 p-5 text-neutral-100">
      <h1 className="mt-6 text-2xl font-bold">バックアップ・復旧</h1>
      <p className="text-sm leading-relaxed text-neutral-300">この画面では自動同期しません。バックアップはこのブラウザ内のフレーズ・学習履歴・設定です。クラウド全体や他の端末だけにあるデータは含みません。</p>
      <p className="text-sm leading-relaxed text-neutral-400">ダウンロードするJSONにはフレーズ本文や、このブラウザで使ったアカウントの保存データが含まれます。公開・チャットへの貼り付けは避けてください。ログイン用トークンやAPIキーは含めません。</p>
      <button onClick={() => download(false)} className="rounded-xl bg-emerald-600 p-3 font-bold">現在の端末データをダウンロード</button>
      {rescue && <button onClick={() => downloadDeviceBackup(rescue, "before-restore")} className="rounded-xl bg-neutral-800 p-3">復元直前データをダウンロード</button>}
      {backup ? <section className="flex flex-col gap-3 rounded-2xl bg-neutral-900 p-4">
        <h2 className="font-bold">更新前の自動退避データ</h2>
        <p className="text-sm text-neutral-400">退避日時：{new Date(backup.createdAt).toLocaleString("ja-JP")}</p>
        <button onClick={() => download(true)} className="rounded-xl bg-neutral-800 p-3">更新前データをダウンロード</button>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-bold">問題が起きた場合だけ：端末を復元する</summary>
          <p className="my-3 text-sm leading-relaxed text-neutral-300">他のPhrabitタブを閉じてから実行してください。現在の端末データも別に退避してから戻します。復元後は誤送信を防ぐため編集・クラウド同期を停止し、運営側で内容を確認するまで通常利用へ戻りません。</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />他のタブを閉じ、復元後に同期が停止することを理解しました</label>
          <button disabled={!confirmed || busy || recovery} onClick={() => void restore()} className="mt-3 w-full rounded-xl bg-red-950 p-3 text-sm font-bold disabled:opacity-40">{busy ? "復元中…" : "更新前データを端末へ復元（同期停止）"}</button>
        </details>
      </section> : <p className="text-sm text-neutral-400">更新前の自動退避データはまだありません。現在のデータのダウンロードは可能です。</p>}
      {message && <p role="status" className="rounded-xl bg-neutral-900 p-4 text-sm">{message}</p>}
      {recovery ? <p className="text-sm text-amber-200">復元確認中です。同期は停止しています。ブラウザの保存データを消さず、運営に状況をお知らせください。</p> : <Link href="/" prefetch={false} className="rounded-xl bg-neutral-800 p-3 text-center">通常画面へ戻る</Link>}
    </main>
  );
}
