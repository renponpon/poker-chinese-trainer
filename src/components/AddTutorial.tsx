"use client";

import { useEffect, useState } from "react";
import {
  ADD_TUTORIAL_EVENT,
  ADD_TUTORIAL_QUERY,
  ADD_TUTORIAL_SEEN_KEY,
} from "@/lib/tutorial";

type TutorialStep = {
  target: string;
  title: string;
  body: string;
};

type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const steps: TutorialStep[] = [
  {
    target: "[data-tutorial='input-card']",
    title: "入力して送信",
    body: "一言ずつ入力。\n送信で翻訳、音声で話して入力できます。",
  },
  {
    target: "[data-tutorial='language-switch'], [data-tutorial='mode-controls']",
    title: "言語とモード",
    body: "言語、翻訳方向、翻訳モードを切り替えます。\n速度＝速さ重視、通常＝バランス、品質＝自然さ重視。",
  },
  {
    target: "[data-tutorial='conversation']",
    title: "会話",
    body: "多言語話者と話す時に使います。\n交互に翻訳できます。",
  },
  {
    target: "[data-tutorial='nav-drill'], [data-tutorial='nav-library']",
    title: "ドリルと保存",
    body: "覚えたいフレーズはドリルで練習。\n保存ではあとで見返せます。",
  },
  {
    target: "[data-tutorial='login']",
    title: "ログイン",
    body: "ゲストでも使えます。\nログインすると保存データを同期できます。",
  },
];

export default function AddTutorial() {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rects, setRects] = useState<HighlightRect[]>([]);

  const startTutorial = () => {
    window.localStorage.setItem(ADD_TUTORIAL_SEEN_KEY, "1");
    setStepIndex(0);
    setOpen(true);
  };

  useEffect(() => {
    let timer: number | null = null;

    const handleStart = () => {
      startTutorial();
    };

    const searchParams = new URLSearchParams(window.location.search);
    const requested = searchParams.get(ADD_TUTORIAL_QUERY) === "1";
    if (requested) {
      searchParams.delete(ADD_TUTORIAL_QUERY);
      const nextSearch = searchParams.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`,
      );
      timer = window.setTimeout(startTutorial, 300);
    } else if (!window.localStorage.getItem(ADD_TUTORIAL_SEEN_KEY)) {
      timer = window.setTimeout(startTutorial, 700);
    }

    window.addEventListener(ADD_TUTORIAL_EVENT, handleStart);
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      window.removeEventListener(ADD_TUTORIAL_EVENT, handleStart);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    let frame = 0;
    let timer: number | null = null;

    const updateRect = () => {
      const targets = Array.from(document.querySelectorAll(steps[stepIndex].target))
        .filter((target): target is HTMLElement => target instanceof HTMLElement);
      if (targets.length === 0) {
        setRects([]);
        return;
      }

      targets[0].scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "smooth",
      });

      timer = window.setTimeout(() => {
        frame = window.requestAnimationFrame(() => {
          const targetRects = targets
            .map((target) => target.getBoundingClientRect())
            .filter((targetRect) => targetRect.width > 0 && targetRect.height > 0);
          if (targetRects.length === 0) {
            setRects([]);
            return;
          }
          setRects(
            targetRects.map((targetRect) => ({
              top: targetRect.top,
              left: targetRect.left,
              width: targetRect.width,
              height: targetRect.height,
            })),
          );
        });
      }, 160);
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open, stepIndex]);

  if (!open) return null;

  const step = steps[stepIndex];
  const last = stepIndex === steps.length - 1;
  const viewportWidth = window.innerWidth;
  const paddedRects = rects.map((rect) => ({
    top: Math.max(8, rect.top - 8),
    left: Math.max(8, rect.left - 8),
    width: Math.min(viewportWidth - 16, rect.width + 16),
    height: rect.height + 16,
  }));

  const close = () => {
    window.localStorage.setItem(ADD_TUTORIAL_SEEN_KEY, "1");
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[90]">
      <svg
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[90] h-screen w-screen"
      >
        <defs>
          <mask id="add-tutorial-mask">
            <rect width="100%" height="100%" fill="white" />
            {paddedRects.map((rect, index) => (
              <rect
                key={`${stepIndex}-mask-${index}`}
                x={rect.left}
                y={rect.top}
                width={rect.width}
                height={rect.height}
                rx="18"
                ry="18"
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(10,10,10,0.66)"
          mask="url(#add-tutorial-mask)"
        />
      </svg>

      {paddedRects.map((rect, index) => (
        <div
          key={`${stepIndex}-${index}`}
          aria-hidden
          className="pointer-events-none fixed z-[91] rounded-2xl border-2 border-emerald-300 shadow-[0_0_24px_rgba(110,231,183,0.45)] transition-all duration-200"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      ))}

      <div
        role="dialog"
        aria-modal="true"
        aria-label="使い方"
        className="fixed inset-x-4 bottom-[92px] z-[100] mx-auto flex h-[222px] max-w-md flex-col rounded-2xl bg-neutral-900 p-4 shadow-2xl shadow-black/60 sm:bottom-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-emerald-300">
              {stepIndex + 1}/{steps.length}
            </div>
            <h2 className="mt-1 text-lg font-bold text-neutral-100">
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-full px-3 py-1.5 text-sm font-bold text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            閉じる
          </button>
        </div>

        <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-neutral-300">
          {step.body}
        </p>

        <div className="mt-auto flex items-center justify-between gap-3 pb-2 pt-3">
          <button
            type="button"
            onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
            disabled={stepIndex === 0}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-700"
          >
            戻る
          </button>
          <button
            type="button"
            onClick={() => {
              if (last) {
                close();
              } else {
                setStepIndex((value) => value + 1);
              }
            }}
            className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-neutral-950 hover:bg-emerald-400"
          >
            {last ? "完了" : "次へ"}
          </button>
        </div>
      </div>
    </div>
  );
}
