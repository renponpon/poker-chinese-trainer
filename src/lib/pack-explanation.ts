import { GoogleGenAI } from "@google/genai";

export const PACK_EXPLANATION_GEMINI_MODEL = "gemini-3.1-flash-lite";
export const PACK_EXPLANATION_BATCH_SIZE = 4;
const SINGLE_EXPLANATION_MAX_OUTPUT_TOKENS = 4096;
const BATCH_EXPLANATION_MAX_OUTPUT_TOKENS = 16384;

const REQUIRED_HEADINGS = [
  "【単語分解と骨組み】",
  "【使用する場面】",
  "【他の自然な言い方】",
  "【相手の想定返答】",
  "【発音のコツ】",
  "【類似・関連フレーズ】",
];

export type PackExplanationInput = {
  japanese: string;
  chinese: string;
  pinyin: string;
};

export async function generatePackExplanations(
  ai: GoogleGenAI,
  phrases: PackExplanationInput[],
): Promise<string[]> {
  if (!phrases.length) return [];

  const results = new Array<string>(phrases.length);
  for (let index = 0; index < phrases.length; index += PACK_EXPLANATION_BATCH_SIZE) {
    const batch = phrases.slice(index, index + PACK_EXPLANATION_BATCH_SIZE);
    const batchResults = await generatePackExplanationBatch(ai, batch);
    for (let offset = 0; offset < batchResults.length; offset += 1) {
      results[index + offset] = batchResults[offset];
    }
  }
  return results;
}

async function generatePackExplanationBatch(
  ai: GoogleGenAI,
  phrases: PackExplanationInput[],
): Promise<string[]> {
  if (phrases.length === 1) {
    return [await generatePackExplanation(ai, phrases[0])];
  }

  try {
    const response = await ai.models.generateContent({
      model: PACK_EXPLANATION_GEMINI_MODEL,
      contents: buildBatchExplanationPrompt(phrases),
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: BATCH_EXPLANATION_MAX_OUTPUT_TOKENS,
      },
    });
    const text = response.text;
    if (text) {
      const parsed = parseBatchExplanations(text, phrases);
      if (parsed.length === phrases.length) return parsed;
    }
  } catch (error) {
    console.error("[pack-explanation] batch generation failed", {
      count: phrases.length,
      preview: error instanceof Error ? error.message : String(error),
    });
  }

  return Promise.all(phrases.map((phrase) => generatePackExplanation(ai, phrase)));
}

export async function generatePackExplanation(
  ai: GoogleGenAI,
  phrase: PackExplanationInput,
): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: PACK_EXPLANATION_GEMINI_MODEL,
      contents: buildSingleExplanationPrompt(phrase),
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: SINGLE_EXPLANATION_MAX_OUTPUT_TOKENS,
      },
    });
    const text = response.text;
    if (!text) return buildTemplateExplanation(phrase);

    const parsed = extractJson(text) as { explanation?: unknown };
    const explanation = ensureExplanationHeadings(
      normalizeOptionalText(parsed.explanation, 4000),
      phrase,
    );
    if (explanation.trim()) return explanation;
  } catch (error) {
    console.error("[pack-explanation] generation failed", {
      japanese: phrase.japanese,
      preview: error instanceof Error ? error.message : String(error),
    });
  }

  return buildTemplateExplanation(phrase);
}

function buildBatchExplanationPrompt(phrases: PackExplanationInput[]): string {
  const phraseList = phrases
    .map(
      (phrase, index) =>
        `${index + 1}. 日本語: ${phrase.japanese}\n   中国語: ${phrase.chinese}\n   ピンイン: ${phrase.pinyin}`,
    )
    .join("\n");

  return `あなたは、マカオ・中国語圏での実生活、旅行・仕事会話に詳しい実践的な中国語コーチです。

次の${phrases.length}件のフレーズについて、スマホで見返しやすい日本語解説を作る。
入力順と同じ順序で、必ず${phrases.length}件返す。

フレーズ一覧:
${phraseList}

ルール:
- explanation は必ず日本語
- 各セクションの間は必ず1行空ける
- 中国語（簡体字）を書いた場合は、必ず直後に半角括弧で声調記号付きピンインを添える
- 各 explanation には以下の6見出しをこの表記のまま必ず含める
  【単語分解と骨組み】
  【使用する場面】
  【他の自然な言い方】
  【相手の想定返答】
  【発音のコツ】
  【類似・関連フレーズ】
- 各見出しは2〜3行程度に収める
- JSONを途中で切らない

必ずJSONのみを返す。
{
  "explanations": [
    { "explanation": "日本語解説" }
  ]
}`;
}

function parseBatchExplanations(
  text: string,
  phrases: PackExplanationInput[],
): string[] {
  const parsed = extractJson(text) as { explanations?: unknown };
  if (!Array.isArray(parsed.explanations)) {
    throw new SyntaxError("explanations array missing");
  }

  const output: string[] = [];
  for (let index = 0; index < phrases.length; index += 1) {
    const phrase = phrases[index];
    const raw = parsed.explanations[index];
    const explanationRaw =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as { explanation?: unknown }).explanation
        : undefined;
    const explanation = ensureExplanationHeadings(
      normalizeOptionalText(explanationRaw, 4000),
      phrase,
    );
    if (!explanation.trim()) {
      throw new SyntaxError("empty explanation in batch");
    }
    output.push(explanation);
  }
  return output;
}

function buildSingleExplanationPrompt(phrase: PackExplanationInput): string {
  return `あなたは、マカオ・中国語圏での実生活、旅行・仕事会話に詳しい実践的な中国語コーチです。

次のフレーズについて、スマホで見返しやすい日本語解説を1件だけ作る。

日本語: ${phrase.japanese}
中国語: ${phrase.chinese}
ピンイン: ${phrase.pinyin}

ルール:
- explanation は必ず日本語
- 各セクションの間は必ず1行空ける
- 中国語（簡体字）を書いた場合は、必ず直後に半角括弧で声調記号付きピンインを添える
- 以下の6見出しをこの表記のまま必ず含める
  【単語分解と骨組み】
  【使用する場面】
  【他の自然な言い方】
  【相手の想定返答】
  【発音のコツ】
  【類似・関連フレーズ】
- 各見出しは2〜3行程度に収める
- 必ず JSON のみを返す

{
  "explanation": "日本語解説"
}`;
}

export function buildTemplateExplanation(phrase: PackExplanationInput): string {
  return ensureExplanationHeadings("", phrase);
}

function ensureExplanationHeadings(
  explanation: string,
  phrase: PackExplanationInput,
): string {
  let result = explanation.trim();
  if (!result) {
    result = `【単語分解と骨組み】\n${phrase.japanese} → ${phrase.chinese}（${phrase.pinyin}）`;
  }

  for (const heading of REQUIRED_HEADINGS) {
    if (!result.includes(heading)) {
      result += `\n\n${heading}\n${phrase.japanese} → ${phrase.chinese}（${phrase.pinyin}）`;
    }
  }

  return result.slice(0, 4000);
}

function normalizeOptionalText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxChars);
}

function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const jsonStart = cleaned.indexOf("{");
  if (jsonStart < 0) throw new SyntaxError("JSON not found");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonEnd < jsonStart) throw new SyntaxError("JSON not closed");
  return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
}
