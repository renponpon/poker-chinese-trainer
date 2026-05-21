import { NextResponse } from "next/server";
import { createId } from "@/lib/id";
import { getBearerToken } from "@/lib/supabase";
import { recordAiUsageEvent } from "@/lib/server/supabase-admin";
import { identifyRequestActor } from "@/lib/server/usage-limits";
import { RequestValidationError } from "@/lib/server/validation";
import type { PhraseDirection } from "@/lib/types";

export const runtime = "nodejs";

const ENDPOINT = "/api/usage/event";

type UsageEventRequest = {
  feature?: unknown;
  provider?: unknown;
  mode?: unknown;
  sourcePage?: unknown;
  direction?: unknown;
  outputChars?: unknown;
  audioDurationMs?: unknown;
  success?: unknown;
  errorCode?: unknown;
};

export async function POST(req: Request) {
  const requestId = createId();

  try {
    const accessToken = getBearerToken(req);
    const actor = await identifyRequestActor(req, accessToken);
    const body = await parseBody(req);

    await recordAiUsageEvent({
      requestId,
      userId: actor.userId,
      actorType: actor.type,
      ipHash: actor.ipHash,
      endpoint: ENDPOINT,
      feature: "speech_to_text",
      provider: "web_speech",
      mode: normalizeMode(body.mode),
      sourcePage: normalizeSourcePage(body.sourcePage),
      direction: normalizeDirection(body.direction),
      inputChars: 0,
      outputChars: normalizeNonNegativeInteger(body.outputChars),
      audioDurationMs: normalizeOptionalNonNegativeInteger(body.audioDurationMs),
      success: normalizeSuccess(body.success),
      errorCode: normalizeOptionalText(body.errorCode, 80),
      model: "web-speech-api",
    });

    return NextResponse.json({ requestId, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "利用ログの記録に失敗しました";
    const status = error instanceof RequestValidationError ? error.status : 500;
    console.error("[/api/usage/event] error", { requestId, error });
    return NextResponse.json({ error: message, requestId }, { status });
  }
}

async function parseBody(req: Request): Promise<UsageEventRequest> {
  try {
    const raw = await req.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new RequestValidationError("リクエスト形式が正しくありません");
    }
    return raw as UsageEventRequest;
  } catch (error) {
    if (error instanceof RequestValidationError) throw error;
    throw new RequestValidationError("JSON形式のリクエストを送ってください");
  }
}

function normalizeMode(value: unknown): "standard" {
  if (value === "standard") return value;
  throw new RequestValidationError("mode が正しくありません");
}

function normalizeSourcePage(value: unknown): "add" | "conversation" | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === "add" || value === "conversation") return value;
  throw new RequestValidationError("sourcePage が正しくありません");
}

function normalizeDirection(value: unknown): PhraseDirection | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === "ja-to-zh" || value === "zh-to-ja") return value;
  throw new RequestValidationError("direction が正しくありません");
}

function normalizeSuccess(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  throw new RequestValidationError("success が正しくありません");
}

function normalizeNonNegativeInteger(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RequestValidationError("数値が正しくありません");
  }
  return Math.floor(value);
}

function normalizeOptionalNonNegativeInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  return normalizeNonNegativeInteger(value);
}

function normalizeOptionalText(value: unknown, maxChars: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new RequestValidationError("errorCode が正しくありません");
  }
  return value.slice(0, maxChars);
}
