import type { Phrase, PhraseCategory } from "./types";
import { createId } from "./id";
import { parseDirection } from "./languages";
import { loadSrsData, saveSrsData } from "./srs";
import { STARTER_PHRASES } from "./starter-phrases";

const PHRASES_KEY = "poker-chinese-local-phrases-v1";
const CATEGORIES_KEY = "poker-chinese-phrase-categories-v1";
const NICKNAME_KEY = "poker-chinese-nickname-v1";
const OWNER_KEY = "poker-chinese-owner-key-v1";
const STARTER_SEED_KEY = "poker-chinese-starter-phrases-v1";

export const DEFAULT_CATEGORIES: PhraseCategory[] = [
  { id: "poker-table", label: "ポーカー卓", builtIn: true, createdAt: "" },
  { id: "floor", label: "フロア/手続き", builtIn: true, createdAt: "" },
  { id: "restaurant", label: "レストラン", builtIn: true, createdAt: "" },
  { id: "transport", label: "移動", builtIn: true, createdAt: "" },
  { id: "hotel", label: "ホテル", builtIn: true, createdAt: "" },
  { id: "shopping", label: "買い物", builtIn: true, createdAt: "" },
  { id: "work", label: "仕事", builtIn: true, createdAt: "" },
  { id: "hospital", label: "病院", builtIn: true, createdAt: "" },
  { id: "other", label: "その他", builtIn: true, createdAt: "" },
];

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function loadLocalPhrases(): Phrase[] {
  if (!isClient()) return [];
  try {
    const raw = window.localStorage.getItem(PHRASES_KEY);
    if (!raw) {
      const starters = STARTER_PHRASES.map((phrase) => normalizePhrase(phrase));
      saveLocalPhrases(starters);
      window.localStorage.setItem(STARTER_SEED_KEY, "1");
      return starters;
    }
    const parsed = JSON.parse(raw) as Partial<Phrase>[];
    if (!Array.isArray(parsed)) return [];
    let normalized = parsed
      .filter((phrase) => phrase.id && phrase.japanese !== undefined && phrase.chinese !== undefined)
      .map(normalizePhrase);
    if (window.localStorage.getItem(STARTER_SEED_KEY) !== "1") {
      normalized = mergeStarterPhrases(normalized);
      window.localStorage.setItem(STARTER_SEED_KEY, "1");
    } else {
      normalized = patchStarterExplanations(normalized);
    }
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      saveLocalPhrases(normalized);
    }
    return normalized;
  } catch {
    return [];
  }
}

function patchStarterExplanations(current: Phrase[]): Phrase[] {
  const starterById = new Map(STARTER_PHRASES.map((phrase) => [phrase.id, phrase]));
  let changed = false;
  const patched = current.map((phrase) => {
    const starter = starterById.get(phrase.id);
    if (!starter || phrase.explanation?.trim()) return phrase;
    changed = true;
    return normalizePhrase({ ...phrase, explanation: starter.explanation });
  });
  return changed ? patched : current;
}

function mergeStarterPhrases(current: Phrase[]): Phrase[] {
  const existingIds = new Set(current.map((phrase) => phrase.id));
  const missingStarters = STARTER_PHRASES
    .filter((phrase) => !existingIds.has(phrase.id))
    .map((phrase) => normalizePhrase(phrase));
  const withMissing = missingStarters.length
    ? [...missingStarters, ...current]
    : current;
  return patchStarterExplanations(withMissing);
}

export function saveLocalPhrases(phrases: Phrase[]): void {
  if (!isClient()) return;
  window.localStorage.setItem(PHRASES_KEY, JSON.stringify(phrases));
}

export function addLocalPhrase(
  input: Partial<Phrase> & { id?: string; createdAt?: string },
): Phrase {
  const phrase = normalizePhrase({
    ...input,
    id: input.id ?? createId(),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
  const current = loadLocalPhrases();
  saveLocalPhrases([phrase, ...current]);
  return phrase;
}

export function updateLocalPhrase(id: string, updates: Partial<Phrase>): Phrase[] {
  const next = loadLocalPhrases().map((phrase) =>
    phrase.id === id ? normalizePhrase({ ...phrase, ...updates }) : phrase,
  );
  saveLocalPhrases(next);
  return next;
}

export function deleteLocalPhrase(id: string): void {
  const current = loadLocalPhrases();
  saveLocalPhrases(current.filter((phrase) => phrase.id !== id));
}

export function deleteLocalPhraseAndSrs(id: string): void {
  deleteLocalPhrase(id);
  saveSrsData(loadSrsData().filter((item) => item.id !== id));
}

export function loadPhraseCategories(): PhraseCategory[] {
  if (!isClient()) return DEFAULT_CATEGORIES;
  try {
    const raw = window.localStorage.getItem(CATEGORIES_KEY);
    if (!raw) return DEFAULT_CATEGORIES;
    const parsed = JSON.parse(raw) as PhraseCategory[];
    if (!Array.isArray(parsed)) return DEFAULT_CATEGORIES;
    const custom = parsed.filter(
      (category) => category.id && !DEFAULT_CATEGORIES.some((base) => base.id === category.id),
    );
    return [...DEFAULT_CATEGORIES, ...custom];
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

export function savePhraseCategories(categories: PhraseCategory[]): void {
  if (!isClient()) return;
  window.localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

export function loadNickname(): string {
  if (!isClient()) return "";
  return window.localStorage.getItem(NICKNAME_KEY) ?? "";
}

export function saveNickname(nickname: string): void {
  if (!isClient()) return;
  window.localStorage.setItem(NICKNAME_KEY, nickname.trim());
}

export function loadOwnerKey(): string {
  if (!isClient()) return "";
  return window.localStorage.getItem(OWNER_KEY) ?? "";
}

export function saveOwnerKey(ownerKey: string): void {
  if (!isClient()) return;
  window.localStorage.setItem(OWNER_KEY, ownerKey.trim());
}

function normalizePhrase(input: Partial<Phrase>): Phrase {
  const direction = input.direction ?? "ja-to-zh";
  const { sourceLanguage, targetLanguage } = parseDirection(direction);
  const sourceText =
    input.sourceText ??
    (sourceLanguage === "ja" ? input.japanese : input.chinese) ??
    "";
  const targetText =
    input.targetText ??
    (targetLanguage === "ja" ? input.japanese : input.chinese) ??
    "";
  const reading = input.reading ?? input.pinyin ?? "";
  const categoryId =
    !input.categoryId || input.categoryId === "uncategorized"
      ? null
      : input.categoryId;
  return {
    id: input.id ?? createId(),
    japanese: input.japanese ?? "",
    chinese: input.chinese ?? "",
    pinyin: input.pinyin ?? "",
    sourceLanguage: input.sourceLanguage ?? sourceLanguage,
    targetLanguage: input.targetLanguage ?? targetLanguage,
    sourceText,
    targetText,
    reading,
    readingType: input.readingType ?? (targetLanguage === "zh" || sourceLanguage === "zh" ? "pinyin" : "none"),
    explanation: input.explanation ?? "",
    audioUrl: input.audioUrl ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
    direction,
    categoryId,
    shouldDrill: input.shouldDrill ?? direction === "ja-to-zh",
    source: input.source ?? "manual",
    usedAt: input.usedAt ?? null,
  };
}
