"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import SpeechPlayButton from "@/components/SpeechPlayButton";
import { formatExplanationForReading } from "@/lib/explanation-format";
import { LANGUAGE_CONFIGS } from "@/lib/languages";
import { playSpeechForLang, prefetchSpeechForLang } from "@/lib/speech";
import type { SpeechPlayOptions } from "@/lib/speech";
import type { Phrase, Score } from "@/lib/types";

type FlashcardProps = {
  phrase: Phrase;
  onScore: (score: Score) => void;
  explanationPending?: boolean;
  resetKey?: number;
};

const REVEAL_FADE_MS = 200;

export default function Flashcard({
  phrase,
  onScore,
  explanationPending = false,
  resetKey = 0,
}: FlashcardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [skipFlipTransition, setSkipFlipTransition] = useState(false);
  const revealTimeoutRef = useRef<number | null>(null);
  const fadeInFrameRef = useRef<number | null>(null);
  const isInitialPhraseRef = useRef(true);
  const promptText = phrase.sourceText || phrase.japanese;
  const answerText = phrase.targetText || phrase.chinese;
  const answerLanguage = phrase.targetLanguage ?? "zh";
  const answerSpeechCode = LANGUAGE_CONFIGS[answerLanguage].speechSynthesisCode;
  const reading = phrase.reading || phrase.pinyin;

  const clearRevealTimeout = useCallback(() => {
    if (revealTimeoutRef.current) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
  }, []);

  const clearFadeInFrame = useCallback(() => {
    if (fadeInFrameRef.current) {
      cancelAnimationFrame(fadeInFrameRef.current);
      fadeInFrameRef.current = null;
    }
  }, []);

  const finishAdvance = useCallback(() => {
    clearRevealTimeout();
    setSkipFlipTransition(false);
    setIsAdvancing(false);
  }, [clearRevealTimeout]);

  const revealNextCard = useCallback(() => {
    clearFadeInFrame();
    clearRevealTimeout();

    fadeInFrameRef.current = requestAnimationFrame(() => {
      fadeInFrameRef.current = requestAnimationFrame(() => {
        fadeInFrameRef.current = null;
        setIsHidden(false);
        revealTimeoutRef.current = window.setTimeout(() => {
          revealTimeoutRef.current = null;
          finishAdvance();
        }, REVEAL_FADE_MS);
      });
    });
  }, [clearFadeInFrame, clearRevealTimeout, finishAdvance]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
    setIsFlipped(false);

    if (isInitialPhraseRef.current) {
      isInitialPhraseRef.current = false;
      setIsAdvancing(false);
      setSkipFlipTransition(false);
      setIsHidden(false);
      return;
    }

    setSkipFlipTransition(true);
    setIsHidden(true);
    revealNextCard();
    });
    return () => {
      cancelled = true;
    };
  }, [phrase.id, resetKey, revealNextCard]);

  useEffect(() => {
    return () => {
      clearRevealTimeout();
      clearFadeInFrame();
    };
  }, [clearRevealTimeout, clearFadeInFrame]);

  useEffect(() => {
    if (phrase.audioUrl) return;
    prefetchSpeechForLang(answerText, answerSpeechCode);
  }, [answerSpeechCode, answerText, phrase.audioUrl]);

  const handleFlip = useCallback(() => {
    if (isAdvancing) return;
    if (!isFlipped) {
      setIsFlipped(true);
      if (phrase.audioUrl) {
        const audio = new Audio(phrase.audioUrl);
        audio.play().catch(() =>
          playSpeechForLang(answerText, answerSpeechCode),
        );
      } else {
        playSpeechForLang(answerText, answerSpeechCode);
      }
    } else {
      setIsFlipped(false);
    }
  }, [answerSpeechCode, answerText, isAdvancing, isFlipped, phrase.audioUrl]);

  const handleScore = useCallback(
    (score: Score) => {
      if (isAdvancing) return;

      if (!isFlipped) {
        onScore(score);
        return;
      }

      setIsAdvancing(true);
      setSkipFlipTransition(true);
      setIsFlipped(false);
      setIsHidden(true);

      fadeInFrameRef.current = requestAnimationFrame(() => {
        fadeInFrameRef.current = requestAnimationFrame(() => {
          fadeInFrameRef.current = null;
          onScore(score);
        });
      });
    },
    [isAdvancing, isFlipped, onScore],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isAdvancing) return;
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
  }, [handleFlip, handleScore, isAdvancing, isFlipped]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playSpeech = useCallback(
    (options: SpeechPlayOptions) => {
      if (phrase.audioUrl) {
        const audio = new Audio(phrase.audioUrl);
        audioRef.current = audio;
        audio.onended = () => {
          audioRef.current = null;
          options.onEnd?.();
        };
        audio.onerror = () => {
          audioRef.current = null;
          playSpeechForLang(
            answerText,
            answerSpeechCode,
            options,
          );
        };
        audio.play().catch(() => {
          audioRef.current = null;
          playSpeechForLang(
            answerText,
            answerSpeechCode,
            options,
          );
        });
        return;
      }
      playSpeechForLang(
        answerText,
        answerSpeechCode,
        options,
      );
    },
    [answerSpeechCode, answerText, phrase.audioUrl],
  );

  const prefetchSpeech = useCallback(() => {
    if (phrase.audioUrl) return;
    prefetchSpeechForLang(answerText, answerSpeechCode);
  }, [answerSpeechCode, answerText, phrase.audioUrl]);

  const stopAudio = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current = null;
  }, []);

  const cardMotionClass = skipFlipTransition
    ? "transition-none"
    : "transition-transform duration-700 ease-out";

  const cardVisibilityClass = isHidden
    ? "pointer-events-none invisible opacity-0"
    : "visible opacity-100 transition-opacity duration-200 ease-out";

  return (
    <div className="flex h-full w-full flex-col items-center overscroll-none">
      <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-[28px] bg-neutral-900">
        <div
          className={cn(
            "relative h-full w-full cursor-pointer preserve-3d perspective-1000",
            cardMotionClass,
            cardVisibilityClass,
            isFlipped ? "rotate-y-180" : "",
            isAdvancing && "pointer-events-none",
          )}
          onClick={handleFlip}
        >
          <div className="absolute inset-0 flex touch-none flex-col items-center justify-center rounded-[28px] bg-neutral-900 p-5 backface-hidden sm:p-6">
            {phrase.sourceLanguage === "zh" && reading && (
              <div className="mb-3 w-full text-lg tracking-wide [overflow-wrap:anywhere] text-neutral-400">
                {reading}
              </div>
            )}
            <div className="w-full px-1 text-center text-[32px] font-semibold leading-relaxed [overflow-wrap:anywhere] text-neutral-100 sm:text-4xl">
              {promptText}
            </div>
            <div className="mt-6 flex items-center gap-2 text-base text-neutral-500">
              <span>タップして確認</span>
            </div>
          </div>

          <div className="absolute inset-0 flex flex-col rounded-[28px] bg-neutral-900 p-4 backface-hidden rotate-y-180 sm:p-5">
            <SpeechPlayButton
              play={playSpeech}
              onStop={stopAudio}
              prefetch={prefetchSpeech}
              variant="icon"
              className="absolute right-4 top-4 z-10 flex h-10 w-10 touch-none items-center justify-center text-neutral-300 hover:text-emerald-300"
              playingClassName="text-emerald-300"
            />
            <div className="w-full min-w-0 shrink-0 touch-none px-12 text-center">
              {reading && (
                <div className="text-lg tracking-wide [overflow-wrap:anywhere] text-neutral-400 sm:text-xl">
                  {reading}
                </div>
              )}
              <div className="mt-2 w-full px-1 text-center text-[34px] font-bold leading-snug [overflow-wrap:anywhere] text-white sm:text-4xl">
                {answerText}
              </div>
              {phrase.sourceLanguage === "zh" && (
                <div className="mt-3 text-xl font-semibold [overflow-wrap:anywhere] text-emerald-200">
                  {phrase.sourceText}
                </div>
              )}
            </div>

            {phrase.explanation ? (
              <div className="mt-4 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain whitespace-pre-wrap px-1 pb-2 text-left text-base leading-relaxed text-neutral-200">
                {formatExplanationForReading(phrase.explanation)}
              </div>
            ) : explanationPending ? (
              <div className="mt-4 px-1 text-sm text-neutral-500">
                解説を作成中...
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-x-0 bottom-[88px] z-30 w-full touch-none bg-neutral-950/95 px-5 pb-3 pt-2 backdrop-blur transition-all duration-300",
          isFlipped && !isAdvancing
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
