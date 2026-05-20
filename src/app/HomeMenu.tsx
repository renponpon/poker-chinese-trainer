"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SRS_STATUS_GUIDE } from "@/lib/srs";

export default function HomeMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="メニュー"
        className="flex h-10 w-10 items-center justify-center text-emerald-400 hover:text-emerald-300"
      >
        <MenuIcon />
      </button>
      {open && (
        <div className="absolute right-0 top-14 z-[80] max-h-[calc(100vh-96px)] w-[min(88vw,380px)] overflow-y-auto overscroll-contain rounded-2xl bg-neutral-950 p-3 text-left shadow-2xl shadow-black/50">
          <Link
            href="/feedback"
            className="block rounded-xl bg-neutral-900 px-4 py-4 text-base font-bold text-neutral-200 hover:bg-neutral-800"
          >
            運営へのフィードバック
          </Link>

          <details className="mt-2 rounded-xl bg-neutral-900">
            <summary className="cursor-pointer list-none px-4 py-4 text-base font-bold text-neutral-200">
              スマホにインストールする方法
            </summary>
            <div className="px-4 pb-4 pt-1 text-sm leading-relaxed text-neutral-400">
              <p>
                <span className="font-bold text-neutral-300">iOS:</span>{" "}
                Safariで共有アイコンをタップし、「ホーム画面に追加」を選択します。
              </p>
              <p className="mt-2">
                <span className="font-bold text-neutral-300">Android:</span>{" "}
                Chromeのメニューから「アプリをインストール」を選択します。
              </p>
            </div>
          </details>

          <details className="mt-2 rounded-xl bg-neutral-900">
            <summary className="cursor-pointer list-none px-4 py-4 text-base font-bold text-neutral-200">
              復習タイミングの説明
            </summary>
            <div className="px-4 pb-4 pt-1">
              <p className="text-sm leading-relaxed text-neutral-500">
                正解・失敗の回数に応じて、次に出すタイミングを自動で変えます。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {SRS_STATUS_GUIDE.map((item) => (
                  <div
                    key={item.status}
                    className="rounded-xl bg-neutral-950/70 p-4"
                  >
                    <div className="text-base font-bold text-neutral-100">
                      {item.label}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-400">
                      {item.definition}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                      {item.cycle}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 7h14" />
      <path d="M5 12h14" />
      <path d="M5 17h14" />
    </svg>
  );
}
