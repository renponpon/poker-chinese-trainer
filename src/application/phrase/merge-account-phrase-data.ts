import type { Phrase, SrsItem } from "../../lib/types";
import type { SavedPhraseSnapshot } from "./load-saved-phrases";

export function mergeAccountPhraseData(
  local: SavedPhraseSnapshot,
  cloud: SavedPhraseSnapshot,
): SavedPhraseSnapshot {
  const phraseById = new Map(cloud.phrases.map((phrase) => [phrase.id, phrase]));
  for (const phrase of local.phrases) {
    const existing = phraseById.get(phrase.id);
    phraseById.set(phrase.id, existing ? mergePhrase(phrase, existing) : phrase);
  }

  const srsById = new Map(cloud.srsItems.map((item) => [item.id, item]));
  for (const item of local.srsItems) {
    const existing = srsById.get(item.id);
    srsById.set(item.id, existing ? newerSrsItem(item, existing) : item);
  }

  const phrases = [...phraseById.values()]
    .map((phrase) => ({
      ...phrase,
      shouldDrill: phrase.shouldDrill || srsById.has(phrase.id),
    }))
    .sort((left, right) => toTime(right.createdAt) - toTime(left.createdAt));
  const drillPhraseIds = new Set(
    phrases.filter((phrase) => phrase.shouldDrill).map((phrase) => phrase.id),
  );

  return {
    phrases,
    srsItems: [...srsById.values()].filter((item) => drillPhraseIds.has(item.id)),
  };
}

function mergePhrase(local: Phrase, cloud: Phrase): Phrase {
  return {
    ...cloud,
    japanese: longerText(local.japanese, cloud.japanese),
    chinese: longerText(local.chinese, cloud.chinese),
    pinyin: longerText(local.pinyin, cloud.pinyin),
    sourceText: longerText(local.sourceText, cloud.sourceText),
    targetText: longerText(local.targetText, cloud.targetText),
    reading: longerText(local.reading, cloud.reading),
    explanation: longerText(local.explanation, cloud.explanation),
    audioUrl: cloud.audioUrl ?? local.audioUrl,
    categoryId: cloud.categoryId ?? local.categoryId,
    shouldDrill: local.shouldDrill || cloud.shouldDrill,
    usedAt: laterIso(local.usedAt, cloud.usedAt),
  };
}

function newerSrsItem(local: SrsItem, cloud: SrsItem): SrsItem {
  const localRank = [
    local.lastReviewedAt ?? -1,
    local.nextReviewAt,
    local.intervalDays,
    local.consecutiveGood,
  ];
  const cloudRank = [
    cloud.lastReviewedAt ?? -1,
    cloud.nextReviewAt,
    cloud.intervalDays,
    cloud.consecutiveGood,
  ];

  for (let index = 0; index < localRank.length; index += 1) {
    if (localRank[index] === cloudRank[index]) continue;
    return localRank[index] > cloudRank[index] ? local : cloud;
  }
  return cloud;
}

function longerText(local: string, cloud: string): string {
  return local.trim().length > cloud.trim().length ? local : cloud;
}

function laterIso(local: string | null, cloud: string | null): string | null {
  if (!local) return cloud;
  if (!cloud) return local;
  return toTime(local) > toTime(cloud) ? local : cloud;
}

function toTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
