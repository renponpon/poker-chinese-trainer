import { DEFAULT_DRILL_LIMIT, isDrillLimit, type DrillLimit } from "../../domain/practice/drill-preferences";

export type DrillPreferencesRepository = { read: (userId: string) => Promise<DrillLimit | null>; write: (userId: string, limit: DrillLimit) => Promise<DrillLimit> };

export async function synchronizeDrillPreferences(userId: string, body: unknown, repository: DrillPreferencesRepository) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "limit")) throw new Error("invalid_request");
  const limit = (body as { limit?: unknown }).limit;
  let result: DrillLimit | null;
  if (limit === undefined) result = await repository.read(userId) ?? DEFAULT_DRILL_LIMIT;
  else {
    if (!isDrillLimit(limit)) throw new Error("invalid_request");
    result = await repository.write(userId, limit);
  }
  if (!isDrillLimit(result)) throw new Error("invalid_response");
  return { ok: true, userId, limit: result };
}
