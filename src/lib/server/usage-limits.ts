import { createHash } from "crypto";
import {
  countAiUsageToday,
  countPhrasePackUsageToday,
  getUserIdFromAccessToken,
  isUsageTrackingConfigured,
  isValidPhrasePackRequest,
  type AiUsageActorType,
} from "@/lib/server/supabase-admin";

export type RequestActor = {
  type: AiUsageActorType;
  userId: string | null;
  ipHash: string | null;
  dailyLimit: number;
};

export class UsageLimitError extends Error {
  status = 429;
  code = "quota_exceeded";

  constructor(message = "本日の利用上限に達しました。ログインするか、明日また試してください。") {
    super(message);
    this.name = "UsageLimitError";
  }
}

export class UsageTrackingError extends Error {
  status = 503;
  code = "usage_tracking_unavailable";

  constructor() {
    super("利用量制限の設定が未完了です。管理者に連絡してください。");
    this.name = "UsageTrackingError";
  }
}

export class PhrasePackLimitError extends Error {
  status = 429;
  code = "phrase_pack_quota_exceeded";

  constructor(isUser: boolean) {
    super(
      isUser
        ? "本日のフレーズパック作成上限（4回）に達しました。明日またお試しください。"
        : "本日のフレーズパック作成上限（2回）に達しました。ログインすると1日4回まで使えます。",
    );
    this.name = "PhrasePackLimitError";
  }
}

export class PhrasePackRequestError extends Error {
  status = 403;
  code = "invalid_phrase_pack_request";

  constructor() {
    super("フレーズパックの生成記録が見つかりません。もう一度パックを作成してください。");
    this.name = "PhrasePackRequestError";
  }
}

const DEFAULT_GUEST_DAILY_LIMIT = 100;
const DEFAULT_USER_DAILY_LIMIT = 200;
const DEFAULT_GUEST_PHRASE_PACK_DAILY_LIMIT = 2;
const DEFAULT_USER_PHRASE_PACK_DAILY_LIMIT = 4;
const AI_USAGE_COUNT_CACHE_TTL_MS = 30_000;
const AI_USAGE_COUNT_CACHE_MAX_ENTRIES = 500;

type AiUsageCountCacheEntry = {
  dayKey: string;
  count: number;
  expiresAt: number;
};

const aiUsageCountCache = new Map<string, AiUsageCountCacheEntry>();

export async function identifyRequestActor(
  req: Request,
  accessToken: string,
): Promise<RequestActor> {
  const userId = await getUserIdFromAccessToken(accessToken);
  const ipHash = hashClientIp(getClientIp(req));

  if (userId) {
    return {
      type: "user",
      userId,
      ipHash,
      dailyLimit: getPositiveIntEnv("AI_USER_DAILY_LIMIT", DEFAULT_USER_DAILY_LIMIT),
    };
  }

  return {
    type: "guest",
    userId: null,
    ipHash,
    dailyLimit: getPositiveIntEnv("AI_GUEST_DAILY_LIMIT", DEFAULT_GUEST_DAILY_LIMIT),
  };
}

export async function assertWithinDailyAiLimit(actor: RequestActor): Promise<number> {
  const cachedCount = getCachedDailyAiUsageCount(actor);
  if (cachedCount !== null) {
    if (cachedCount >= actor.dailyLimit) {
      throw new UsageLimitError();
    }
    return cachedCount;
  }

  const currentCount = await countAiUsageToday({
    actorType: actor.type,
    userId: actor.userId,
    ipHash: actor.ipHash,
  });

  if (currentCount === null) {
    if (process.env.NODE_ENV === "production" && !isUsageTrackingConfigured()) {
      throw new UsageTrackingError();
    }
    console.warn("[usage-limits] Usage tracking is not configured; allowing request in development.");
    return 0;
  }

  if (currentCount >= actor.dailyLimit) {
    throw new UsageLimitError();
  }

  setDailyAiUsageCountCache(actor, currentCount);
  return currentCount;
}

export function incrementDailyAiUsageCache(actor: RequestActor): void {
  const cacheKey = getAiUsageCountCacheKey(actor);
  if (!cacheKey) return;

  const now = Date.now();
  const dayKey = getUtcDayKey(new Date());
  const cached = aiUsageCountCache.get(cacheKey);
  if (!cached || cached.dayKey !== dayKey || cached.expiresAt <= now) return;

  aiUsageCountCache.set(cacheKey, {
    dayKey,
    count: cached.count + 1,
    expiresAt: now + AI_USAGE_COUNT_CACHE_TTL_MS,
  });
}

export function getPhrasePackDailyLimit(actor: RequestActor): number {
  return actor.type === "user"
    ? getPositiveIntEnv("PHRASE_PACK_USER_DAILY_LIMIT", DEFAULT_USER_PHRASE_PACK_DAILY_LIMIT)
    : getPositiveIntEnv("PHRASE_PACK_GUEST_DAILY_LIMIT", DEFAULT_GUEST_PHRASE_PACK_DAILY_LIMIT);
}

export async function assertWithinPhrasePackDailyLimit(actor: RequestActor): Promise<number> {
  const dailyLimit = getPhrasePackDailyLimit(actor);
  const currentCount = await countPhrasePackUsageToday({
    actorType: actor.type,
    userId: actor.userId,
    ipHash: actor.ipHash,
  });

  if (currentCount === null) {
    if (process.env.NODE_ENV === "production" && !isUsageTrackingConfigured()) {
      throw new UsageTrackingError();
    }
    console.warn("[usage-limits] Phrase pack tracking is not configured; allowing request in development.");
    return 0;
  }

  if (currentCount >= dailyLimit) {
    throw new PhrasePackLimitError(actor.type === "user");
  }

  return currentCount;
}

export async function assertValidPhrasePackRequest(
  actor: RequestActor,
  packRequestId: string,
): Promise<void> {
  const valid = await isValidPhrasePackRequest({
    packRequestId,
    actorType: actor.type,
    userId: actor.userId,
    ipHash: actor.ipHash,
  });
  if (!valid) {
    throw new PhrasePackRequestError();
  }
}

function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function hashClientIp(ip: string): string {
  const salt =
    process.env.USAGE_HASH_SALT ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "local-development-usage-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function getPositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getCachedDailyAiUsageCount(actor: RequestActor): number | null {
  const cacheKey = getAiUsageCountCacheKey(actor);
  if (!cacheKey) return null;

  const now = Date.now();
  const cached = aiUsageCountCache.get(cacheKey);
  if (!cached) return null;
  if (cached.dayKey !== getUtcDayKey(new Date()) || cached.expiresAt <= now) {
    aiUsageCountCache.delete(cacheKey);
    return null;
  }
  return cached.count;
}

function setDailyAiUsageCountCache(actor: RequestActor, count: number): void {
  const cacheKey = getAiUsageCountCacheKey(actor);
  if (!cacheKey) return;

  pruneAiUsageCountCacheIfNeeded();
  aiUsageCountCache.set(cacheKey, {
    dayKey: getUtcDayKey(new Date()),
    count,
    expiresAt: Date.now() + AI_USAGE_COUNT_CACHE_TTL_MS,
  });
}

function getAiUsageCountCacheKey(actor: RequestActor): string | null {
  if (actor.userId) return `${actor.type}:user:${actor.userId}`;
  if (actor.ipHash) return `${actor.type}:ip:${actor.ipHash}`;
  return null;
}

function getUtcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function pruneAiUsageCountCacheIfNeeded(): void {
  if (aiUsageCountCache.size < AI_USAGE_COUNT_CACHE_MAX_ENTRIES) return;

  const now = Date.now();
  for (const [key, cached] of aiUsageCountCache) {
    if (cached.expiresAt <= now) aiUsageCountCache.delete(key);
  }
  if (aiUsageCountCache.size < AI_USAGE_COUNT_CACHE_MAX_ENTRIES) return;

  const firstKey = aiUsageCountCache.keys().next().value;
  if (firstKey) aiUsageCountCache.delete(firstKey);
}
