import { isDrillLimit, type DrillLimit } from "../../domain/practice/drill-preferences";
import { learningDayAt, validTimeZone } from "../../domain/practice/learning-days";
import type { LanguageCode, Phrase, SrsItem } from "../../lib/types";
import { selectDueDrillPhrases } from "./drill-schedule";

export type DrillRound = {
  version: 1;
  id: string;
  owner: string;
  language: LanguageCode;
  day: string;
  timeZone: string;
  limit: DrillLimit;
  queueIds: string[];
  completedIds: string[];
  completedToday: string[];
  reviewed: Record<string, number | null>;
};

type RoundInput = { phrases: Phrase[]; items: SrsItem[]; language: LanguageCode; now: number; timeZone: string };

export function availableRoundPhrases(input: RoundInput, completedToday: string[] = []) {
  const excluded = new Set(completedToday);
  const day = learningDayAt(input.now, input.timeZone);
  for (const item of input.items) {
    if (item.lastScore && item.lastScore !== 1 && item.lastReviewedAt !== null && learningDayAt(item.lastReviewedAt, input.timeZone) === day) excluded.add(item.id);
  }
  return selectDueDrillPhrases({ ...input, phrases: input.phrases.filter((phrase) => phrase.targetLanguage === input.language && phrase.source !== "prototype" && !excluded.has(phrase.id)) });
}

export function startDrillRound(input: RoundInput & { owner: string; limit: DrillLimit; id: string; completedToday?: string[] }): DrillRound {
  const available = availableRoundPhrases(input, input.completedToday);
  const selected = input.limit === 0 ? available : available.slice(0, input.limit);
  const items = new Map(input.items.map((item) => [item.id, item]));
  return { version: 1, id: input.id, owner: input.owner, language: input.language, day: learningDayAt(input.now, input.timeZone), timeZone: input.timeZone,
    limit: input.limit, queueIds: selected.map((phrase) => phrase.id), completedIds: [], completedToday: input.completedToday ?? [],
    reviewed: Object.fromEntries(selected.map((phrase) => [phrase.id, items.get(phrase.id)?.lastReviewedAt ?? null])) };
}

export function reconcileDrillRound(round: DrillRound, phrases: Phrase[], items: SrsItem[]): DrillRound {
  const active = new Set(phrases.filter((phrase) => phrase.shouldDrill && phrase.targetLanguage === round.language && phrase.source !== "prototype").map((phrase) => phrase.id));
  const byId = new Map(items.map((item) => [item.id, item]));
  let queueIds = round.queueIds.filter((id) => active.has(id));
  const completedIds = [...round.completedIds];
  const completedToday = new Set(round.completedToday);
  const reviewed = { ...round.reviewed };
  const changed = queueIds.flatMap((id) => {
    const item = byId.get(id);
    return item?.lastReviewedAt !== null && item?.lastReviewedAt !== undefined && item.lastScore && item.lastReviewedAt > (reviewed[id] ?? -1) ? [item] : [];
  }).sort((left, right) => left.lastReviewedAt! - right.lastReviewedAt!);
  for (const item of changed) {
    reviewed[item.id] = item.lastReviewedAt;
    queueIds = queueIds.filter((id) => id !== item.id);
    if (item.lastScore === 1) queueIds.push(item.id);
    else { completedIds.push(item.id); completedToday.add(item.id); }
  }
  const next = { ...round, queueIds, completedIds, completedToday: [...completedToday], reviewed };
  return JSON.stringify(next) === JSON.stringify(round) ? round : next;
}

export function validDrillRound(value: unknown): value is DrillRound {
  if (!value || typeof value !== "object") return false;
  const round = value as DrillRound;
  const ids = (values: unknown): values is string[] => Array.isArray(values) && values.every((id) => typeof id === "string" && id.length > 0 && id.length <= 200) && new Set(values).size === values.length;
  return round.version === 1 && typeof round.id === "string" && typeof round.owner === "string" && ["en", "zh"].includes(round.language)
    && /^\d{4}-\d{2}-\d{2}$/.test(round.day) && validTimeZone(round.timeZone) && isDrillLimit(round.limit)
    && ids(round.queueIds) && ids(round.completedIds) && ids(round.completedToday) && (round.limit === 0 || round.queueIds.length + round.completedIds.length <= round.limit)
    && round.completedIds.every((id) => !round.queueIds.includes(id) && round.completedToday.includes(id))
    && !!round.reviewed && typeof round.reviewed === "object" && [...round.queueIds, ...round.completedIds].every((id) => Object.hasOwn(round.reviewed, id) && (round.reviewed[id] === null || Number.isFinite(round.reviewed[id])));
}
