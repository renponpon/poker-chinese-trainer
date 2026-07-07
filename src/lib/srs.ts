import {
  createDrillItem,
  recordPracticeResult,
} from "@/domain/practice/practice-schedule";
import {
  countDrillStatuses,
  selectDueDrillPhrases,
  syncDrillSchedule,
  type StatusCounts,
} from "@/application/practice/drill-schedule";
import {
  drillItemToSrsItem,
  srsItemToDrillItem,
} from "@/application/practice/srs-item-adapter";
import {
  loadLocalSrsItems,
  saveLocalSrsItems,
} from "@/infrastructure/local/srs-storage";
import type { Phrase, Score, SrsItem, SrsStatus } from "./types";

export const SRS_STATUS_GUIDE: Array<{
  status: SrsStatus;
  label: string;
  definition: string;
  cycle: string;
}> = [
  {
    status: "new",
    label: "新規",
    definition: "ドリルでの評価が0回のフレーズ。",
    cycle: "次のドリルに出ます。",
  },
  {
    status: "learning",
    label: "学習中",
    definition: "直近で失敗、または成功回数が3回未満で復習間隔が3日未満のフレーズ。",
    cycle: "失敗なら10分後、成功なら1〜3日後に出ます。",
  },
  {
    status: "review",
    label: "復習中",
    definition: "成功が続き、次の復習間隔が3日以上に伸びたフレーズ。",
    cycle: "成功するたびに3日、約1週間、2週間超へ間隔が伸びます。",
  },
  {
    status: "maintenance",
    label: "メンテ",
    definition: "Perfectを含む成功が3回以上続いたフレーズ。",
    cycle: "14日後、45日後、120日後に確認します。失敗すると学習中へ戻ります。",
  },
  {
    status: "mastered",
    label: "習得",
    definition: "14日、45日、120日のメンテ確認をすべて成功したフレーズ。",
    cycle: "通常のドリルには出ません。必要なときはライブラリで見返します。",
  },
];

export function loadSrsData(): SrsItem[] {
  return loadLocalSrsItems();
}

export function saveSrsData(items: SrsItem[]): void {
  saveLocalSrsItems(items);
}

export function ensureSrsItems(phrases: Phrase[], items: SrsItem[]): SrsItem[] {
  return syncDrillSchedule({
    phrases,
    items,
    storage: { saveSrsItems: saveSrsData },
  }).items;
}

export function makeNewItem(id: string): SrsItem {
  return drillItemToSrsItem(createDrillItem({ phraseId: id }));
}

/**
 * Anki SM-2 を瞬間作文向けに調整した採点ロジック。
 * Anki の SM-2 系（Ease Factor と間隔増加）をベースに、瞬間作文向けに短期再学習を強めた設定。
 * Duolingo 的な「間違えた問題をすぐ戻す」挙動も入れ、Bad は同セッション再出題 + 10分後復習にする。
 */
export function applyScore(item: SrsItem, score: Score, now: number = Date.now()): SrsItem {
  return drillItemToSrsItem(
    recordPracticeResult(srsItemToDrillItem(item), {
      score,
      reviewedAt: now,
    }),
  );
}

export function getDuePhrases(phrases: Phrase[], items: SrsItem[], now: number = Date.now()): Phrase[] {
  return selectDueDrillPhrases({ phrases, items, now });
}

export function getStatusCounts(phrases: Phrase[], items: SrsItem[]): StatusCounts {
  return countDrillStatuses({ phrases, items });
}

export function statusLabel(status: SrsStatus): string {
  switch (status) {
    case "new":
      return "新規";
    case "learning":
      return "学習中";
    case "review":
      return "復習中";
    case "maintenance":
      return "メンテ";
    case "mastered":
      return "習得";
  }
}

