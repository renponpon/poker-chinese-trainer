import type { Phrase, Score, SrsItem, SrsStatus } from "./types";

const STORAGE_KEY = "poker-chinese-srs-v1";
const DAY_MS = 86_400_000;

const RELEARNING_INTERVAL_DAYS = 10 / 1440; // 10分。失敗直後は短期記憶へ戻す。
const MAINTENANCE_STEPS_DAYS = [14, 45, 120];
const MASTERED_AFTER_INTERVAL_DAYS = 180;

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

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function loadSrsData(): SrsItem[] {
  if (!isClient()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SrsItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveSrsData(items: SrsItem[]): void {
  if (!isClient()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function ensureSrsItems(phrases: Phrase[], items: SrsItem[]): SrsItem[] {
  const drillPhraseIds = new Set(
    phrases.filter((phrase) => phrase.shouldDrill).map((phrase) => phrase.id),
  );
  const existingIds = new Set(items.map((it) => it.id));
  const additions: SrsItem[] = [];

  for (const p of phrases) {
    if (p.shouldDrill && !existingIds.has(p.id)) {
      additions.push(makeNewItem(p.id));
    }
  }

  const next = [
    ...items.filter((item) => drillPhraseIds.has(item.id)),
    ...additions,
  ];
  if (
    additions.length === 0 &&
    next.length === items.length &&
    next.every((item, index) => item === items[index])
  ) {
    return items;
  }
  saveSrsData(next);
  return next;
}

export function makeNewItem(id: string): SrsItem {
  return {
    id,
    status: "new",
    nextReviewAt: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    consecutiveGood: 0,
    lastScore: null,
    lastReviewedAt: null,
  };
}

/**
 * Anki SM-2 を瞬間作文向けに調整した採点ロジック。
 * Anki の SM-2 系（Ease Factor と間隔増加）をベースに、瞬間作文向けに短期再学習を強めた設定。
 * Duolingo 的な「間違えた問題をすぐ戻す」挙動も入れ、Bad は同セッション再出題 + 10分後復習にする。
 */
export function applyScore(item: SrsItem, score: Score, now: number = Date.now()): SrsItem {
  let { intervalDays, easeFactor, consecutiveGood, status } = item;

  if (score === 1) {
    intervalDays = RELEARNING_INTERVAL_DAYS;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
    consecutiveGood = 0;
    status = "learning";
  } else if (score === 2) {
    if (intervalDays <= 0) intervalDays = 1;
    else if (intervalDays < 1) intervalDays = 1;
    else if (intervalDays === 1) intervalDays = 3;
    else intervalDays = Math.round(intervalDays * easeFactor);
    consecutiveGood += 1;
  } else {
    const EASY_BONUS = 1.3;
    if (intervalDays <= 0) intervalDays = 3;
    else if (intervalDays < 1) intervalDays = 3;
    else if (intervalDays === 1) intervalDays = 4;
    else intervalDays = Math.round(intervalDays * easeFactor * EASY_BONUS);
    easeFactor = Math.min(3.5, easeFactor + 0.15);
    consecutiveGood += 1;
  }

  if (status !== "mastered" && status !== "maintenance") {
    if (consecutiveGood >= 3 && score === 3) {
      status = "maintenance";
      intervalDays = MAINTENANCE_STEPS_DAYS[0];
    } else {
      status = intervalDays >= 3 ? "review" : "learning";
    }
  } else if (status === "maintenance") {
    if (score === 1) {
      status = "learning";
      intervalDays = 1;
    } else {
      const idx = MAINTENANCE_STEPS_DAYS.indexOf(intervalDays);
      const nextIdx = idx >= 0 ? idx + 1 : MAINTENANCE_STEPS_DAYS.length - 1;
      if (nextIdx >= MAINTENANCE_STEPS_DAYS.length) {
        intervalDays = MASTERED_AFTER_INTERVAL_DAYS;
        status = "mastered";
      } else {
        intervalDays = MAINTENANCE_STEPS_DAYS[nextIdx];
      }
    }
  }

  return {
    ...item,
    status,
    intervalDays,
    easeFactor,
    consecutiveGood,
    lastScore: score,
    lastReviewedAt: now,
    nextReviewAt: now + intervalDays * DAY_MS,
  };
}

export function getDuePhrases(phrases: Phrase[], items: SrsItem[], now: number = Date.now()): Phrase[] {
  const itemById = new Map(items.map((it) => [it.id, it]));
  const due: Phrase[] = [];

  for (const p of phrases) {
    if (!p.shouldDrill) continue;
    const it = itemById.get(p.id);
    if (!it) {
      due.push(p);
      continue;
    }
    if (it.status === "mastered") continue;
    if (it.status === "new" || it.nextReviewAt <= now) {
      due.push(p);
    }
  }

  return due;
}

export type StatusCounts = Record<SrsStatus, number>;

export function getStatusCounts(phrases: Phrase[], items: SrsItem[]): StatusCounts {
  const counts: StatusCounts = {
    new: 0,
    learning: 0,
    review: 0,
    maintenance: 0,
    mastered: 0,
  };
  const itemById = new Map(items.map((it) => [it.id, it]));
  for (const p of phrases) {
    if (!p.shouldDrill) continue;
    const it = itemById.get(p.id);
    if (!it || it.status === "new") counts.new += 1;
    else counts[it.status] += 1;
  }
  return counts;
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
