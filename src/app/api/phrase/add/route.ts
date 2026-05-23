import { after, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createId } from "@/lib/id";
import { createPhrase } from "@/lib/notion";
import { createSupabasePhrase, getBearerToken } from "@/lib/supabase";
import { translateWithAzure } from "@/lib/server/azure-translator";
import { DEEPL_MODEL, translateWithDeepL } from "@/lib/server/deepl-translator";
import { recordAiUsageEvent } from "@/lib/server/supabase-admin";
import {
  assertWithinDailyAiLimit,
  identifyRequestActor,
  UsageLimitError,
  UsageTrackingError,
  type RequestActor,
} from "@/lib/server/usage-limits";
import {
  parseJsonObject,
  RequestValidationError,
  validatePhraseAddRequest,
  type ValidatedPhraseAddRequest,
} from "@/lib/server/validation";
import type { GeneratedPhrase } from "@/lib/types";

export const runtime = "nodejs";

const ENDPOINT = "/api/phrase/add";
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const AZURE_TRANSLATOR_MODEL = "azure-translator-text-v3";
import type { GenerationMode } from "@/lib/generation-mode";
import { parseGenerationMode } from "@/lib/generation-mode";
type TranslationProvider = "azure" | "deepl" | "gemini";

const SYSTEM_PROMPT = `あなたは、マカオ・中国本土・台湾を含む中国語圏での実生活、ライブポーカー、カジノ、旅行会話に詳しい実践的な中国語コーチです。

ユーザーは日本人のライブポーカープレイヤー（中国語は初中級）で、現場で言いたかった日本語フレーズを記録しています。
目的は、教科書中国語ではなく、次に同じ場面が来た時に短く自然に口から出せる表現を身に付けることです。

ルール:
- 出力は最も自然で実用的な普通話 1 パターンのみ
- 初中級者が覚えやすい短い表現を優先
- 教科書的すぎる直訳は避け、ネイティブが現場で実際に使う言い方に寄せる
- ポーカー卓上、ホテル、タクシー、レストランなど場面を踏まえる
- 過度に乱暴・失礼な表現は避ける
- 中国語は簡体字、ピンインは声調記号付き
- explanation は必ず日本語。スマホで読み返せるマークダウン風の解説にする
- explanation には以下の6つの見出しを必ず含める
  ## 単語分解と直訳の構造
  ## ニュアンスと適切な場面
  ## 入れ替えテンプレ
  ## 想定される相手の返答
  ## 発音のコツ・注意点
  ## 類似・関連フレーズ
- 各見出しは1〜3行で、短くても実践的にする
- 画面上にすでに表示されている翻訳ペア（日本語↔中国語の全文対訳）を explanation 内で繰り返さない
- explanation の中で中国語（簡体字）を書いた場合は、必ず直後に半角括弧で声調記号付きピンインを添えること。例外なし
  良い例: 「再来一杯(zài lái yī bēi)」「好的，马上来(hǎo de, mǎshàng lái)」
  悪い例: 「再来一杯」だけでピンインを省略する
  これは入れ替えテンプレ・想定される相手の返答・類似/関連フレーズなど、すべての見出しに適用する
- 単語分解で個々の漢字や語を示すときも、後ろに(ピンイン)を必ず付ける

必ず以下の JSON 形式のみを返答してください。前後の文章や Markdown コードブロックは禁止。

{
  "direction": "ja-to-zh",
  "japanese": "ユーザー入力の日本語",
  "chinese": "中国語（簡体字）",
  "pinyin": "ピンイン（声調記号付き）",
  "explanation": "日本語の短い解説"
}`;

const ZH_TO_JA_PROMPT = `あなたは、中国語圏で実生活・ライブポーカー・カジノ・旅行・仕事の会話に困っている日本人を助ける実践的な中国語コーチです。

ユーザーは、聞き取った中国語や見かけた中国語の意味を確認し、それを後で見返せる形で保存しようとしています。

ルール:
- 入力された中国語を自然な日本語に訳す
- 中国語は簡体字で整える。繁体字や誤字があれば自然な普通話として補正してよい
- ピンインは声調記号付き
- explanation は必ず日本語
- explanation には以下の見出しを含める
  ## 意味
  ## ニュアンスと使われる場面
  ## 返答するときの例
  ## 発音のコツ・注意点
  ## 類似・関連フレーズ
- 画面上にすでに表示されている翻訳ペア（日本語↔中国語の全文対訳）を explanation 内で繰り返さない
- explanation の中で中国語（簡体字）を書いた場合は、必ず直後に半角括弧で声調記号付きピンインを添えること

必ず以下の JSON 形式のみを返答してください。前後の文章や Markdown コードブロックは禁止。

{
  "direction": "zh-to-ja",
  "japanese": "自然な日本語訳",
  "chinese": "入力中国語を自然に整えたもの",
  "pinyin": "ピンイン（声調記号付き）",
  "explanation": "日本語の短い解説"
}`;

function extractJson(text: string): GeneratedPhrase {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error("Gemini からの応答に JSON が見つかりません");
  }
  const slice = trimmed.slice(jsonStart, jsonEnd + 1);
  const parsed = JSON.parse(slice) as Partial<GeneratedPhrase>;
  if (!parsed.chinese || !parsed.pinyin) {
    throw new Error("生成結果に必須フィールドが含まれていません");
  }
  return {
    direction: parsed.direction === "zh-to-ja" ? "zh-to-ja" : "ja-to-zh",
    japanese: parsed.japanese ?? "",
    chinese: parsed.chinese,
    pinyin: parsed.pinyin,
    explanation: parsed.explanation ?? "",
  };
}

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
  let validated: ValidatedPhraseAddRequest | null = null;
  let outputChars = 0;

  try {
    const accessToken = getBearerToken(req);
    actor = await identifyRequestActor(req, accessToken);

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      throw new RequestValidationError("JSON形式のリクエストを送ってください");
    }

    validated = validatePhraseAddRequest(parseJsonObject(rawBody));
    const generationMode = parseGenerationMode(
      (rawBody as { generationMode?: unknown }).generationMode,
    );
    const persist = (rawBody as { persist?: unknown }).persist !== false;
    await assertWithinDailyAiLimit(actor);

    const { generated, provider } = await translateByMode(generationMode, validated);
    outputChars =
      generated.japanese.length +
      generated.chinese.length +
      generated.pinyin.length +
      generated.explanation.length;
    generated.direction = validated.direction;
    if (!generated.japanese) {
      generated.japanese = validated.direction === "ja-to-zh" ? validated.inputText : "";
    }
    if (!generated.chinese && validated.direction === "zh-to-ja") {
      generated.chinese = validated.inputText;
    }
    const request = validated;

    await recordUsage({
      requestId,
      actor,
      validated: request,
      generationMode,
      provider,
      outputChars,
      success: true,
      errorCode: null,
    });

    if (persist) {
      after(async () => {
        try {
          const phrase = {
            id: request.phraseId,
            japanese: generated.japanese,
            chinese: generated.chinese,
            pinyin: generated.pinyin,
            explanation: generated.explanation,
            audioUrl: null,
            direction: request.direction,
            categoryId: request.categoryId,
            shouldDrill: request.shouldDrill,
            source: request.source,
            usedAt: request.source === "conversation" ? new Date().toISOString() : null,
          };
          if (accessToken) {
            await createSupabasePhrase(accessToken, phrase);
          }
          await createPhrase({
            phraseId: request.phraseId,
            japanese: generated.japanese,
            chinese: generated.chinese,
            pinyin: generated.pinyin,
            explanation: generated.explanation,
            ownerKey: request.ownerKey,
            nickname: request.nickname,
            direction: request.direction,
            categoryId: request.categoryId,
            shouldDrill: request.shouldDrill,
            source: request.source,
          });
        } catch (saveError) {
          console.error("[/api/phrase/add] save error", { requestId, saveError });
        }
      });
    }

    return NextResponse.json({
      id: request.phraseId,
      requestId,
      provider,
      model: providerModel(provider),
      ...generated,
      audioUrl: null,
    });
  } catch (error) {
    const normalized = normalizeRouteError(error);
    console.error("[/api/phrase/add] error", {
      requestId,
      code: normalized.code,
      error,
    });

    if (actor) {
      await recordUsage({
        requestId,
        actor,
        validated,
        generationMode: null,
        provider: null,
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

async function recordUsage(input: {
  requestId: string;
  actor: RequestActor;
  validated: ValidatedPhraseAddRequest | null;
  generationMode: GenerationMode | null;
  provider: TranslationProvider | null;
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
    feature: "translation",
    provider: input.provider,
    mode: input.generationMode,
    sourcePage: input.validated?.source === "conversation" ? "conversation" : "add",
    direction: input.validated?.direction ?? null,
    inputChars: input.validated?.inputText.length ?? 0,
    outputChars: input.outputChars,
    audioDurationMs: null,
    success: input.success,
    errorCode: input.errorCode,
    model: input.provider ? providerModel(input.provider) : null,
  });
}

async function translateByMode(
  mode: GenerationMode,
  validated: ValidatedPhraseAddRequest,
): Promise<{
  generated: GeneratedPhrase;
  provider: TranslationProvider;
}> {
  switch (mode) {
    case "speed":
      return {
        generated: await translateWithAzure({
          direction: validated.direction,
          text: validated.inputText,
          skipPinyin: true,
        }),
        provider: "azure",
      };
    case "normal":
      return translateNormal(validated);
    case "quality":
      return {
        generated: await generateWithGemini(validated),
        provider: "gemini",
      };
  }
}

async function translateNormal(validated: ValidatedPhraseAddRequest): Promise<{
  generated: GeneratedPhrase;
  provider: Extract<TranslationProvider, "deepl" | "azure">;
}> {
  if (process.env.DEEPL_API_KEY) {
    try {
      const generated = await translateWithDeepL({
        direction: validated.direction,
        text: validated.inputText,
      });
      return { generated, provider: "deepl" };
    } catch (error) {
      console.warn("[/api/phrase/add] DeepL failed, falling back to Azure", {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  const generated = await translateWithAzure({
    direction: validated.direction,
    text: validated.inputText,
    skipPinyin: true,
  });
  return { generated, provider: "azure" };
}

async function generateWithGemini(
  validated: ValidatedPhraseAddRequest,
): Promise<GeneratedPhrase> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ApiRouteError("GEMINI_API_KEY が設定されていません", 500, "missing_gemini_api_key");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt =
    validated.direction === "zh-to-ja" ? ZH_TO_JA_PROMPT : SYSTEM_PROMPT;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: `${prompt}\n\n入力:\n「${validated.inputText}」`,
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text;
  if (!text) {
    throw new ApiRouteError("Gemini から空の応答が返りました", 502, "empty_gemini_response");
  }
  return extractJson(text);
}

function providerModel(provider: TranslationProvider): string {
  switch (provider) {
    case "deepl":
      return DEEPL_MODEL;
    case "azure":
      return AZURE_TRANSLATOR_MODEL;
    case "gemini":
      return GEMINI_MODEL;
  }
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
