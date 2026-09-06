"use client";

import { useSyncExternalStore } from "react";
import {
  loadLearningLanguage,
  saveLearningLanguage,
  subscribeLearningLanguage,
} from "@/infrastructure/local/learning-language-storage";

const getServerSnapshot = () => null;

export function useLearningLanguage() {
  const language = useSyncExternalStore(
    subscribeLearningLanguage,
    loadLearningLanguage,
    getServerSnapshot,
  );
  return {
    targetLanguage: language ?? "zh",
    setTargetLanguage: saveLearningLanguage,
    languageReady: language !== null,
  };
}
