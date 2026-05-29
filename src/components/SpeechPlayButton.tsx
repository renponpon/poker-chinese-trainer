"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SpeechPlayOptions } from "@/lib/speech";
import { stopSpeech } from "@/lib/speech";
import { cn } from "@/lib/utils";

type SpeechPlayButtonProps = {
  play: (options: SpeechPlayOptions) => void;
  onStop?: () => void;
  className?: string;
  playingClassName?: string;
  variant?: "label" | "icon";
  idleLabel?: string;
  disabled?: boolean;
  prefetch?: () => void;
};

export default function SpeechPlayButton({
  play,
  onStop,
  className,
  playingClassName,
  variant = "label",
  idleLabel = "再生",
  disabled = false,
  prefetch,
}: SpeechPlayButtonProps) {
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);

  const stopPlaying = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
  }, []);

  useEffect(() => {
    return () => {
      if (playingRef.current) {
        stopSpeech();
        stopPlaying();
      }
    };
  }, [stopPlaying]);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (disabled) return;

      if (playingRef.current) {
        stopSpeech();
        onStop?.();
        stopPlaying();
        return;
      }

      playingRef.current = true;
      setPlaying(true);

      play({
        onEnd: () => {
          stopPlaying();
        },
      });
    },
    [disabled, onStop, play, stopPlaying],
  );

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        onFocus={prefetch}
        onPointerEnter={prefetch}
        onTouchStart={prefetch}
        disabled={disabled}
        aria-label={playing ? "停止" : idleLabel}
        aria-pressed={playing}
        className={cn(className, playing && playingClassName)}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onFocus={prefetch}
      onPointerEnter={prefetch}
      onTouchStart={prefetch}
      disabled={disabled}
      aria-label={playing ? "停止" : idleLabel}
      aria-pressed={playing}
      className={cn(
        "inline-flex items-center gap-1.5",
        className,
        playing && playingClassName,
      )}
    >
      {playing ? (
        <>
          <PauseIcon className="h-4 w-4 shrink-0" />
          {idleLabel}
        </>
      ) : (
        <>
          <PlayIcon className="h-4 w-4 shrink-0" />
          {idleLabel}
        </>
      )}
    </button>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn("h-6 w-6", className)}
      fill="currentColor"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn("h-6 w-6", className)}
      fill="currentColor"
    >
      <rect x="6" y="5" width="4.5" height="14" rx="1.2" />
      <rect x="13.5" y="5" width="4.5" height="14" rx="1.2" />
    </svg>
  );
}
