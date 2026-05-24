"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import DataHandlingNotice from "@/components/DataHandlingNotice";
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
          <details className="rounded-xl bg-neutral-900">
            <summary className="cursor-pointer list-none px-4 py-4 text-base font-bold text-neutral-200">
              音声入力のコツ
            </summary>
            <div className="px-4 pb-4 pt-1 text-sm leading-relaxed text-neutral-400">
              <p>
                翻訳精度を上げたい時は、話し言葉を少しだけ「文章」に近づけるのがおすすめです。
              </p>
              <div className="mt-3 space-y-3">
                <section>
                  <div className="font-bold text-neutral-200">
                    疑問文は言葉で分かるように
                  </div>
                  <p className="mt-1">
                    語尾を上げるだけでなく、「してる？」より「していますか？」のように、疑問だと分かる言葉を入れる。
                  </p>
                </section>

                <section>
                  <div className="font-bold text-neutral-200">
                    「です」「ます」をはっきり発音する
                  </div>
                  <p className="mt-1">
                    語尾が曖昧だと、断定なのか質問なのかが崩れやすくなります。
                  </p>
                </section>

                <section>
                  <div className="font-bold text-neutral-200">
                    助詞を省略しない
                  </div>
                  <p className="mt-1">
                    「これ、食べる」より「これを食べます」のように、が・を・に・はを入れると単語のつながりが伝わりやすくなります。
                  </p>
                </section>

                <section>
                  <div className="font-bold text-neutral-200">
                    1文を短く切る
                  </div>
                  <p className="mt-1">
                    「〜で、〜だから、〜なんですけど」と長くつなげず、句点を早めに打つイメージで区切る。
                  </p>
                </section>

                <section>
                  <div className="font-bold text-neutral-200">
                    主語を省略しない
                  </div>
                  <p className="mt-1">
                    「私は」「あなたは」「それは」を入れると、誰が何をする話なのか翻訳が迷いにくくなります。
                  </p>
                </section>

                <section>
                  <div className="font-bold text-neutral-200">
                    「これ・それ・あれ」を具体名詞に
                  </div>
                  <p className="mt-1">
                    「これをそこに置いて」より「この書類を、机の上に置いてください」の方が正確に伝わります。
                  </p>
                </section>

                <section>
                  <div className="font-bold text-neutral-200">
                    なるべく能動態で話す
                  </div>
                  <p className="mt-1">
                    「彼に頼まれた」より「彼が私に頼んだ」のように、誰がしたのかを明確にする。
                  </p>
                </section>
              </div>
            </div>
          </details>

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

          <details className="mt-2 rounded-xl bg-neutral-900">
            <summary className="cursor-pointer list-none px-4 py-4 text-base font-bold text-neutral-200">
              入力データについて
            </summary>
            <div className="px-4 pb-4 pt-1">
              <DataHandlingNotice />
            </div>
          </details>

          <Link
            href="/feedback"
            className="mt-2 block rounded-xl bg-neutral-900 px-4 py-4 text-base font-bold text-neutral-200 hover:bg-neutral-800"
          >
            運営へのご要望
          </Link>
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
