"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import AnalyticsTracker from "./AnalyticsTracker";
import AuthSessionKeeper from "./AuthSessionKeeper";
import { ensureDeviceBackup, DEVICE_BACKUP_KEY, DEVICE_RECOVERY_KEY } from "@/infrastructure/local/device-backup";

export default function DeviceSafetyGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return pathname === "/data-safety" ? children : <ProtectedApp>{children}</ProtectedApp>;
}

function ProtectedApp({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "ready" | "blocked">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let disposed = false;
    const check = () => {
      if (disposed) return;
      try {
        ensureDeviceBackup();
        setState("ready");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "端末のデータを退避できませんでした。");
        setState("blocked");
      }
    };
    const onStorage = (event: StorageEvent) => { if (event.key === DEVICE_BACKUP_KEY || event.key === DEVICE_RECOVERY_KEY || event.key === null) check(); };
    queueMicrotask(check);
    window.addEventListener("storage", onStorage);
    window.addEventListener("phrabit-device-safety-changed", check);
    return () => {
      disposed = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("phrabit-device-safety-changed", check);
    };
  }, []);

  if (state !== "ready") return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-bold">{state === "checking" ? "端末データを確認中…" : "データを保護するため処理を停止しました"}</h1>
      {state === "blocked" && <>
        <p role="alert" className="text-sm text-neutral-300">{message}</p>
        <p className="text-sm text-neutral-400">ブラウザのデータ削除や再インストールはしないでください。退避できるまで編集・同期を開始しません。</p>
        <a href="/data-safety" className="rounded-xl bg-emerald-600 p-3 text-center font-bold">バックアップ・復旧を開く</a>
      </>}
    </main>
  );
  return <><AnalyticsTracker /><AuthSessionKeeper />{children}</>;
}
