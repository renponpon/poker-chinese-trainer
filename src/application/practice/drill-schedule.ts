import {
  isDrillItemDue,
  syncDrillItems,
} from "../../domain/practice/practice-schedule";
import type { Phrase, SrsItem, SrsStatus } from "../../lib/types";
import { learningDayAt, validTimeZone } from "../../domain/practice/learning-days";
import { drillItemToSrsItem, srsItemToDrillItem } from "./srs-item-adapter";

type PracticePhraseRef = Pick<Phrase, "id" | "shouldDrill">;

export type SyncDrillScheduleStorage = {
  saveSrsItems: (items: SrsItem[]) => void;
};

export type SyncDrillScheduleResult = {
  items: SrsItem[];
  changed: boolean;
};

export function syncDrillSchedule(input: {
  phrases: PracticePhraseRef[];
  items: SrsItem[];
  storage?: SyncDrillScheduleStorage;
  now?: number;
}): SyncDrillScheduleResult {
  const synced = syncDrillItems(
    input.phrases.map((phrase) => ({
      phraseId: phrase.id,
      isDrillEnabled: phrase.shouldDrill,
    })),
    input.items.map(srsItemToDrillItem),
    input.now,
  );

  if (!synced.changed) {
    return {
      items: input.items,
      changed: false,
    };
  }

  const existing = new Map(input.items.map((item) => [item.id, item]));
  const items = synced.items.map((item) => existing.get(item.phraseId) ?? drillItemToSrsItem(item));
  input.storage?.saveSrsItems(items);

  return {
    items,
    changed: true,
  };
}

export function selectDueDrillPhrases(input: {
  phrases: Phrase[];
  items: SrsItem[];
  now?: number;
  timeZone?: string;
}): Phrase[] {
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const due: Phrase[] = [];

  for (const phrase of input.phrases) {
    if (!phrase.shouldDrill) continue;
    const item = itemById.get(phrase.id);
    if (!item || isDrillItemDue(srsItemToDrillItem(item), input.now)) {
      due.push(phrase);
    }
  }

  return orderDrillPhrases({ ...input, phrases: due });
}

export function orderDrillPhrases(input: {
  phrases: Phrase[];
  items: SrsItem[];
  now?: number;
  timeZone?: string;
}): Phrase[] {
  const now = input.now ?? Date.now();
  const timeZone = validTimeZone(input.timeZone) ? input.timeZone : "UTC";
  const today = learningDayAt(now, timeZone);
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const rankById = new Map(input.phrases.map((phrase) => {
    const item = itemById.get(phrase.id);
    const reviewedAt = item?.lastReviewedAt;
    const earlierDay = typeof reviewedAt === "number" && Number.isFinite(reviewedAt)
      && reviewedAt <= now && learningDayAt(reviewedAt, timeZone) < today;
    const reviewRank = earlierDay && item?.lastScore === 1 ? 0 : earlierDay && item?.lastScore === 2 ? 1 : 2;
    return [phrase.id, {
      priority: phrase.drillPriority ? 0 : 1,
      reviewRank,
      reviewedAt: reviewRank < 2 ? reviewedAt ?? 0 : 0,
      dueAt: item?.nextReviewAt ?? 0,
    }];
  }));
  return [...input.phrases].sort((left, right) => {
    const leftRank = rankById.get(left.id)!;
    const rightRank = rankById.get(right.id)!;
    return leftRank.priority - rightRank.priority
      || leftRank.reviewRank - rightRank.reviewRank
      || rightRank.reviewedAt - leftRank.reviewedAt
      || leftRank.dueAt - rightRank.dueAt
      || left.createdAt.localeCompare(right.createdAt)
      || left.id.localeCompare(right.id);
  });
}

export type StatusCounts = Record<SrsStatus, number>;

export function countDrillStatuses(input: {
  phrases: PracticePhraseRef[];
  items: SrsItem[];
}): StatusCounts {
  const counts: StatusCounts = {
    new: 0,
    learning: 0,
    review: 0,
    maintenance: 0,
    mastered: 0,
  };
  const itemById = new Map(input.items.map((item) => [item.id, item]));

  for (const phrase of input.phrases) {
    if (!phrase.shouldDrill) continue;
    const item = itemById.get(phrase.id);
    if (!item || item.status === "new") {
      counts.new += 1;
    } else {
      counts[item.status] += 1;
    }
  }

  return counts;
}
