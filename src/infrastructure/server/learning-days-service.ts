import { learningDayAt, validLearningReceipt, validTimeZone, type LearningReceipt } from "../../domain/practice/learning-days";

export type LearningDaysRepository = {
  initializeTimeZone: (userId: string, timeZone: string) => Promise<string>;
  insertDays: (userId: string, entries: { day: string; occurredAt: string; timeZone: string }[]) => Promise<void>;
  listDays: (userId: string) => Promise<string[]>;
};

export async function synchronizeLearningDays(userId: string, body: unknown, repository: LearningDaysRepository, now = Date.now()) {
  if (!body || typeof body !== "object") throw new Error("invalid_request");
  const { timeZone: proposed, events } = body as { timeZone: unknown; events: unknown };
  if (!validTimeZone(proposed) || !Array.isArray(events) || events.length > 100
    || events.some((entry) => !validLearningReceipt(entry) || entry.owner !== userId)
    || new Set(events.map((entry: LearningReceipt) => entry.operationId)).size !== events.length) throw new Error("invalid_request");
  const timeZone = await repository.initializeTimeZone(userId, proposed);
  if (!validTimeZone(timeZone)) throw new Error("invalid_stored_zone");
  const accepted: string[] = [];
  const rejected: string[] = [];
  const entries = new Map<string, { day: string; occurredAt: string; timeZone: string }>();
  for (const entry of events as LearningReceipt[]) {
    if (Date.parse(entry.occurredAt) > now + 300000 || (entry.timeZone !== null && entry.timeZone !== timeZone)) {
      rejected.push(entry.operationId);
      continue;
    }
    const day = learningDayAt(entry.occurredAt, timeZone);
    entries.set(day, { day, occurredAt: entry.occurredAt, timeZone });
    accepted.push(entry.operationId);
  }
  await repository.insertDays(userId, [...entries.values()]);
  const days = await repository.listDays(userId);
  return { ok: true as const, userId, timeZone, days, accepted, rejected };
}
