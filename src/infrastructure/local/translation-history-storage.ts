import type { TranslationHistoryItem } from "../../domain/phrase/phrase";

const TRANSLATION_HISTORY_KEY = "phrabit-translation-history-v1";
const TRANSLATION_HISTORY_LIMIT = 300;

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function loadLocalTranslationHistory(): TranslationHistoryItem[] {
  if (!isClient()) return [];
  try {
    const raw = window.localStorage.getItem(TRANSLATION_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeTranslationHistoryItem)
      .filter((item): item is TranslationHistoryItem => Boolean(item));
  } catch {
    return [];
  }
}

export function saveLocalTranslationHistory(items: TranslationHistoryItem[]): void {
  if (!isClient()) return;
  window.localStorage.setItem(
    TRANSLATION_HISTORY_KEY,
    JSON.stringify(items.slice(0, TRANSLATION_HISTORY_LIMIT)),
  );
}

export function addLocalTranslationHistoryItem(
  item: TranslationHistoryItem,
): TranslationHistoryItem {
  const current = loadLocalTranslationHistory().filter(
    (historyItem) => historyItem.id !== item.id,
  );
  saveLocalTranslationHistory([item, ...current]);
  return item;
}

export function updateLocalTranslationHistoryItem(
  historyItemId: string,
  updates: Pick<TranslationHistoryItem, "savedPhraseId">,
): TranslationHistoryItem[] {
  const next = loadLocalTranslationHistory().map((item) =>
    item.id === historyItemId ? { ...item, ...updates } : item,
  );
  saveLocalTranslationHistory(next);
  return next;
}

function normalizeTranslationHistoryItem(value: unknown): TranslationHistoryItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<TranslationHistoryItem>;
  const translation = item.translation;
  if (
    typeof item.id !== "string" ||
    (item.source !== "add" && item.source !== "conversation") ||
    typeof item.createdAt !== "string" ||
    !translation ||
    typeof translation !== "object"
  ) {
    return null;
  }

  return {
    id: item.id,
    translation: translation as TranslationHistoryItem["translation"],
    source: item.source,
    createdAt: item.createdAt,
    savedPhraseId:
      typeof item.savedPhraseId === "string" ? item.savedPhraseId : null,
  };
}
