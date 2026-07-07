import type { DrillItem } from "../../domain/practice/practice-schedule";
import type { SrsItem } from "../../lib/types";

export function srsItemToDrillItem(item: SrsItem): DrillItem {
  return {
    phraseId: item.id,
    status: item.status,
    nextReviewAt: item.nextReviewAt,
    intervalDays: item.intervalDays,
    easeFactor: item.easeFactor,
    consecutiveGood: item.consecutiveGood,
    lastScore: item.lastScore,
    lastReviewedAt: item.lastReviewedAt,
  };
}

export function drillItemToSrsItem(item: DrillItem): SrsItem {
  return {
    id: item.phraseId,
    status: item.status,
    nextReviewAt: item.nextReviewAt,
    intervalDays: item.intervalDays,
    easeFactor: item.easeFactor,
    consecutiveGood: item.consecutiveGood,
    lastScore: item.lastScore,
    lastReviewedAt: item.lastReviewedAt,
  };
}
