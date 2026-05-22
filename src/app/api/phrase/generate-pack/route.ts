import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createId } from "@/lib/id";
import {
  getCategoryIdForScene,
  getPhrasePackLevelLabel,
  getPhrasePackSceneLabel,
  getPhrasePackToneLabel,
  getSceneCategoryHint,
  sanitizePhrasePackProfile,
} from "@/lib/personal-phrase-pack";
import { detectDuplicateInList } from "@/lib/phrase-dedupe";
import { recordAiUsageEvent } from "@/lib/server/supabase-admin";
import {
  assertWithinPhrasePackDailyLimit,
  identifyRequestActor,
  PhrasePackLimitError,
  UsageLimitError,
  UsageTrackingError,
  type RequestActor,
} from "@/lib/server/usage-limits";
import { RequestValidationError } from "@/lib/server/validation";
import { getBearerToken } from "@/lib/supabase";
import type {
  GeneratedPhrasePackItem,
  PhrasePackProfile,
  PhrasePackScene,
} from "@/lib/types";

export const runtime = "nodejs";

const ENDPOINT = "/api/phrase/generate-pack";
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const PACK_SIZE = 10;
const GENERATE_TARGET = 12;
const MAX_PHRASE_ATTEMPTS = 2;
const PHRASE_MAX_OUTPUT_TOKENS = 4096;
const CATEGORY_IDS = new Set([
  "poker-table",
  "floor",
  "restaurant",
  "transport",
  "hotel",
  "shopping",
  "work",
  "hospital",
  "other",
]);

type GeneratePackRequest = {
  profile?: unknown;
  existingChinese?: unknown;
};

type GeneratedPackResponse = {
  phrases?: unknown;
};

type PhraseCore = {
  direction: "ja-to-zh";
  japanese: string;
  chinese: string;
  pinyin: string;
  categoryId: string;
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

  try {
    const accessToken = getBearerToken(req);
    actor = await identifyRequestActor(req, accessToken);
    const body = await parseRequest(req);
    const profile = parseProfile(body.profile);
    const existingChinese = parseExistingChinese(body.existingChinese);
    const payload = { profile, existingChinese };
    inputChars = JSON.stringify(payload).length;

    await assertWithinPhrasePackDailyLimit(actor);

    const generated = await generatePhrasesOnly(profile, existingChinese);
    outputChars = generated.reduce(
      (sum, phrase) =>
        sum + phrase.japanese.length + phrase.chinese.length + phrase.pinyin.length,
      0,
    );

    await recordUsage({
      requestId,
      actor,
      inputChars,
      outputChars,
      success: true,
      errorCode: null,
    });

    return NextResponse.json({
      requestId,
      provider: "gemini",
      model: GEMINI_MODEL,
      phrases: generated.map((phrase) => ({
        id: createId(),
        ...phrase,
        explanation: "",
      })),
    });
  } catch (error) {
    const normalized = normalizeRouteError(error);
    console.error("[/api/phrase/generate-pack] error", {
      requestId,
      code: normalized.code,
      error,
    });

    if (actor) {
      await recordUsage({
        requestId,
        actor,
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

async function parseRequest(req: Request): Promise<GeneratePackRequest> {
  try {
    const raw = await req.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new RequestValidationError("リクエスト形式が正しくありません");
    }
    return raw as GeneratePackRequest;
  } catch (error) {
    if (error instanceof RequestValidationError) throw error;
    throw new RequestValidationError("JSON形式のリクエストを送ってください");
  }
}

function parseProfile(value: unknown): PhrasePackProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("質問への回答が正しくありません");
  }
  const profile = sanitizePhrasePackProfile(value as Partial<PhrasePackProfile>);
  if (!profile.scenes.length) {
    throw new RequestValidationError("場面を1つ以上選んでください");
  }
  return profile;
}

function parseExistingChinese(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 50);
}

async function generatePhrasesOnly(
  profile: PhrasePackProfile,
  existingChinese: string[],
): Promise<PhraseCore[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ApiRouteError("GEMINI_API_KEY が設定されていません", 500, "missing_gemini_api_key");
  }

  const ai = new GoogleGenAI({ apiKey });
  let lastError: ApiRouteError | null = null;
  let collected: PhraseCore[] = [];
  const seenChinese = [...existingChinese];

  for (let attempt = 1; attempt <= MAX_PHRASE_ATTEMPTS; attempt += 1) {
    try {
      const missingCount = Math.max(0, PACK_SIZE - collected.length);
      const targetCount = attempt === 1 ? GENERATE_TARGET : Math.max(missingCount + 2, 4);
      const text = await callGemini(
        ai,
        buildPhrasesPrompt(profile, seenChinese, attempt, targetCount),
        PHRASE_MAX_OUTPUT_TOKENS,
      );
      collected = mergePhraseResults(collected, parsePhrasesOnly(text, profile, seenChinese), seenChinese);
      if (collected.length >= PACK_SIZE) {
        return collected.slice(0, PACK_SIZE);
      }
      lastError = new ApiRouteError(
        "10件のフレーズを作れませんでした。もう一度お試しください。",
        502,
        "invalid_phrase_count",
      );
    } catch (error) {
      lastError = wrapParseError(error);
      console.error("[/api/phrase/generate-pack] phrase parse failed", {
        attempt,
        code: lastError.code,
        preview: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw lastError ?? new ApiRouteError(
    "10件のフレーズを作れませんでした。もう一度お試しください。",
    502,
    "invalid_phrase_count",
  );
}

async function callGemini(
  ai: GoogleGenAI,
  prompt: string,
  maxOutputTokens: number,
): Promise<string> {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      maxOutputTokens,
    },
  });

  const text = response.text;
  if (!text) {
    throw new ApiRouteError(
      "Gemini から空の応答が返りました",
      502,
      "empty_gemini_response",
    );
  }
  return text;
}

function mergePhraseResults(
  current: PhraseCore[],
  incoming: PhraseCore[],
  seenChinese: string[],
): PhraseCore[] {
  const merged = [...current];
  for (const phrase of incoming) {
    if (merged.length >= PACK_SIZE) break;
    if (detectDuplicateInList(phrase.chinese, seenChinese)) continue;
    if (merged.some((item) => detectDuplicateInList(phrase.chinese, [item.chinese]))) continue;
    seenChinese.push(phrase.chinese);
    merged.push(phrase);
  }
  return merged;
}

function wrapParseError(error: unknown): ApiRouteError {
  if (error instanceof ApiRouteError) return error;
  return new ApiRouteError(
    "生成結果の解析に失敗しました",
    502,
    "invalid_gemini_response",
  );
}

function buildPhrasesPrompt(
  profile: PhrasePackProfile,
  seenChinese: string[],
  attempt: number,
  targetCount: number,
): string {
  const isAutoScene = profile.scenes.includes("auto");
  const sceneLabels = profile.scenes.map(getPhrasePackSceneLabel);
  const categoryHints = isAutoScene
    ? "お任せ: 食事・買い物・移動・ホテル・日常会話など、汎用的で使いやすい表現をバランスよく"
    : profile.scenes.map((scene) => getSceneCategoryHint(scene)).join("\n- ");
  const levelGuide = getLevelGuide(profile.level);
  const retryNote =
    attempt > 1
      ? `\n重要: 前回は件数不足でした。不足分を含めて必ず phrases 配列に${targetCount}件入れてください。`
      : "";

  return `あなたは、中国語圏の実生活・旅行・仕事・ライブポーカーの現場で使う表現に詳しい実践的な中国語コーチです。

目的:
日本人ユーザーが近い将来そのまま口に出せる、中国語フレーズ${targetCount}件を作る。
一般教材ではなく、ユーザー回答に合う具体的なパックにする。
explanation はこの段階では不要。フレーズ本体だけ返す。
${retryNote}

ユーザー回答:
- 使う場面: ${sceneLabels.join("、")}
- 中国語レベル: ${getPhrasePackLevelLabel(profile.level)}（${levelGuide}）
- 言い方の希望: ${getPhrasePackToneLabel(profile.tone)}
- 具体状況: ${profile.details || "未入力"}

カテゴリ対応:
- ${categoryHints}

既にユーザーが持つ中国語表現（重複して出さない）:
${seenChinese.length ? seenChinese.map((item) => `- ${item}`).join("\n") : "- なし"}

生成ルール:
- 必ず${targetCount}件作る
- direction は全件 "ja-to-zh"
- 中国語は簡体字、ピンインは声調記号付き
- 日本語は自然な日本語で、ユーザーが言いたい内容にする
- 中国語はユーザーのレベルに合わせる。初心者向けなら短く、仕事/生活レベルなら必要に応じて少し詳しくする
- 言い方の希望を優先する。短く通じる/自然/丁寧/詳しく説明/おまかせを反映する
- ${targetCount}件の意味を被らせない。言い換えだけで数を増やさない
- 場面が複数ある場合は、選ばれた場面にバランスよく配分する
- categoryId は上のカテゴリ対応から選ぶ。迷う場合は "other"
- 過度に乱暴・失礼・性的・差別的・政治的な表現は禁止
- JSONを途中で切らない。phrases 配列は必ず ${targetCount} 件完結させる

必ずJSONのみを返す。Markdownコードブロックは禁止。
{
  "phrases": [
    {
      "direction": "ja-to-zh",
      "japanese": "日本語",
      "chinese": "中国語（簡体字）",
      "pinyin": "ピンイン（声調記号付き）",
      "categoryId": "restaurant"
    }
  ]
}`;
}

function parsePhrasesOnly(
  text: string,
  profile: PhrasePackProfile,
  seenChinese: string[],
): PhraseCore[] {
  const parsed = extractJson(text) as GeneratedPackResponse;
  if (!Array.isArray(parsed.phrases)) {
    throw new ApiRouteError("生成結果に phrases が含まれていません", 502, "invalid_gemini_response");
  }

  const fallbackCategory = getFallbackCategory(profile);
  const output: PhraseCore[] = [];
  const previousChinese = [...seenChinese];

  for (const raw of parsed.phrases) {
    if (output.length >= PACK_SIZE) break;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    try {
      const phrase = normalizePhraseCore(raw as Partial<GeneratedPhrasePackItem>, fallbackCategory);
      const duplicate = detectDuplicateInList(phrase.chinese, previousChinese);
      if (duplicate) continue;
      previousChinese.push(phrase.chinese);
      output.push(phrase);
    } catch {
      continue;
    }
  }

  return output;
}

function getFallbackCategory(profile: PhrasePackProfile): string {
  const scene = profile.scenes.find((item) => item !== "auto");
  if (!scene) return "other";
  return getCategoryIdForScene(scene as PhrasePackScene) ?? "other";
}

function normalizePhraseCore(
  item: Partial<GeneratedPhrasePackItem>,
  fallbackCategory: string,
): PhraseCore {
  const japanese = normalizeText(item.japanese, "japanese", 120);
  const chinese = normalizeText(item.chinese, "chinese", 80);
  const pinyin = normalizeText(item.pinyin, "pinyin", 120);
  const categoryId =
    typeof item.categoryId === "string" && CATEGORY_IDS.has(item.categoryId)
      ? item.categoryId
      : fallbackCategory;

  return {
    direction: "ja-to-zh",
    japanese,
    chinese,
    pinyin,
    categoryId,
  };
}

function getLevelGuide(level: PhrasePackProfile["level"]): string {
  switch (level) {
    case "entry":
      return "単語や短い定型句中心。中国語は5〜8字程度";
    case "basic":
      return "日常場面の短い文。中国語は8〜12字程度";
    case "intermediate":
      return "自然な会話文。中国語は12〜18字程度";
    case "advanced":
      return "仕事や複雑な確認も想定。必要なら少し長め";
    default:
      return "日常場面の短い文";
  }
}

function normalizeText(value: unknown, field: string, maxChars: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiRouteError(`生成結果の ${field} が空です`, 502, "invalid_gemini_response");
  }
  return value.trim().slice(0, maxChars);
}

function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const jsonStart = cleaned.indexOf("{");
  if (jsonStart < 0) {
    throw new ApiRouteError("Gemini からの応答に JSON が見つかりません", 502, "invalid_gemini_response");
  }

  const candidates = [
    cleaned.slice(jsonStart, cleaned.lastIndexOf("}") + 1),
    cleaned.slice(jsonStart),
    repairTruncatedJson(cleaned.slice(jsonStart)),
  ].filter((candidate) => candidate.length > 1);

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function repairTruncatedJson(text: string): string {
  let repaired = text.trim();
  repaired = repaired.replace(/,\s*"[^"]*"?\s*:?\s*"[^"]*$/, "");
  repaired = repaired.replace(/,\s*\{[^}]*$/, "");
  repaired = repaired.replace(/,\s*$/, "");

  const openBraces = (repaired.match(/\{/g) ?? []).length;
  const closeBraces = (repaired.match(/\}/g) ?? []).length;
  const openBrackets = (repaired.match(/\[/g) ?? []).length;
  const closeBrackets = (repaired.match(/\]/g) ?? []).length;

  repaired += "]".repeat(Math.max(0, openBrackets - closeBrackets));
  repaired += "}".repeat(Math.max(0, openBraces - closeBraces));
  return repaired;
}

async function recordUsage(input: {
  requestId: string;
  actor: RequestActor;
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
    feature: "translation",
    provider: "gemini",
    mode: "phrase_pack",
    sourcePage: "drill",
    direction: "ja-to-zh",
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
  if (
    error instanceof UsageLimitError ||
    error instanceof UsageTrackingError ||
    error instanceof PhrasePackLimitError
  ) {
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
