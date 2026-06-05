import { buildDirection } from "@/lib/languages";
import type { GeneratedPhrase, LanguageCode, PhraseDirection, ReadingType } from "@/lib/types";

type StudyPhraseFields = GeneratedPhrase & {
  id?: string;
  shouldDrill?: boolean;
};

export function toStudyPhraseFields<T extends StudyPhraseFields>(input: T): T {
  if (!shouldReverseForStudy(input.sourceLanguage, input.targetLanguage)) {
    return input;
  }

  const targetLanguage = input.sourceLanguage;
  const sourceText = input.targetText || input.japanese;
  const targetText = input.sourceText || input.chinese;
  const reading = getStudyReading(targetLanguage, input.reading || input.pinyin);

  return {
    ...input,
    direction: buildDirection("ja", targetLanguage) as PhraseDirection,
    sourceLanguage: "ja" as LanguageCode,
    targetLanguage,
    sourceText,
    targetText,
    japanese: sourceText,
    chinese: targetText,
    pinyin: reading,
    reading,
    readingType: getStudyReadingType(targetLanguage),
    explanation: "",
  };
}

function shouldReverseForStudy(
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
): boolean {
  return targetLanguage === "ja" && sourceLanguage !== "ja";
}

function getStudyReading(targetLanguage: LanguageCode, reading: string): string {
  return targetLanguage === "zh" ? reading : "";
}

function getStudyReadingType(targetLanguage: LanguageCode): ReadingType {
  return targetLanguage === "zh" ? "pinyin" : "none";
}
