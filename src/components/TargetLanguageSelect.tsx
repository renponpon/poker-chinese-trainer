"use client";

import {
  ACTIVE_TARGET_LANGUAGE_CODES,
  getLanguageLabel,
} from "@/lib/languages";
import type { LanguageCode } from "@/lib/types";
import { cn } from "@/lib/utils";

type TargetLanguageSelectProps = {
  value: LanguageCode;
  onChange: (language: LanguageCode) => void;
  active?: boolean;
  className?: string;
};

export default function TargetLanguageSelect({
  value,
  onChange,
  active = false,
  className,
}: TargetLanguageSelectProps) {
  return (
    <div
      className={cn(
        "relative rounded-xl transition",
        active
          ? "bg-emerald-500 text-neutral-950 shadow-sm shadow-emerald-500/30"
          : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200",
        className,
      )}
    >
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as LanguageCode)}
        aria-label="翻訳先言語"
        className="h-10 w-full cursor-pointer appearance-none rounded-xl bg-transparent px-3 pr-8 text-center text-base font-bold text-inherit outline-none [text-align-last:center]"
      >
        {ACTIVE_TARGET_LANGUAGE_CODES.map((language) => (
          <option
            key={language}
            value={language}
            className="bg-neutral-950 text-neutral-100"
          >
            {getLanguageLabel(language)}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs opacity-70"
      >
        ▼
      </span>
    </div>
  );
}
