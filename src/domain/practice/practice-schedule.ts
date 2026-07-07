export type PracticeScore = 1 | 2 | 3;

export type PracticeStatus =
  | "new"
  | "learning"
  | "review"
  | "maintenance"
  | "mastered";

export type DrillItem = {
  phraseId: string;
  status: PracticeStatus;
  nextReviewAt: number;
  intervalDays: number;
  easeFactor: number;
  consecutiveGood: number;
  lastScore: PracticeScore | null;
  lastReviewedAt: number | null;
};

export type PracticeResult = {
  score: PracticeScore;
  reviewedAt: number;
};

export type SavedPhrasePracticeRef = {
  phraseId: string;
  isDrillEnabled: boolean;
};

export type DrillItemSyncResult = {
  items: DrillItem[];
  changed: boolean;
};

const DAY_MS = 86_400_000;
const RELEARNING_INTERVAL_DAYS = 10 / 1440;
const MAINTENANCE_STEPS_DAYS = [14, 45, 120];
const MASTERED_AFTER_INTERVAL_DAYS = 180;
const EASY_BONUS = 1.3;

export function createDrillItem(input: {
  phraseId: string;
  now?: number;
}): DrillItem {
  const now = input.now ?? Date.now();
  return {
    phraseId: input.phraseId,
    status: "new",
    nextReviewAt: now,
    intervalDays: 0,
    easeFactor: 2.5,
    consecutiveGood: 0,
    lastScore: null,
    lastReviewedAt: null,
  };
}

export function recordPracticeResult(
  item: DrillItem,
  result: PracticeResult,
): DrillItem {
  let { intervalDays, easeFactor, consecutiveGood, status } = item;
  const { score, reviewedAt } = result;

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
    lastReviewedAt: reviewedAt,
    nextReviewAt: reviewedAt + intervalDays * DAY_MS,
  };
}

export function isDrillItemDue(item: DrillItem, now: number = Date.now()): boolean {
  if (item.status === "mastered") return false;
  return item.status === "new" || item.nextReviewAt <= now;
}

export function syncDrillItems(
  savedPhrases: SavedPhrasePracticeRef[],
  currentItems: DrillItem[],
  now: number = Date.now(),
): DrillItemSyncResult {
  const drillPhraseIds = new Set(
    savedPhrases
      .filter((phrase) => phrase.isDrillEnabled)
      .map((phrase) => phrase.phraseId),
  );
  const existingIds = new Set(currentItems.map((item) => item.phraseId));
  const additions: DrillItem[] = [];

  for (const phrase of savedPhrases) {
    if (phrase.isDrillEnabled && !existingIds.has(phrase.phraseId)) {
      additions.push(createDrillItem({ phraseId: phrase.phraseId, now }));
    }
  }

  const keptItems = currentItems.filter((item) =>
    drillPhraseIds.has(item.phraseId),
  );
  const items = [...keptItems, ...additions];
  const changed =
    additions.length > 0 ||
    keptItems.length !== currentItems.length ||
    items.some((item, index) => item !== currentItems[index]);

  return { items, changed };
}
