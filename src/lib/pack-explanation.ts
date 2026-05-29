import { GoogleGenAI } from "@google/genai";
import {
  buildPackBatchExplanationPrompt,
  buildPackSingleExplanationPrompt,
} from "@/lib/explanation-prompt";
import type { LanguageCode, PhraseDirection, ReadingType } from "@/lib/types";

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
  direction?: PhraseDirection;
  japanese: string;
  chinese: string;
  pinyin: string;
  sourceLanguage?: LanguageCode;
  targetLanguage?: LanguageCode;
  sourceText?: string;
  targetText?: string;
  reading?: string;
  readingType?: ReadingType;
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
  if (phrases.some((phrase) => !isChinesePackPhrase(phrase))) {
    return Promise.all(phrases.map((phrase) => generatePackExplanation(ai, phrase)));
  }

  if (phrases.length === 1) {
    return [await generatePackExplanation(ai, phrases[0])];
  }

  try {
    const response = await ai.models.generateContent({
      model: PACK_EXPLANATION_GEMINI_MODEL,
      contents: buildPackBatchExplanationPrompt(phrases),
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
      contents: buildPackSingleExplanationPrompt(phrase),
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

export function buildTemplateExplanation(phrase: PackExplanationInput): string {
  return ensureExplanationHeadings("", phrase);
}

const PLACEHOLDER = "（未生成）";

function ensureExplanationHeadings(
  explanation: string,
  phrase: PackExplanationInput,
): string {
  let result = explanation.trim();
  if (!result) {
    result = `【単語分解と骨組み】\n${PLACEHOLDER}`;
  }

  for (const heading of REQUIRED_HEADINGS) {
    if (!result.includes(heading)) {
      result += `\n\n${heading}\n${PLACEHOLDER}`;
    }
  }

  return result.slice(0, 4000);
}

function normalizeOptionalText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxChars);
}

function isChinesePackPhrase(phrase: PackExplanationInput): boolean {
  return phrase.targetLanguage === "zh" || phrase.direction === "ja-to-zh" || Boolean(phrase.pinyin);
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
