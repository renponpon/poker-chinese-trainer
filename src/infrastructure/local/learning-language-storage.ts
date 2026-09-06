import { ACTIVE_TARGET_LANGUAGE_CODES, isLanguageCode } from "../../lib/languages";
import type { LanguageCode } from "../../lib/types";
import { ensureDeviceBackup } from "./device-backup";

const STORAGE_KEY = "phrabit-learning-language-v1";
const CHANGED_EVENT = "phrabit:learning-language-changed";
const DEFAULT_LANGUAGE: LanguageCode = "zh";
let temporaryLanguage: LanguageCode | null = null;

export function loadLearningLanguage(): LanguageCode {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  if (temporaryLanguage) return temporaryLanguage;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLanguageCode(stored) && ACTIVE_TARGET_LANGUAGE_CODES.includes(stored)
      ? stored
      : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function saveLearningLanguage(language: LanguageCode): void {
  if (typeof window === "undefined" || !ACTIVE_TARGET_LANGUAGE_CODES.includes(language)) return;
  ensureDeviceBackup();
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
    temporaryLanguage = null;
  } catch {
    temporaryLanguage = language;
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function subscribeLearningLanguage(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    temporaryLanguage = null;
    onChange();
  };
  window.addEventListener(CHANGED_EVENT, onChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}
