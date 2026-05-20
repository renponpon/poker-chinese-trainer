import { createHash } from "crypto";
import {
  countAiUsageToday,
  getUserIdFromAccessToken,
  isUsageTrackingConfigured,
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

const DEFAULT_GUEST_DAILY_LIMIT = 20;
const DEFAULT_USER_DAILY_LIMIT = 100;

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
