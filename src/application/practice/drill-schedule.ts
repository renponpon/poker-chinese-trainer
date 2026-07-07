import {
  isDrillItemDue,
  syncDrillItems,
} from "../../domain/practice/practice-schedule";
import type { Phrase, SrsItem, SrsStatus } from "../../lib/types";
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

  const items = synced.items.map(drillItemToSrsItem);
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

  return due;
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
