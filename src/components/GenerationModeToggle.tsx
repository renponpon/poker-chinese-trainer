"use client";

import {
  cycleGenerationMode,
  getGenerationModeLabel,
  getGenerationModeTitle,
  type GenerationMode,
} from "@/lib/generation-mode";

type GenerationModeToggleProps = {
  value: GenerationMode;
  onChange: (mode: GenerationMode) => void;
  className?: string;
};

export default function GenerationModeToggle({
  value,
  onChange,
  className = "",
}: GenerationModeToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(cycleGenerationMode(value))}
      aria-label={`翻訳モード: ${getGenerationModeLabel(value)}。タップで切り替え`}
      title={getGenerationModeTitle(value)}
      className={`shrink-0 rounded-full bg-neutral-900 px-4 py-2 text-sm font-bold text-neutral-200 transition hover:bg-neutral-800 ${className}`}
    >
      {getGenerationModeLabel(value)}
    </button>
  );
}
