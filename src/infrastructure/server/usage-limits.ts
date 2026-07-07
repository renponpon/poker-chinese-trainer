import { createHash } from "node:crypto";

export type AiUsageActorType = "guest" | "user";

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

export type AiBurstLimitAlert = {
  actorType: AiUsageActorType;
  userId: string | null;
  ipHash: string | null;
  count: number;
  burstLimit: number;
  windowSeconds: number;
  blockSeconds: number;
  alreadyBlocked: boolean;
};

export class AiBurstLimitError extends UsageLimitError {
  code = "burst_rate_limited";

  constructor(public readonly alert: AiBurstLimitAlert) {
    super("短時間に利用が集中しています。1時間後にもう一度試してください。");
    this.name = "AiBurstLimitError";
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
const DEFAULT_GUEST_BURST_LIMIT_PER_MINUTE = 100;
const DEFAULT_USER_BURST_LIMIT_PER_MINUTE = 100;
const DEFAULT_BURST_WINDOW_SECONDS = 60;
const DEFAULT_BURST_BLOCK_SECONDS = 3_600;
const AI_BURST_CACHE_MAX_ENTRIES = 1_000;

type AiBurstEntry = {
  windowStartedAt: number;
  count: number;
  blockedUntil: number;
};

const aiBurstCache = new Map<string, AiBurstEntry>();

export async function identifyRequestActor(
  req: Request,
  accessToken: string,
): Promise<RequestActor> {
  const userId = accessToken ? await getUserIdFromAccessToken(accessToken) : null;
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
  const { countAiUsageToday, isUsageTrackingConfigured } = await import(
    "@/lib/server/supabase-admin"
  );
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

  return currentCount;
}

export function assertWithinAiBurstLimit(actor: RequestActor): number {
  const cacheKey = getActorCacheKey(actor);
  if (!cacheKey) return 0;

  const now = Date.now();
  const windowSeconds = getPositiveIntEnv(
    "AI_BURST_WINDOW_SECONDS",
    DEFAULT_BURST_WINDOW_SECONDS,
  );
  const blockSeconds = getPositiveIntEnv(
    "AI_BURST_BLOCK_SECONDS",
    DEFAULT_BURST_BLOCK_SECONDS,
  );
  const windowMs = windowSeconds * 1_000;
  const blockMs = blockSeconds * 1_000;
  const burstLimit = getAiBurstLimit(actor);
  const cached = aiBurstCache.get(cacheKey);

  if (cached?.blockedUntil && cached.blockedUntil > now) {
    throw new AiBurstLimitError(
      buildAiBurstLimitAlert(actor, cached.count, burstLimit, windowSeconds, blockSeconds, true),
    );
  }

  if (!cached || now - cached.windowStartedAt >= windowMs) {
    pruneAiBurstCacheIfNeeded();
    aiBurstCache.set(cacheKey, {
      windowStartedAt: now,
      count: 1,
      blockedUntil: 0,
    });
    return 1;
  }

  const nextCount = cached.count + 1;
  if (nextCount > burstLimit) {
    aiBurstCache.set(cacheKey, {
      windowStartedAt: cached.windowStartedAt,
      count: nextCount,
      blockedUntil: now + blockMs,
    });
    throw new AiBurstLimitError(
      buildAiBurstLimitAlert(actor, nextCount, burstLimit, windowSeconds, blockSeconds, false),
    );
  }

  aiBurstCache.set(cacheKey, {
    windowStartedAt: cached.windowStartedAt,
    count: nextCount,
    blockedUntil: 0,
  });
  return nextCount;
}

export function getPhrasePackDailyLimit(actor: RequestActor): number {
  return actor.type === "user"
    ? getPositiveIntEnv("PHRASE_PACK_USER_DAILY_LIMIT", DEFAULT_USER_PHRASE_PACK_DAILY_LIMIT)
    : getPositiveIntEnv("PHRASE_PACK_GUEST_DAILY_LIMIT", DEFAULT_GUEST_PHRASE_PACK_DAILY_LIMIT);
}

export async function assertWithinPhrasePackDailyLimit(actor: RequestActor): Promise<number> {
  const dailyLimit = getPhrasePackDailyLimit(actor);
  const { countPhrasePackUsageToday, isUsageTrackingConfigured } = await import(
    "@/lib/server/supabase-admin"
  );
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
  const { isValidPhrasePackRequest } = await import("@/lib/server/supabase-admin");
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

async function getUserIdFromAccessToken(accessToken: string): Promise<string | null> {
  const { getUserIdFromAccessToken: getUserId } = await import("@/lib/server/supabase-admin");
  return getUserId(accessToken);
}

function getPositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getActorCacheKey(actor: RequestActor): string | null {
  if (actor.userId) return `${actor.type}:user:${actor.userId}`;
  if (actor.ipHash) return `${actor.type}:ip:${actor.ipHash}`;
  return null;
}

function getAiBurstLimit(actor: RequestActor): number {
  return actor.type === "user"
    ? getPositiveIntEnv("AI_USER_BURST_LIMIT_PER_MINUTE", DEFAULT_USER_BURST_LIMIT_PER_MINUTE)
    : getPositiveIntEnv("AI_GUEST_BURST_LIMIT_PER_MINUTE", DEFAULT_GUEST_BURST_LIMIT_PER_MINUTE);
}

function buildAiBurstLimitAlert(
  actor: RequestActor,
  count: number,
  burstLimit: number,
  windowSeconds: number,
  blockSeconds: number,
  alreadyBlocked: boolean,
): AiBurstLimitAlert {
  return {
    actorType: actor.type,
    userId: actor.userId,
    ipHash: actor.ipHash,
    count,
    burstLimit,
    windowSeconds,
    blockSeconds,
    alreadyBlocked,
  };
}

function pruneAiBurstCacheIfNeeded(): void {
  if (aiBurstCache.size < AI_BURST_CACHE_MAX_ENTRIES) return;

  const now = Date.now();
  for (const [key, cached] of aiBurstCache) {
    if (
      (cached.blockedUntil && cached.blockedUntil <= now) ||
      now - cached.windowStartedAt >= DEFAULT_BURST_WINDOW_SECONDS * 1_000
    ) {
      aiBurstCache.delete(key);
    }
  }
  if (aiBurstCache.size < AI_BURST_CACHE_MAX_ENTRIES) return;

  const firstKey = aiBurstCache.keys().next().value;
  if (firstKey) aiBurstCache.delete(firstKey);
}
