import { after, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createId } from "@/lib/id";
import { updatePhraseExplanation } from "@/lib/notion";
import { getBearerToken, updateSupabasePhraseExplanation } from "@/lib/supabase";
import { recordAiUsageEvent } from "@/lib/server/supabase-admin";
import {
  assertWithinDailyAiLimit,
  identifyRequestActor,
  UsageLimitError,
  UsageTrackingError,
  type RequestActor,
} from "@/lib/server/usage-limits";
import { RequestValidationError } from "@/lib/server/validation";
import type { PhraseDirection } from "@/lib/types";

export const runtime = "nodejs";

const ENDPOINT = "/api/phrase/explain";
const GEMINI_MODEL = "gemini-3.1-flash-lite";

const EXPLANATION_PROMPT = `あなたは、マカオ・中国語圏での実生活、ライブポーカー、カジノ、旅行会話に詳しい実践的な中国語コーチです。

ユーザーには既に翻訳結果とピンインを表示済みです。
あなたの仕事は、あとから読むための日本語解説だけを作ることです。

ルール:
- explanation は必ず日本語
- 中国語（簡体字）を書いた場合は、必ず直後に半角括弧で声調記号付きピンインを添える
- 短くても実践的にする
- 必ず JSON のみを返す
- JSON のキーは explanation のみ

日→中の場合の見出し:
## 単語分解と直訳の構造
## ニュアンスと適切な場面
## 入れ替えテンプレ
## 想定される相手の返答
## 発音のコツ・注意点
## 類似・関連フレーズ

中→日の場合の見出し:
## 意味
## ニュアンスと使われる場面
## 返答するときの例
## 発音のコツ・注意点
## 類似・関連フレーズ

{
  "explanation": "日本語の解説"
}`;

type ExplainRequest = {
  phraseId?: unknown;
  direction?: unknown;
  japanese?: unknown;
  chinese?: unknown;
  pinyin?: unknown;
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
    const japanese = normalizeText(body.japanese, "japanese");
    const chinese = normalizeText(body.chinese, "chinese");
    const pinyin = normalizeText(body.pinyin, "pinyin", true);
    const payload = JSON.stringify({ direction, japanese, chinese, pinyin });
    inputChars = payload.length;

    await assertWithinDailyAiLimit(actor);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ApiRouteError("GEMINI_API_KEY が設定されていません", 500, "missing_gemini_api_key");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `${EXPLANATION_PROMPT}\n\n翻訳結果:\n${payload}`,
      config: { responseMimeType: "application/json" },
    });
    const text = response.text;
    if (!text) {
      throw new ApiRouteError("Gemini から空の応答が返りました", 502, "empty_gemini_response");
    }
    outputChars = text.length;
    const explanation = extractExplanation(text);

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
          const updated = await updateSupabasePhraseExplanation(
            accessToken,
            phraseId,
            explanation,
          );
          if (!updated) {
            await sleep(1000);
            await updateSupabasePhraseExplanation(accessToken, phraseId, explanation);
          }
        }
        const notionUpdated = await updatePhraseExplanation(phraseId, explanation);
        if (!notionUpdated) {
          await sleep(1000);
          await updatePhraseExplanation(phraseId, explanation);
        }
      } catch (saveError) {
        console.error("[/api/phrase/explain] save error", { requestId, saveError });
      }
    });

    return NextResponse.json({ requestId, phraseId, explanation });
  } catch (error) {
    const normalized = normalizeRouteError(error);
    console.error("[/api/phrase/explain] error", {
      requestId,
      code: normalized.code,
      error,
    });

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

function extractExplanation(text: string): string {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new ApiRouteError("Gemini からの応答に JSON が見つかりません", 502, "invalid_gemini_json");
  }
  const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as {
    explanation?: unknown;
  };
  if (typeof parsed.explanation !== "string" || !parsed.explanation.trim()) {
    throw new ApiRouteError("解説の生成結果が空です", 502, "empty_explanation");
  }
  return parsed.explanation.trim();
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
  if (value === "ja-to-zh" || value === "zh-to-ja") return value;
  throw new RequestValidationError("翻訳方向が正しくありません");
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
