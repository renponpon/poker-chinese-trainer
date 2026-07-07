import { formatExplanationForReading } from "../../lib/explanation-format";
import { buildExplainRequestPrompt } from "../../lib/explanation-prompt";
import { isSupportedDirection, parseDirection } from "../../lib/languages";
import type { PhraseDirection } from "../../lib/types";
import type { PhraseFollowUp } from "./persist-phrase-follow-up";

export class PhraseFollowUpGenerationError extends Error {
  constructor(
    message: string,
    public code: "empty_gemini_response" | "invalid_gemini_json" | "empty_explanation",
  ) {
    super(message);
    this.name = "PhraseFollowUpGenerationError";
  }
}

export type PhraseFollowUpTextGenerator = (input: {
  prompt: string;
}) => Promise<string | undefined>;

export type GeneratePhraseFollowUpInput = {
  phraseId: string;
  direction: PhraseDirection;
  japanese: string;
  chinese: string;
  pinyin: string;
  sourceText?: string;
  targetText?: string;
  reading?: string;
  generateText: PhraseFollowUpTextGenerator;
  onMissingPinyin?: () => void;
};

export type RawPhraseFollowUpRequest = {
  phraseId?: unknown;
  direction?: unknown;
  japanese?: unknown;
  chinese?: unknown;
  pinyin?: unknown;
  sourceText?: unknown;
  targetText?: unknown;
  reading?: unknown;
};

export type NormalizedPhraseFollowUpRequest = Omit<
  GeneratePhraseFollowUpInput,
  "generateText" | "onMissingPinyin"
>;

export type GeneratePhraseFollowUpResult = {
  followUp: PhraseFollowUp;
  inputChars: number;
  outputChars: number;
};

export class PhraseFollowUpRequestError extends Error {
  status = 400;
  code = "validation_error";

  constructor(message: string) {
    super(message);
    this.name = "PhraseFollowUpRequestError";
  }
}

export function normalizePhraseFollowUpRequest(
  value: unknown,
): NormalizedPhraseFollowUpRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PhraseFollowUpRequestError("リクエスト形式が正しくありません");
  }

  const body = value as RawPhraseFollowUpRequest;
  const phraseId = normalizeText(body.phraseId, "phraseId");
  const direction = normalizeDirection(body.direction);
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
    throw new PhraseFollowUpRequestError("フレーズ本文が空です");
  }

  return {
    phraseId,
    direction,
    japanese,
    chinese,
    pinyin: normalizeText(body.pinyin ?? body.reading ?? "", "pinyin", true),
    sourceText,
    targetText,
    reading: normalizeOptionalText(body.reading),
  };
}

export async function generatePhraseFollowUp(
  input: GeneratePhraseFollowUpInput,
): Promise<GeneratePhraseFollowUpResult> {
  const { sourceLanguage, targetLanguage } = parseDirection(input.direction);
  const needsPinyin = (sourceLanguage === "zh" || targetLanguage === "zh") && !input.pinyin;
  const prompt = buildExplainRequestPrompt({
    direction: input.direction,
    japanese: input.japanese,
    chinese: input.chinese,
    pinyin: input.pinyin,
    sourceText: input.sourceText,
    targetText: input.targetText,
    reading: input.reading,
  });
  const text = await input.generateText({ prompt });
  if (!text) {
    throw new PhraseFollowUpGenerationError(
      "Gemini returned an empty response",
      "empty_gemini_response",
    );
  }

  const { explanation, pinyin } = extractExplainResponse(text);
  if (needsPinyin && !pinyin) input.onMissingPinyin?.();

  return {
    followUp: {
      phraseId: input.phraseId,
      explanation,
      pinyin,
    },
    inputChars: prompt.length,
    outputChars: text.length,
  };
}

function extractExplainResponse(text: string): { explanation: string; pinyin?: string } {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new PhraseFollowUpGenerationError(
      "Gemini response did not include JSON",
      "invalid_gemini_json",
    );
  }
  const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as {
    explanation?: unknown;
    pinyin?: unknown;
  };
  if (typeof parsed.explanation !== "string" || !parsed.explanation.trim()) {
    throw new PhraseFollowUpGenerationError(
      "Generated explanation was empty",
      "empty_explanation",
    );
  }
  const explanation = formatExplanationForReading(parsed.explanation);
  const pinyin =
    typeof parsed.pinyin === "string" && parsed.pinyin.trim()
      ? parsed.pinyin.trim()
      : undefined;
  return { explanation, pinyin };
}

function normalizeText(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== "string") {
    throw new PhraseFollowUpRequestError(`${field} が正しくありません`);
  }
  const normalized = value.trim();
  if (!allowEmpty && !normalized) {
    throw new PhraseFollowUpRequestError(`${field} が空です`);
  }
  return normalized;
}

function normalizeDirection(value: unknown): PhraseDirection {
  if (isSupportedDirection(value)) return value;
  throw new PhraseFollowUpRequestError("翻訳方向が正しくありません");
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}
