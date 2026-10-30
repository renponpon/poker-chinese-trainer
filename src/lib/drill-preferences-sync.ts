import { isDrillLimit } from "../domain/practice/drill-preferences";
import { currentDataOwner } from "../infrastructure/local/account-cache-storage";
import { isDeviceRecoveryActive } from "../infrastructure/local/device-backup";
import { loadDrillPreferences, writeDrillPreferences } from "../infrastructure/local/drill-preferences-storage";

export async function syncDrillPreferences(owner: string, token: string, request: typeof fetch = fetch, isCurrent = () => currentDataOwner() === owner) {
  if (owner === "guest" || !token || !isCurrent() || isDeviceRecoveryActive()) return;
  const sent = loadDrillPreferences(owner);
  const response = await request("/api/drill-preferences", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(sent.pendingId ? { limit: sent.limit } : {}), signal: AbortSignal.timeout(15000) });
  if (!isCurrent() || isDeviceRecoveryActive()) return;
  if (!response.ok) throw new Error("drill_preferences_sync_failed");
  const body = await response.json();
  if (!isCurrent() || isDeviceRecoveryActive()) return;
  if (body.ok !== true || body.userId !== owner || !isDrillLimit(body.limit) || (sent.pendingId && body.limit !== sent.limit)) throw new Error("drill_preferences_response_invalid");
  const current = loadDrillPreferences(owner);
  if (current.pendingId !== sent.pendingId) return;
  if (current.limit !== body.limit || current.pendingId) writeDrillPreferences(owner, { limit: body.limit, pendingId: null });
}
