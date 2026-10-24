export type LearningReceipt = {
  version: 1;
  operationId: string;
  owner: string;
  occurredAt: string;
  timeZone: string | null;
};

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100 || (value !== "UTC" && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(value))) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}

export function validLearningDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function learningDayAt(timestamp: number | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shiftLearningDay(day: string, offset: number): string {
  return new Date(Date.parse(day) + offset * 86400000).toISOString().slice(0, 10);
}

export function learningDaySummary(values: string[], today: string) {
  const days = [...new Set(values.filter((day) => validLearningDay(day) && day <= today))].sort();
  const daySet = new Set(days);
  const weekStart = shiftLearningDay(today, -((new Date(today).getUTCDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, index) => {
    const day = shiftLearningDay(weekStart, index);
    return { day, learned: daySet.has(day), today: day === today };
  });
  let streak = 0;
  let cursor = daySet.has(today) ? today : shiftLearningDay(today, -1);
  while (daySet.has(cursor)) { streak += 1; cursor = shiftLearningDay(cursor, -1); }
  return { days, week, weekly: week.filter((day) => day.learned).length, streak, total: days.length, learnedToday: daySet.has(today), firstDay: days[0] ?? null };
}

export function validLearningReceipt(value: unknown): value is LearningReceipt {
  if (!value || typeof value !== "object") return false;
  const entry = value as LearningReceipt;
  return entry.version === 1 && typeof entry.operationId === "string" && /^[\da-f-]{36}$/i.test(entry.operationId)
    && typeof entry.owner === "string" && /^(guest|[\da-f-]{36})$/i.test(entry.owner)
    && typeof entry.occurredAt === "string" && Number.isFinite(Date.parse(entry.occurredAt))
    && (entry.timeZone === null || validTimeZone(entry.timeZone));
}
