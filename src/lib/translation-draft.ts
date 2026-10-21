"use client";

import { useSyncExternalStore } from "react";
import { currentDataOwner, LOCAL_PHRASE_DATA_CHANGED_EVENT } from "@/infrastructure/local/account-cache-storage";
import type { GeneratedPhrase } from "./types";
import type { GenerationMode } from "./generation-mode";
import type { TranslationInputKind } from "./experience-phrase";

export type TranslationDraftResult = GeneratedPhrase & { id: string | null; provider?: string };
export type TranslationDraft = {
  inputText: string;
  reverseTranslation: boolean;
  generationMode: GenerationMode;
  result: TranslationDraftResult | null;
  nuanceText: string;
  drillAdded: boolean;
  requestId: string | null;
  resultExperienceText?: string;
};
const drafts = new Map<string, Partial<Record<TranslationInputKind, TranslationDraft>>>();
const explanations = new Map<string, Promise<TranslationDraftResult>>();
export const TRANSLATION_DRAFT_CHANGED_EVENT = "phrabit-translation-draft-changed";

export function getDraftExplanation(id: string | null) {
  return id ? explanations.get(id) ?? null : null;
}

export function trackDraftExplanation(id: string, task: Promise<TranslationDraftResult>): void {
  explanations.set(id, task);
  void task.finally(() => { if (explanations.get(id) === task) explanations.delete(id); });
}

export function loadTranslationDraft(owner: string, inputKind: TranslationInputKind = "translation"): TranslationDraft | undefined {
  return drafts.get(owner)?.[inputKind];
}

export function saveTranslationDraft(owner: string, draft: TranslationDraft, inputKind: TranslationInputKind = "translation"): void {
  drafts.set(owner, { ...drafts.get(owner), [inputKind]: draft });
}

export function updateDraftResult(owner: string, result: TranslationDraftResult): void {
  for (const inputKind of ["translation", "experience"] as const) {
    const draft = loadTranslationDraft(owner, inputKind);
    if (draft?.requestId === result.id) {
      saveTranslationDraft(owner, { ...draft, result }, inputKind);
      window.dispatchEvent(new Event(TRANSLATION_DRAFT_CHANGED_EVENT));
    }
  }
}

function subscribeOwner(onChange: () => void) {
  window.addEventListener(LOCAL_PHRASE_DATA_CHANGED_EVENT, onChange);
  window.addEventListener("phrabit-account-phrase-data-synced", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(LOCAL_PHRASE_DATA_CHANGED_EVENT, onChange);
    window.removeEventListener("phrabit-account-phrase-data-synced", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useDataOwner(): string {
  return useSyncExternalStore(subscribeOwner, currentDataOwner, () => "guest");
}
