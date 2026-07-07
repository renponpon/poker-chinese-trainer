import { NextResponse } from "next/server";
import { createId } from "@/lib/id";
import { isLanguageCode, isSupportedDirection } from "@/lib/languages";
import { getBearerToken } from "@/infrastructure/server/request-auth";
import { recordProductAnalyticsEvent } from "@/infrastructure/server/usage-event-recorder";
import { identifyRequestActor } from "@/infrastructure/server/usage-limits";
import { RequestValidationError } from "@/lib/server/validation";
import type { LanguageCode, PhraseDirection } from "@/lib/types";

export const runtime = "nodejs";

const EVENT_NAMES = new Set([
  "page_view",
  "input_start",
  "translation_submit",
  "translation_success",
  "translation_failure",
  "drill_open",
  "drill_answer",
  "conversation_drill_save",
]);

const SOURCE_PAGES = new Set([
  "home",
  "add",
  "conversation",
  "drill",
  "library",
  "auth",
]);

type AnalyticsEventRequest = {
  sessionId?: unknown;
  eventName?: unknown;
  route?: unknown;
  sourcePage?: unknown;
  direction?: unknown;
  targetLanguage?: unknown;
  generationMode?: unknown;
  inputChars?: unknown;
  score?: unknown;
  success?: unknown;
  errorCode?: unknown;
};

export async function POST(req: Request) {
  const requestId = createId();

  try {
    const accessToken = getBearerToken(req);
    const actor = await identifyRequestActor(req, accessToken);
    const body = await parseBody(req);

    const tracked = await recordProductAnalyticsEvent({
      requestId,
      userId: actor.userId,
      actorType: actor.type,
      ipHash: actor.ipHash,
      sessionId: normalizeSessionId(body.sessionId),
      eventName: normalizeEventName(body.eventName),
      route: normalizeRoute(body.route),
      sourcePage: normalizeSourcePage(body.sourcePage),
      direction: normalizeDirection(body.direction),
      targetLanguage: normalizeTargetLanguage(body.targetLanguage),
      generationMode: normalizeOptionalText(body.generationMode, 40),
      inputChars: normalizeNonNegativeInteger(body.inputChars),
      score: normalizeScore(body.score),
      success: normalizeOptionalBoolean(body.success),
      errorCode: normalizeOptionalText(body.errorCode, 80),
    });

    return NextResponse.json({ requestId, ok: true, tracked });
  } catch (error) {
    const status = error instanceof RequestValidationError ? error.status : 500;
    const message =
      error instanceof Error ? error.message : "Failed to record analytics event";
    console.error("[/api/analytics/event] error", { requestId, error });
    return NextResponse.json({ error: message, requestId }, { status });
  }
}

async function parseBody(req: Request): Promise<AnalyticsEventRequest> {
  try {
    const raw = await req.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new RequestValidationError("Invalid request body");
    }
    return raw as AnalyticsEventRequest;
  } catch (error) {
    if (error instanceof RequestValidationError) throw error;
    throw new RequestValidationError("Invalid JSON body");
  }
}

function normalizeEventName(value: unknown): string {
  if (typeof value === "string" && EVENT_NAMES.has(value)) return value;
  throw new RequestValidationError("Invalid eventName");
}

function normalizeSessionId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new RequestValidationError("Invalid sessionId");
  return value.trim().slice(0, 80) || null;
}

function normalizeRoute(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new RequestValidationError("Invalid route");
  const route = value.trim();
  if (!route.startsWith("/")) throw new RequestValidationError("Invalid route");
  return route.slice(0, 120);
}

function normalizeSourcePage(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && SOURCE_PAGES.has(value)) return value;
  throw new RequestValidationError("Invalid sourcePage");
}

function normalizeDirection(value: unknown): PhraseDirection | null {
  if (value === undefined || value === null || value === "") return null;
  if (isSupportedDirection(value)) return value;
  throw new RequestValidationError("Invalid direction");
}

function normalizeTargetLanguage(value: unknown): LanguageCode | null {
  if (value === undefined || value === null || value === "") return null;
  if (isLanguageCode(value)) return value;
  throw new RequestValidationError("Invalid targetLanguage");
}

function normalizeOptionalText(value: unknown, maxChars: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new RequestValidationError("Invalid text");
  return value.trim().slice(0, maxChars) || null;
}

function normalizeNonNegativeInteger(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RequestValidationError("Invalid number");
  }
  return Math.floor(value);
}

function normalizeScore(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === 1 || value === 2 || value === 3) return value;
  throw new RequestValidationError("Invalid score");
}

function normalizeOptionalBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value;
  throw new RequestValidationError("Invalid success");
}
