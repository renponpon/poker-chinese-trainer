"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { playChinese } from "@/lib/speech";
import type { Phrase, Score } from "@/lib/types";

type FlashcardProps = {
  phrase: Phrase;
  onScore: (score: Score) => void;
};

export default function Flashcard({ phrase, onScore }: FlashcardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const advanceTimeoutRef = useRef<number | null>(null);
  const isChinesePrompt = phrase.direction === "zh-to-ja";

  useEffect(() => {
    setIsFlipped(false);
  }, [phrase.id]);

  useEffect(() => {
    return () => {
      if (advanceTimeoutRef.current) {
        window.clearTimeout(advanceTimeoutRef.current);
      }
    };
  }, []);

  const handleFlip = useCallback(() => {
    if (!isFlipped) {
      setIsFlipped(true);
      if (phrase.audioUrl) {
        const audio = new Audio(phrase.audioUrl);
        audio.play().catch(() => playChinese(phrase.chinese));
      } else {
        playChinese(phrase.chinese);
      }
    } else {
      setIsFlipped(false);
    }
  }, [isFlipped, phrase.audioUrl, phrase.chinese]);

  const handleScore = useCallback(
    (score: Score) => {
      if (advanceTimeoutRef.current) return;

      setIsFlipped(false);
      advanceTimeoutRef.current = window.setTimeout(() => {
        onScore(score);
        advanceTimeoutRef.current = null;
      }, 120);
    },
    [onScore],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        handleFlip();
        return;
      }
      if (!isFlipped) return;
      if (e.key === "1") handleScore(1);
      if (e.key === "2") handleScore(2);
      if (e.key === "3") handleScore(3);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFlipped, handleFlip, handleScore]);

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (phrase.audioUrl) {
      const audio = new Audio(phrase.audioUrl);
      audio.play().catch(() => playChinese(phrase.chinese));
    } else {
      playChinese(phrase.chinese);
    }
  };

  return (
    <div className="flex h-full w-full flex-col items-center overscroll-none">
      <div
        className={cn(
          "relative min-h-0 w-full flex-1 cursor-pointer preserve-3d perspective-1000 transition-transform duration-700",
          isFlipped ? "rotate-y-180" : "",
        )}
        onClick={handleFlip}
      >
        <div className="absolute inset-0 flex touch-none flex-col items-center justify-center rounded-[28px] bg-neutral-900 p-5 backface-hidden sm:p-6">
          {isChinesePrompt && (
            <div className="mb-3 text-lg tracking-wide text-neutral-400">
              {phrase.pinyin}
            </div>
          )}
          <div className="px-1 text-center text-[32px] font-semibold leading-relaxed text-neutral-100 sm:text-4xl">
            {isChinesePrompt ? phrase.chinese : phrase.japanese}
          </div>
          <div className="mt-6 flex items-center gap-2 text-base text-neutral-500">
            <span>タップして確認</span>
          </div>
        </div>

        <div className="absolute inset-0 flex flex-col rounded-[28px] bg-neutral-900 p-4 backface-hidden rotate-y-180 sm:p-5">
          <button
            type="button"
            onClick={handlePlay}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 touch-none items-center justify-center text-neutral-300 hover:text-emerald-300"
            aria-label="再生"
          >
            <PlayIcon />
          </button>
          <div className="shrink-0 touch-none px-12 text-center">
            <div className="text-lg tracking-wide text-neutral-400 sm:text-xl">
              {phrase.pinyin}
            </div>
            <div className="mt-2 break-keep px-1 text-center text-[34px] font-bold leading-tight text-white sm:text-4xl">
              {isChinesePrompt ? phrase.japanese : phrase.chinese}
            </div>
            {isChinesePrompt && (
              <div className="mt-3 text-xl font-semibold text-emerald-200">
                {phrase.chinese}
              </div>
            )}
          </div>

          {phrase.explanation && (
            <div
              className="mt-4 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain whitespace-pre-wrap px-1 pb-2 text-left text-base leading-relaxed text-neutral-200"
            >
              {phrase.explanation}
            </div>
          )}
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-x-0 bottom-[88px] z-30 w-full touch-none bg-neutral-950/95 px-5 pb-3 pt-2 backdrop-blur transition-all duration-300",
          isFlipped
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-full opacity-0",
        )}
      >
        <div className="mx-auto flex w-full max-w-md justify-center gap-2">
          <ScoreButton variant="bad" onClick={() => handleScore(1)}>
            Bad
            <span className="block text-xs text-red-300/80">出ない</span>
          </ScoreButton>
          <ScoreButton variant="good" onClick={() => handleScore(2)}>
            Good
            <span className="block text-xs text-yellow-200/80">出た</span>
          </ScoreButton>
          <ScoreButton variant="perfect" onClick={() => handleScore(3)}>
            Perfect
            <span className="block text-xs text-emerald-200/80">反射</span>
          </ScoreButton>
        </div>
      </div>
    </div>
  );
}

function ScoreButton({
  variant,
  onClick,
  children,
}: {
  variant: "bad" | "good" | "perfect";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const palette = {
    bad: "text-neutral-200 hover:bg-neutral-900/70",
    good: "text-neutral-200 hover:bg-neutral-900/70",
    perfect: "text-neutral-200 hover:bg-neutral-900/70",
  }[variant];

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex flex-1 flex-col items-center rounded-xl px-3 py-3 text-base font-bold transition active:scale-95 sm:flex-none sm:min-w-[120px]",
        palette,
      )}
    >
      <span>{children}</span>
    </button>
  );
}

function PlayIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="currentColor"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
