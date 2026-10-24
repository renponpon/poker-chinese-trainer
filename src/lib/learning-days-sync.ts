import { currentDataOwner } from "../infrastructure/local/account-cache-storage";
import { isDeviceRecoveryActive } from "../infrastructure/local/device-backup";
import { deviceLearningTimeZone, loadLearningSnapshot, mergeLearningSync, recoverLearningReceipts, type LearningSyncResponse } from "../infrastructure/local/learning-days-storage";

export async function syncLearningDays(owner: string, token: string, request: typeof fetch = fetch, isCurrent = () => currentDataOwner() === owner) {
  if (owner === "guest" || !token || !isCurrent() || isDeviceRecoveryActive()) return;
  recoverLearningReceipts();
  const state = loadLearningSnapshot(owner);
  const events = state.records.filter((entry) => !entry.synced && !entry.rejected).slice(0, 100)
    .map(({ version, operationId, owner: recordOwner, occurredAt, timeZone }) => ({ version, operationId, owner: recordOwner, occurredAt, timeZone }));
  const response = await request("/api/learning-days", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, cache: "no-store",
    body: JSON.stringify({ timeZone: state.timeZone ?? deviceLearningTimeZone(), events }), signal: AbortSignal.timeout(15000),
  });
  if (!isCurrent() || isDeviceRecoveryActive()) return;
  if (!response.ok) throw new Error("learning_sync_failed");
  const body = await response.json() as LearningSyncResponse & { ok?: boolean };
  if (!isCurrent() || isDeviceRecoveryActive()) return;
  if (body.ok !== true) throw new Error("learning_sync_failed");
  mergeLearningSync(owner, body, events.map((entry) => entry.operationId));
}
