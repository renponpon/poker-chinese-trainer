export const DRILL_LIMITS = [5, 10, 20] as const;
export type DrillLimit = number;
export const MAX_CUSTOM_DRILL_LIMIT = 999;
export const DEFAULT_DRILL_LIMIT: DrillLimit = 5;

export function isDrillLimit(value: unknown): value is DrillLimit {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_CUSTOM_DRILL_LIMIT;
}

export function drillLimitLabel(limit: DrillLimit): string {
  return limit === 0 ? "無制限" : `${limit}問`;
}
