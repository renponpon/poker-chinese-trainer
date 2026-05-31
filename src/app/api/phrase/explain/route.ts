import { after, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createId } from "@/lib/id";
import { updatePhraseFollowUp } from "@/lib/notion";
import { getBearerToken, updateSupabasePhraseFollowUp } from "@/lib/supabase";
import { formatExplanationForReading } from "@/lib/explanation-format";
import { isSupportedDirection, parseDirection } from "@/lib/languages";
import { recordAiUsageEvent } from "@/lib/server/supabase-admin";
import {
  AiBurstLimitError,
  assertWithinAiBurstLimit,
  identifyRequestActor,
  UsageLimitError,
  UsageTrackingError,
  type RequestActor,
} from "@/lib/server/usage-limits";
import { RequestValidationError } from "@/lib/server/validation";
import type { PhraseDirection } from "@/lib/types";
import { buildExplainRequestPrompt } from "@/lib/explanation-prompt";

export const runtime = "nodejs";

const ENDPOINT = "/api/phrase/explain";
const GEMINI_MODEL = "gemini-3.1-flash-lite";

type ExplainRequest = {
  phraseId?: unknown;
  direction?: unknown;
  japanese?: unknown;
  chinese?: unknown;
  pinyin?: unknown;
  sourceText?: unknown;
  targetText?: unknown;
  reading?: unknown;
};

class ApiRouteError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "ApiRouteError";
  }
}

export async function POST(req: Request) {
  const requestId = createId();
  let actor: RequestActor | null = null;
  let inputChars = 0;
  let outputChars = 0;
  let direction: PhraseDirection | null = null;

  try {
    const accessToken = getBearerToken(req);
    actor = await identifyRequestActor(req, accessToken);
    assertWithinAiBurstLimit(actor);

    let body: ExplainRequest;
    try {
      const raw = await req.json();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new RequestValidationError("リクエスト形式が正しくありません");
      }
      body = raw as ExplainRequest;
    } catch (error) {
      if (error instanceof RequestValidationError) throw error;
      throw new RequestValidationError("JSON形式のリクエストを送ってください");
    }

    const phraseId = normalizeText(body.phraseId, "phraseId");
    direction = normalizeDirection(body.direction);
    const { sourceLanguage, targetLanguage } = parseDirection(direction);
    const sourceText = normalizeOptionalText(body.sourceText);
    const targetText = normalizeOptionalText(body.targetText);
    const japanese =
      normalizeOptionalText(body.japanese) ??
      (sourceLanguage === "ja" ? sourceText : targetLanguage === "ja" ? targetText : "") ??
      "";
    const chinese =
      normalizeOptionalText(body.chinese) ??
      (sourceLanguage === "zh" ? sourceText : targetLanguage === "zh" ? targetText : "") ??
      "";
    if (!sourceText && !targetText && (!japanese || !chinese)) {
      throw new RequestValidationError("フレーズ本文が空です");
    }
    const pinyin = normalizeText(body.pinyin ?? body.reading ?? "", "pinyin", true);
    const needsPinyin = (sourceLanguage === "zh" || targetLanguage === "zh") && !pinyin;
    const payload = buildExplainRequestPrompt({
      direction,
      japanese,
      chinese,
      pinyin,
      sourceText,
      targetText,
      reading: normalizeOptionalText(body.reading),
    });
    inputChars = payload.length;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ApiRouteError("GEMINI_API_KEY が設定されていません", 500, "missing_gemini_api_key");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: payload,
      config: { responseMimeType: "application/json" },
    });
    const text = response.text;
    if (!text) {
      throw new ApiRouteError("Gemini から空の応答が返りました", 502, "empty_gemini_response");
    }
    outputChars = text.length;
    const { explanation, pinyin: generatedPinyin } = extractExplainResponse(text, needsPinyin);

    await recordUsage({
      requestId,
      actor,
      direction,
      inputChars,
      outputChars,
      success: true,
      errorCode: null,
    });

    after(async () => {
      try {
        if (accessToken) {
          const updated = await updateSupabasePhraseFollowUp(accessToken, phraseId, {
            explanation,
            pinyin: generatedPinyin,
          });
          if (!updated) {
            await sleep(1000);
            await updateSupabasePhraseFollowUp(accessToken, phraseId, {
              explanation,
              pinyin: generatedPinyin,
            });
          }
        }
        const notionUpdated = await updatePhraseFollowUp(phraseId, {
          explanation,
          pinyin: generatedPinyin,
        });
        if (!notionUpdated) {
          await sleep(1000);
          await updatePhraseFollowUp(phraseId, {
            explanation,
            pinyin: generatedPinyin,
          });
        }
      } catch (saveError) {
        console.error("[/api/phrase/explain] save error", { requestId, saveError });
      }
    });

    return NextResponse.json({
      requestId,
      phraseId,
      explanation,
      ...(generatedPinyin ? { pinyin: generatedPinyin } : {}),
    });
  } catch (error) {
    const normalized = normalizeRouteError(error);
    console.error("[/api/phrase/explain] error", {
      requestId,
      code: normalized.code,
      error,
    });
    if (error instanceof AiBurstLimitError && !error.alert.alreadyBlocked) {
      const alert = error.alert;
      after(async () => {
        const { sendAiBurstLimitAlertEmail } = await import("@/lib/server/security-alerts");
        await sendAiBurstLimitAlertEmail({
          requestId,
          endpoint: ENDPOINT,
          mode: "explain",
          source: null,
          direction,
          actorType: alert.actorType,
          userId: alert.userId,
          ipHash: alert.ipHash,
          count: alert.count,
          burstLimit: alert.burstLimit,
          windowSeconds: alert.windowSeconds,
          blockSeconds: alert.blockSeconds,
        });
      });
    }

    if (actor) {
      await recordUsage({
        requestId,
        actor,
        direction,
        inputChars,
        outputChars,
        success: false,
        errorCode: normalized.code,
      });
    }

    return NextResponse.json(
      { error: normalized.message, requestId },
      { status: normalized.status },
    );
  }
}

function extractExplainResponse(
  text: string,
  needsPinyin: boolean,
): { explanation: string; pinyin?: string } {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new ApiRouteError("Gemini からの応答に JSON が見つかりません", 502, "invalid_gemini_json");
  }
  const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as {
    explanation?: unknown;
    pinyin?: unknown;
  };
  if (typeof parsed.explanation !== "string" || !parsed.explanation.trim()) {
    throw new ApiRouteError("解説の生成結果が空です", 502, "empty_explanation");
  }
  const explanation = formatExplanationForReading(parsed.explanation);
  const pinyin =
    typeof parsed.pinyin === "string" && parsed.pinyin.trim()
      ? parsed.pinyin.trim()
      : undefined;
  if (needsPinyin && !pinyin) {
    console.warn("[/api/phrase/explain] pinyin missing in Gemini response");
  }
  return { explanation, pinyin };
}

function normalizeText(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== "string") {
    throw new RequestValidationError(`${field} が正しくありません`);
  }
  const normalized = value.trim();
  if (!allowEmpty && !normalized) {
    throw new RequestValidationError(`${field} が空です`);
  }
  return normalized;
}

function normalizeDirection(value: unknown): PhraseDirection {
  if (isSupportedDirection(value)) return value;
  throw new RequestValidationError("翻訳方向が正しくありません");
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recordUsage(input: {
  requestId: string;
  actor: RequestActor;
  direction: PhraseDirection | null;
  inputChars: number;
  outputChars: number;
  success: boolean;
  errorCode: string | null;
}) {
  await recordAiUsageEvent({
    requestId: input.requestId,
    userId: input.actor.userId,
    actorType: input.actor.type,
    ipHash: input.actor.ipHash,
    endpoint: ENDPOINT,
    feature: "explanation",
    provider: "gemini",
    mode: "full",
    sourcePage: "add",
    direction: input.direction,
    inputChars: input.inputChars,
    outputChars: input.outputChars,
    audioDurationMs: null,
    success: input.success,
    errorCode: input.errorCode,
    model: GEMINI_MODEL,
  });
}

function normalizeRouteError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof RequestValidationError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof UsageLimitError || error instanceof UsageTrackingError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof ApiRouteError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  return {
    status: 500,
    code: "internal_error",
    message: error instanceof Error ? error.message : "サーバーエラーが発生しました",
  };
}
