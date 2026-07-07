import { overwriteStructuredSectionPinyin, toMandarinPinyin } from "@/lib/chinese-pinyin";
import { formatExplanationWithStructuredSections } from "@/lib/explanation-format";
import { buildGeneratedPhrase, parseDirection } from "@/lib/languages";
import type { GeneratedPhrase, LanguageCode, PhraseDirection } from "@/lib/types";
import { generateGeminiText } from "./gemini-client";

type GeminiPhraseResponse = Partial<GeneratedPhrase> & {
  explanationSections?: unknown;
  exampleSections?: unknown;
};

export type GenerateQualityPhraseWithGeminiInput = {
  model: string;
  direction: PhraseDirection;
  inputText: string;
  prompt: string;
  createMissingApiKeyError: () => Error;
  createEmptyResponseError: () => Error;
};

export async function generateQualityPhraseWithGemini(
  input: GenerateQualityPhraseWithGeminiInput,
): Promise<GeneratedPhrase> {
  const text = await generateGeminiText({
    model: input.model,
    contents: buildInitialContents(input.prompt, input.inputText),
    responseMimeType: "application/json",
    createMissingApiKeyError: input.createMissingApiKeyError,
  });

  if (!text) {
    throw input.createEmptyResponseError();
  }

  const generated = parseGeminiPhraseResponse(text, input.direction, input.inputText);
  if (!hasSuspiciousPinyin(generated)) return generated;

  const retryText = await generateGeminiText({
    model: input.model,
    contents: buildRetryContents(input.prompt, input.inputText),
    responseMimeType: "application/json",
    createMissingApiKeyError: input.createMissingApiKeyError,
  });

  if (!retryText) return generated;

  const retryGenerated = parseGeminiPhraseResponse(
    retryText,
    input.direction,
    input.inputText,
  );
  return hasSuspiciousPinyin(retryGenerated) ? generated : retryGenerated;
}

function buildInitialContents(prompt: string, inputText: string): string {
  return `${prompt}\n\nInput:\n"${inputText}"`;
}

function buildRetryContents(prompt: string, inputText: string): string {
  return `${prompt}

Important:
The previous output may have duplicated syllables in pinyin or reading.
Regenerate the full JSON and remove accidental pinyin duplication while preserving the natural target phrase.

Input:
"${inputText}"`;
}

export function parseGeminiPhraseResponse(
  text: string,
  direction: PhraseDirection,
  inputText: string,
): GeneratedPhrase {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error("Gemini response did not include a JSON object.");
  }

  const slice = trimmed.slice(jsonStart, jsonEnd + 1);
  const parsed = JSON.parse(slice) as GeminiPhraseResponse;
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
    throw new Error("Gemini response did not include a target text field.");
  }

  const structuredExplanationSections = overwriteStructuredSectionPinyin(
    parsed.explanationSections,
  );
  const structuredExampleSections = overwriteStructuredSectionPinyin(parsed.exampleSections);
  const reading = buildChineseReading({
    sourceLanguage,
    targetLanguage,
    sourceText,
    targetText,
    fallback: parsed.reading ?? parsed.pinyin ?? "",
  });

  return buildGeneratedPhrase({
    direction,
    sourceText,
    targetText,
    reading,
    explanation: formatExplanationWithStructuredSections(
      parsed.explanation ?? "",
      structuredExplanationSections,
      structuredExampleSections,
    ),
  });
}

function buildChineseReading(input: {
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  sourceText: string;
  targetText: string;
  fallback: string;
}): string {
  if (input.targetLanguage === "zh") return toMandarinPinyin(input.targetText);
  if (input.sourceLanguage === "zh") return toMandarinPinyin(input.sourceText);
  return input.fallback;
}

function hasSuspiciousPinyin(generated: GeneratedPhrase): boolean {
  if (generated.readingType !== "pinyin" || !generated.reading.trim()) return false;
  const chineseText =
    generated.targetLanguage === "zh"
      ? generated.targetText
      : generated.sourceLanguage === "zh"
        ? generated.sourceText
        : generated.chinese;
  if (!/[\u3400-\u9fff]/.test(chineseText)) return false;

  if (hasTooManyPinyinSyllables(generated.reading, chineseText)) return true;
  return generated.reading
    .split(/\s+/)
    .some((token) => hasRepeatedPinyinSuffix(token, chineseText));
}

function hasTooManyPinyinSyllables(reading: string, chineseText: string): boolean {
  if (/[A-Za-z0-9]/.test(chineseText)) return false;

  const cjkCount = Array.from(chineseText).filter((char) =>
    /[\u3400-\u9fff]/.test(char),
  ).length;
  const syllableCount = reading
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{Script=Latin}]/gu, ""))
    .filter(Boolean).length;

  return syllableCount > cjkCount;
}

function hasRepeatedPinyinSuffix(token: string, chineseText: string): boolean {
  const match = token.match(/^(\p{Script=Latin}+)([^\p{Script=Latin}]*)$/u);
  if (!match) return false;
  const core = Array.from(match[1].toLowerCase());

  for (
    let suffixLength = 2;
    suffixLength <= Math.min(6, Math.floor(core.length / 2));
    suffixLength += 1
  ) {
    if (core.length <= suffixLength * 2) continue;

    const suffix = core.slice(-suffixLength).join("");
    const previous = core.slice(-suffixLength * 2, -suffixLength).join("");
    if (suffix !== previous) continue;
    if (!/[aeiouv]/.test(stripLatinDiacritics(suffix))) continue;
    if (hasAdjacentRepeatedCjk(chineseText)) continue;
    return true;
  }

  return false;
}

function stripLatinDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function hasAdjacentRepeatedCjk(value: string): boolean {
  const chars = Array.from(value);
  return chars.some(
    (char, index) =>
      index > 0 && /[\u3400-\u9fff]/.test(char) && char === chars[index - 1],
  );
}
