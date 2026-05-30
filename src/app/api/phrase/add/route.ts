import { after, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createId } from "@/lib/id";
import { formatExplanationForReading } from "@/lib/explanation-format";
import { buildGeneratedPhrase, getLanguageLabel, parseDirection } from "@/lib/languages";
import { createPhrase } from "@/lib/notion";
import { createSupabasePhrase, getBearerToken } from "@/lib/supabase";
import { translateWithAzure } from "@/lib/server/azure-translator";
import { DEEPL_MODEL, translateWithDeepL } from "@/lib/server/deepl-translator";
import { recordAiUsageEvent } from "@/lib/server/supabase-admin";
import {
  assertWithinDailyAiLimit,
  identifyRequestActor,
  incrementDailyAiUsageCache,
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
type UsageRecordInput = {
  requestId: string;
  actor: RequestActor;
  validated: ValidatedPhraseAddRequest | null;
  generationMode: GenerationMode | null;
  provider: TranslationProvider | null;
  outputChars: number;
  success: boolean;
  errorCode: string | null;
};
type RouteTiming = Record<string, number | string | null>;

const SYSTEM_PROMPT = `あなたは、中国語圏での実生活・旅行・仕事・日常会話に詳しい実践的な中国語コーチです。

ユーザーは日本人の中国語学習者（中国語は初中級）で、現場で言いたかった日本語フレーズを記録しています。
目的は、教科書中国語ではなく、次に同じ場面が来た時に短く自然に口から出せる表現を身に付けることです。

ルール:
- 出力は最も自然で実用的な普通話 1 パターンのみ
- 初中級者が覚えやすい表現を優先
- 教科書的すぎる直訳は避け、ネイティブが現場で実際に使う言い方に寄せる
- ホテル、タクシー、レストラン、買い物、仕事など場面を踏まえる
- 過度に乱暴・失礼な表現は避ける
- 中国語は簡体字、ピンインは声調記号付き
- explanation は必ず日本語。スマホで読み返せるマークダウン風の解説にする
- explanation には以下の5つの見出しを必ず含める
  ## 単語分解と直訳の構造
  ## ニュアンスと適切な場面
  ## 入れ替えテンプレ
  ## 想定される相手の返答
  ## 類似・関連フレーズ
- 見出しは必ず単独行にする
- 各見出しの本文は「- 」で始まる箇条書き1〜2個にする
- 1つの箇条書きは1文だけにし、長い説明は行を分ける
- ただし「想定される相手の返答」「返答するときの例」「類似・関連フレーズ」は箇条書きにせず、例を必ず2つにする
- 上記の例は「学習対象言語（英語や中国語など）の文」→「日本語訳」の2行にし、1例目と2例目の間に1行空ける
- 中国語の例は「中国語の文」→「声調記号付きピンイン」→「日本語訳」の3行にする
- 中国語例のピンインは括弧で囲まない
- 上記の日本語訳は括弧で囲まない
- 各セクションの間は必ず1行空ける
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

const ZH_TO_JA_PROMPT = `あなたは、中国語圏で実生活・旅行・仕事・日常会話に困っている日本人を助ける実践的な中国語コーチです。

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
  ## 類似・関連フレーズ
- 見出しは必ず単独行にする
- 各見出しの本文は「- 」で始まる箇条書き1〜2個にする
- 1つの箇条書きは1文だけにし、長い説明は行を分ける
- ただし「想定される相手の返答」「返答するときの例」「類似・関連フレーズ」は箇条書きにせず、例を必ず2つにする
- 上記の例は「学習対象言語（英語や中国語など）の文」→「日本語訳」の2行にし、1例目と2例目の間に1行空ける
- 中国語の例は「中国語の文」→「声調記号付きピンイン」→「日本語訳」の3行にする
- 中国語例のピンインは括弧で囲まない
- 上記の日本語訳は括弧で囲まない
- 各セクションの間は必ず1行空ける
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

function extractJson(
  text: string,
  direction: GeneratedPhrase["direction"],
  inputText: string,
): GeneratedPhrase {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error("Gemini からの応答に JSON が見つかりません");
  }
  const slice = trimmed.slice(jsonStart, jsonEnd + 1);
  const parsed = JSON.parse(slice) as Partial<GeneratedPhrase>;
  const { sourceLanguage, targetLanguage } = parseDirection(direction);
  const sourceText =
    parsed.sourceText ??
    (sourceLanguage === "ja" ? parsed.japanese : undefined) ??
    (sourceLanguage === "zh" ? parsed.chinese : undefined) ??
    inputText;
  const targetText =
    parsed.targetText ??
    (targetLanguage === "ja" ? parsed.japanese : undefined) ??
    (targetLanguage === "zh" ? parsed.chinese : undefined) ??
    parsed.chinese;
  if (!targetText) {
    throw new Error("生成結果に必須フィールドが含まれていません");
  }
  return buildGeneratedPhrase({
    direction,
    sourceText,
    targetText,
    reading: parsed.reading ?? parsed.pinyin ?? "",
    explanation: formatExplanationForReading(parsed.explanation ?? ""),
  });
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
  let generationMode: GenerationMode | null = null;
  let outputChars = 0;
  const timingEnabled = isTimingEnabled(req);
  const timingStartedAt = Date.now();
  const timing: RouteTiming = {};
  const measure = async <T>(name: string, task: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    try {
      return await task();
    } finally {
      if (timingEnabled) timing[`${name}Ms`] = Date.now() - startedAt;
    }
  };
  const measureSync = <T>(name: string, task: () => T): T => {
    const startedAt = Date.now();
    try {
      return task();
    } finally {
      if (timingEnabled) timing[`${name}Ms`] = Date.now() - startedAt;
    }
  };

  try {
    const accessToken = getBearerToken(req);
    actor = await measure("identifyActor", () => identifyRequestActor(req, accessToken));

    let rawBody: unknown;
    try {
      rawBody = await measure("parseBody", () => req.json());
    } catch {
      throw new RequestValidationError("JSON形式のリクエストを送ってください");
    }

    validated = measureSync("validate", () => validatePhraseAddRequest(parseJsonObject(rawBody)));
    generationMode = measureSync("parseMode", () =>
      parseGenerationMode((rawBody as { generationMode?: unknown }).generationMode),
    );
    const persist = measureSync(
      "parsePersist",
      () => (rawBody as { persist?: unknown }).persist !== false,
    );
    await measure("quotaCheck", () => assertWithinDailyAiLimit(actor!));

    const { generated, provider } = await measure("translate", () =>
      translateByMode(generationMode!, validated!, timingEnabled ? timing : null),
    );
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

    queueUsageRecord({
      requestId,
      actor,
      validated: request,
      generationMode,
      provider,
      outputChars,
      success: true,
      errorCode: null,
    }, timingEnabled);

    if (persist) {
      after(async () => {
        try {
          const phrase = {
            id: request.phraseId,
            japanese: generated.japanese,
            chinese: generated.chinese,
            pinyin: generated.pinyin,
            sourceLanguage: generated.sourceLanguage,
            targetLanguage: generated.targetLanguage,
            sourceText: generated.sourceText,
            targetText: generated.targetText,
            reading: generated.reading,
            readingType: generated.readingType,
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
            sourceLanguage: generated.sourceLanguage,
            targetLanguage: generated.targetLanguage,
            sourceText: generated.sourceText,
            targetText: generated.targetText,
            reading: generated.reading,
            readingType: generated.readingType,
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

    const finalTiming = finishTiming(timingEnabled, timingStartedAt, timing, {
      mode: generationMode,
      provider,
      persist: persist ? "true" : "false",
    });
    if (finalTiming) {
      console.log("[/api/phrase/add] timing", { requestId, ...finalTiming });
    }

    return NextResponse.json({
      id: request.phraseId,
      requestId,
      provider,
      model: providerModel(provider),
      ...generated,
      audioUrl: null,
      ...(finalTiming ? { timing: finalTiming } : {}),
    });
  } catch (error) {
    const normalized = normalizeRouteError(error);
    const finalTiming = finishTiming(timingEnabled, timingStartedAt, timing, {
      mode: generationMode,
      provider: null,
      persist: null,
      errorCode: normalized.code,
    });
    console.error("[/api/phrase/add] error", {
      requestId,
      code: normalized.code,
      timing: finalTiming,
      error,
    });

    if (actor) {
      queueUsageRecord({
        requestId,
        actor,
        validated,
        generationMode,
        provider: null,
        outputChars,
        success: false,
        errorCode: normalized.code,
      }, timingEnabled);
    }

    return NextResponse.json(
      { error: normalized.message, requestId, ...(finalTiming ? { timing: finalTiming } : {}) },
      { status: normalized.status },
    );
  }
}

function queueUsageRecord(input: UsageRecordInput, timingEnabled: boolean): void {
  const queuedAt = Date.now();
  incrementDailyAiUsageCache(input.actor);
  after(async () => {
    const startedAt = Date.now();
    try {
      await recordUsage(input);
    } catch (error) {
      console.error("[/api/phrase/add] usage record error", {
        requestId: input.requestId,
        error,
      });
    } finally {
      if (timingEnabled) {
        console.log("[/api/phrase/add] after timing", {
          requestId: input.requestId,
          usageLogDelayMs: startedAt - queuedAt,
          usageLogMs: Date.now() - startedAt,
        });
      }
    }
  });
}

async function recordUsage(input: UsageRecordInput) {
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

function isTimingEnabled(req: Request): boolean {
  if (process.env.DEBUG_TRANSLATION_TIMING === "1") return true;
  return process.env.NODE_ENV !== "production" && req.headers.get("x-debug-timing") === "1";
}

function finishTiming(
  enabled: boolean,
  startedAt: number,
  timing: RouteTiming,
  extra: Record<string, string | null>,
): RouteTiming | null {
  if (!enabled) return null;
  return {
    totalMs: Date.now() - startedAt,
    ...extra,
    ...timing,
  };
}

async function translateByMode(
  mode: GenerationMode,
  validated: ValidatedPhraseAddRequest,
  timing: RouteTiming | null,
): Promise<{
  generated: GeneratedPhrase;
  provider: TranslationProvider;
}> {
  switch (mode) {
    case "speed": {
      const startedAt = Date.now();
      const generated = await translateWithAzure({
        direction: validated.direction,
        text: validated.inputText,
        skipPinyin: true,
      });
      if (timing) timing.azureMs = Date.now() - startedAt;
      return {
        generated,
        provider: "azure",
      };
    }
    case "normal":
      return translateNormal(validated, timing);
    case "quality": {
      const startedAt = Date.now();
      const generated = await generateWithGemini(validated);
      if (timing) timing.geminiMs = Date.now() - startedAt;
      return {
        generated,
        provider: "gemini",
      };
    }
  }
}

async function translateNormal(
  validated: ValidatedPhraseAddRequest,
  timing: RouteTiming | null,
): Promise<{
  generated: GeneratedPhrase;
  provider: Extract<TranslationProvider, "deepl" | "azure">;
}> {
  if (process.env.DEEPL_API_KEY) {
    const deeplStartedAt = Date.now();
    try {
      const generated = await translateWithDeepL({
        direction: validated.direction,
        text: validated.inputText,
      });
      if (timing) {
        timing.deeplMs = Date.now() - deeplStartedAt;
        timing.normalPrimary = "deepl";
      }
      return { generated, provider: "deepl" };
    } catch (error) {
      if (timing) {
        timing.deeplMs = Date.now() - deeplStartedAt;
        timing.deeplStatus = "failed";
        timing.deeplError = getTimingErrorMessage(error);
      }
      console.warn("[/api/phrase/add] DeepL failed, falling back to Azure", {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  const azureStartedAt = Date.now();
  const generated = await translateWithAzure({
    direction: validated.direction,
    text: validated.inputText,
    skipPinyin: true,
  });
  if (timing) {
    timing.azureMs = Date.now() - azureStartedAt;
    timing.normalFallback = "azure";
  }
  return { generated, provider: "azure" };
}

function getTimingErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 180);
}

async function generateWithGemini(
  validated: ValidatedPhraseAddRequest,
): Promise<GeneratedPhrase> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ApiRouteError("GEMINI_API_KEY が設定されていません", 500, "missing_gemini_api_key");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildQualityPrompt(validated);

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
  return extractJson(text, validated.direction, validated.inputText);
}

function buildQualityPrompt(validated: ValidatedPhraseAddRequest): string {
  const { sourceLanguage, targetLanguage } = parseDirection(validated.direction);
  if (sourceLanguage === "zh" && targetLanguage === "ja") return ZH_TO_JA_PROMPT;
  if (sourceLanguage === "ja" && targetLanguage === "zh") return SYSTEM_PROMPT;

  const sourceLabel = getLanguageLabel(sourceLanguage);
  const targetLabel = getLanguageLabel(targetLanguage);
  const explanationSections =
    targetLanguage === "ja"
      ? `【意味】
【使用する場面】
【返答するときの例】
【類似・関連フレーズ】`
      : `【単語分解と骨組み】
【使用する場面】
【他の自然な言い方】
【相手の想定返答】
【類似・関連フレーズ】`;
  return `あなたは、海外での実生活・旅行・仕事・日常会話に詳しい実践的な語学コーチです。

ユーザーは${sourceLabel}から${targetLabel}へ、現場で使うフレーズを翻訳し、後で復習できる形で保存しようとしています。

ルール:
- 教科書的すぎる直訳は避け、現場で自然に使える表現を1つだけ返す
- ホテル、タクシー、レストラン、買い物、仕事などの場面を踏まえる
- 過度に乱暴・失礼な表現は避ける
- explanation は必ず日本語で、スマホで読み返しやすくする
- explanation には以下の見出しを必ずこの順番で含める
${explanationSections}
- 見出しは必ず単独行にする
- 各見出しの本文は「- 」で始まる箇条書き1〜2個にする
- 1つの箇条書きは1文だけにし、長い説明は行を分ける
- ただし【他の自然な言い方】【相手の想定返答】【返答するときの例】【類似・関連フレーズ】は箇条書きにせず、例を必ず2つにする
- 上記の例は「学習対象言語（英語や中国語など）の文」→「日本語訳」の2行にし、1例目と2例目の間に1行空ける
- 中国語の例は「中国語の文」→「声調記号付きピンイン」→「日本語訳」の3行にする
- 中国語例のピンインは括弧で囲まない
- 上記の日本語訳は括弧で囲まない
- 各セクションの間は必ず1行空ける
- 画面上に表示される全文対訳を explanation 内で繰り返さない
- 必ず JSON のみを返す。前後の文章や Markdown コードブロックは禁止。

{
  "direction": "${validated.direction}",
  "sourceLanguage": "${sourceLanguage}",
  "targetLanguage": "${targetLanguage}",
  "sourceText": "入力文",
  "targetText": "自然な翻訳",
  "reading": "",
  "readingType": "none",
  "explanation": "日本語の短い解説"
}`;
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
