import { recordDrillPracticeResult } from "../../application/practice/record-practice-result";
import type { Score, SrsItem } from "../../lib/types";
import { currentDataOwner } from "./account-cache-storage";
import { ensureDeviceBackup } from "./device-backup";
import { createLearningReceipt, LEARNING_DAYS_CHANGED, recoverLearningReceipts, SRS_STORAGE_KEY } from "./learning-days-storage";
import { saveLocalSrsItems } from "./srs-storage";

export function recordLearningPractice(input: { items: SrsItem[]; phraseId: string; score: Score; owner: string; eligible: boolean; reviewedAt?: number }) {
  if (currentDataOwner() !== input.owner) throw new Error("learning_owner_changed");
  ensureDeviceBackup();
  recoverLearningReceipts();
  const reviewedAt = input.reviewedAt ?? Date.now();
  const receipt = input.eligible ? createLearningReceipt(input.owner, reviewedAt) : undefined;
  const result = recordDrillPracticeResult({ ...input, reviewedAt, storage: { saveSrsItems(items) {
    const updated = items.find((item) => item.id === input.phraseId);
    if (updated && receipt) updated.learningReceipt = receipt;
    try { saveLocalSrsItems(items); } catch (error) {
      if (window.localStorage.getItem(SRS_STORAGE_KEY) !== JSON.stringify(items)) throw error;
    }
  } } });
  let learningPending = false;
  try { recoverLearningReceipts(); } catch { learningPending = true; }
  window.dispatchEvent(new Event(LEARNING_DAYS_CHANGED));
  return { ...result, learningPending };
}
