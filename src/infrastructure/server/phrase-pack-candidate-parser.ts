import type {
  PhrasePackDraft,
} from "@/application/phrase/generate-personal-phrase-pack";
import type { GeneratePhrasePackAttempt } from "@/application/phrase/generate-phrase-pack";
import { buildDirection, LANGUAGE_CONFIGS } from "@/lib/languages";
import { getCategoryIdForScene } from "@/lib/personal-phrase-pack";
import { detectDuplicateInList } from "@/lib/phrase-dedupe";
import { generateGeminiText } from "./gemini-client";
import type {
  GeneratedPhrasePackItem,
  LanguageCode,
  PhrasePackProfile,
  PhrasePackScene,
} from "@/lib/types";

type GeneratedPackResponse = {
  phrases?: unknown;
};

export class PhrasePackCandidateParseError extends Error {
  constructor(
    message: string,
    public code = "invalid_gemini_response",
  ) {
    super(message);
    this.name = "PhrasePackCandidateParseError";
  }
}

export type ParsePhrasePackCandidatesInput = {
  text: string;
  profile: PhrasePackProfile;
  seenTargets: string[];
  targetLanguage: LanguageCode;
  maxCandidates: number;
  categoryIds: ReadonlySet<string>;
};

export type CreatePhrasePackCandidateGeneratorInput = {
  model: string;
  maxOutputTokens: number;
  maxCandidates: number;
  profile: PhrasePackProfile;
  targetLanguage: LanguageCode;
  categoryIds: ReadonlySet<string>;
  buildPrompt: (attempt: GeneratePhrasePackAttempt) => string;
  createMissingApiKeyError: () => Error;
  createEmptyResponseError: () => Error;
};

export function createPhrasePackCandidateGenerator(
  input: CreatePhrasePackCandidateGeneratorInput,
): (attempt: GeneratePhrasePackAttempt) => Promise<PhrasePackDraft[]> {
  return async (attempt) => {
    const text = await generateGeminiText({
      model: input.model,
      contents: input.buildPrompt(attempt),
      responseMimeType: "application/json",
      maxOutputTokens: input.maxOutputTokens,
      createMissingApiKeyError: input.createMissingApiKeyError,
    });

    if (!text) {
      throw input.createEmptyResponseError();
    }

    return parsePhrasePackCandidates({
      text,
      profile: input.profile,
      seenTargets: attempt.seenTargets,
      targetLanguage: input.targetLanguage,
      maxCandidates: input.maxCandidates,
      categoryIds: input.categoryIds,
    });
  };
}

export function parsePhrasePackCandidates(
  input: ParsePhrasePackCandidatesInput,
): PhrasePackDraft[] {
  const parsed = extractJson(input.text) as GeneratedPackResponse;
  if (!Array.isArray(parsed.phrases)) {
    throw new PhrasePackCandidateParseError("Generated response did not include phrases.");
  }

  const fallbackCategory = getFallbackCategory(input.profile);
  const output: PhrasePackDraft[] = [];
  const previousTargets = [...input.seenTargets];

  for (const raw of parsed.phrases) {
    if (output.length >= input.maxCandidates) break;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    try {
      const phrase = normalizePhraseCore({
        item: raw as Partial<GeneratedPhrasePackItem>,
        fallbackCategory,
        targetLanguage: input.targetLanguage,
        categoryIds: input.categoryIds,
      });
      const duplicate = detectDuplicateInList(phrase.targetText, previousTargets);
      if (duplicate) continue;
      previousTargets.push(phrase.targetText);
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

function normalizePhraseCore(input: {
  item: Partial<GeneratedPhrasePackItem>;
  fallbackCategory: string;
  targetLanguage: LanguageCode;
  categoryIds: ReadonlySet<string>;
}): PhrasePackDraft {
  const japanese = normalizeText(input.item.japanese || input.item.sourceText, "japanese", 120);
  const targetText = normalizeText(
    input.item.targetText || input.item.chinese,
    "targetText",
    input.targetLanguage === "zh" ? 80 : 160,
  );
  const readingType = LANGUAGE_CONFIGS[input.targetLanguage].readingType;
  const reading =
    readingType === "pinyin"
      ? normalizeText(input.item.reading || input.item.pinyin, "pinyin", 120)
      : "";
  const categoryId =
    typeof input.item.categoryId === "string" && input.categoryIds.has(input.item.categoryId)
      ? input.item.categoryId
      : input.fallbackCategory;
  const direction = buildDirection("ja", input.targetLanguage);

  return {
    direction,
    japanese,
    chinese: targetText,
    pinyin: readingType === "pinyin" ? reading : "",
    sourceLanguage: "ja",
    targetLanguage: input.targetLanguage,
    sourceText: japanese,
    targetText,
    reading,
    readingType,
    categoryId,
  };
}

function normalizeText(value: unknown, field: string, maxChars: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new PhrasePackCandidateParseError(`Generated ${field} was empty.`);
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
    throw new PhrasePackCandidateParseError("Gemini response did not include JSON.");
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
