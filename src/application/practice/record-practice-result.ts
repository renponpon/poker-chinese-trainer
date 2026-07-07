import {
  recordPracticeResult,
} from "../../domain/practice/practice-schedule";
import type { Score, SrsItem } from "../../lib/types";
import { drillItemToSrsItem, srsItemToDrillItem } from "./srs-item-adapter";

export type RecordDrillPracticeStorage = {
  saveSrsItems: (items: SrsItem[]) => void;
};

export type RecordDrillPracticeInput = {
  items: SrsItem[];
  phraseId: string;
  score: Score;
  storage: RecordDrillPracticeStorage;
  reviewedAt?: number;
};

export type RecordDrillPracticeResult = {
  items: SrsItem[];
  updatedItem: SrsItem | null;
};

export function recordDrillPracticeResult(
  input: RecordDrillPracticeInput,
): RecordDrillPracticeResult {
  const index = input.items.findIndex((item) => item.id === input.phraseId);

  if (index < 0) {
    input.storage.saveSrsItems(input.items);
    return {
      items: input.items,
      updatedItem: null,
    };
  }

  const updatedItem = drillItemToSrsItem(
    recordPracticeResult(srsItemToDrillItem(input.items[index]), {
      score: input.score,
      reviewedAt: input.reviewedAt ?? Date.now(),
    }),
  );
  const items = [...input.items];
  items[index] = updatedItem;
  input.storage.saveSrsItems(items);

  return {
    items,
    updatedItem,
  };
}
