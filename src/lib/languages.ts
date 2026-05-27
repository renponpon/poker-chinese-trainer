import type { GeneratedPhrase, LanguageCode, PhraseDirection, ReadingType } from "./types";

export type LanguageConfig = {
  code: LanguageCode;
  label: string;
  shortLabel: string;
  speechRecognitionCode: string;
  speechSynthesisCode: string;
  azureCode: string;
  deeplSourceCode: string;
  deeplTargetCode: string;
  readingType: ReadingType;
};

export const LANGUAGE_CONFIGS: Record<LanguageCode, LanguageConfig> = {
  ja: {
    code: "ja",
    label: "日本語",
    shortLabel: "日",
    speechRecognitionCode: "ja-JP",
    speechSynthesisCode: "ja-JP",
    azureCode: "ja",
    deeplSourceCode: "JA",
    deeplTargetCode: "JA",
    readingType: "none",
  },
  zh: {
    code: "zh",
    label: "中国語",
    shortLabel: "中",
    speechRecognitionCode: "zh-CN",
    speechSynthesisCode: "zh-CN",
    azureCode: "zh-Hans",
    deeplSourceCode: "ZH",
    deeplTargetCode: "ZH",
    readingType: "pinyin",
  },
  en: {
    code: "en",
    label: "英語",
    shortLabel: "英",
    speechRecognitionCode: "en-US",
    speechSynthesisCode: "en-US",
    azureCode: "en",
    deeplSourceCode: "EN",
    deeplTargetCode: "EN-US",
    readingType: "none",
  },
  ko: {
    code: "ko",
    label: "韓国語",
    shortLabel: "韓",
    speechRecognitionCode: "ko-KR",
    speechSynthesisCode: "ko-KR",
    azureCode: "ko",
    deeplSourceCode: "KO",
    deeplTargetCode: "KO",
    readingType: "none",
  },
  es: {
    code: "es",
    label: "スペイン語",
    shortLabel: "西",
    speechRecognitionCode: "es-ES",
    speechSynthesisCode: "es-ES",
    azureCode: "es",
    deeplSourceCode: "ES",
    deeplTargetCode: "ES",
    readingType: "none",
  },
  fr: {
    code: "fr",
    label: "フランス語",
    shortLabel: "仏",
    speechRecognitionCode: "fr-FR",
    speechSynthesisCode: "fr-FR",
    azureCode: "fr",
    deeplSourceCode: "FR",
    deeplTargetCode: "FR",
    readingType: "none",
  },
  de: {
    code: "de",
    label: "ドイツ語",
    shortLabel: "独",
    speechRecognitionCode: "de-DE",
    speechSynthesisCode: "de-DE",
    azureCode: "de",
    deeplSourceCode: "DE",
    deeplTargetCode: "DE",
    readingType: "none",
  },
  th: {
    code: "th",
    label: "タイ語",
    shortLabel: "泰",
    speechRecognitionCode: "th-TH",
    speechSynthesisCode: "th-TH",
    azureCode: "th",
    deeplSourceCode: "TH",
    deeplTargetCode: "TH",
    readingType: "none",
  },
  vi: {
    code: "vi",
    label: "ベトナム語",
    shortLabel: "越",
    speechRecognitionCode: "vi-VN",
    speechSynthesisCode: "vi-VN",
    azureCode: "vi",
    deeplSourceCode: "VI",
    deeplTargetCode: "VI",
    readingType: "none",
  },
};

export const SUPPORTED_LANGUAGE_CODES = Object.keys(LANGUAGE_CONFIGS) as LanguageCode[];
export const ACTIVE_TARGET_LANGUAGE_CODES: readonly LanguageCode[] = ["zh"];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && value in LANGUAGE_CONFIGS;
}

export function buildDirection(
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
): PhraseDirection {
  return `${sourceLanguage}-to-${targetLanguage}` as PhraseDirection;
}

export function parseDirection(direction: PhraseDirection): {
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
} {
  const [sourceLanguage, targetLanguage] = direction.split("-to-");
  if (!isLanguageCode(sourceLanguage) || !isLanguageCode(targetLanguage)) {
    return { sourceLanguage: "ja", targetLanguage: "zh" };
  }
  return { sourceLanguage, targetLanguage };
}

export function isSupportedDirection(value: unknown): value is PhraseDirection {
  if (typeof value !== "string") return false;
  const [sourceLanguage, targetLanguage] = value.split("-to-");
  return (
    sourceLanguage !== targetLanguage &&
    isLanguageCode(sourceLanguage) &&
    isLanguageCode(targetLanguage)
  );
}

export function isChineseLanguage(language: LanguageCode): boolean {
  return language === "zh";
}

export function isJapaneseLanguage(language: LanguageCode): boolean {
  return language === "ja";
}

export function getLanguageLabel(language: LanguageCode): string {
  return LANGUAGE_CONFIGS[language].label;
}

export function buildGeneratedPhrase(input: {
  direction: PhraseDirection;
  sourceText: string;
  targetText: string;
  reading?: string;
  explanation?: string;
}): GeneratedPhrase {
  const { sourceLanguage, targetLanguage } = parseDirection(input.direction);
  const reading = input.reading ?? "";
  const sourceIsJapanese = isJapaneseLanguage(sourceLanguage);
  const targetIsJapanese = isJapaneseLanguage(targetLanguage);
  const sourceIsChinese = isChineseLanguage(sourceLanguage);
  const targetIsChinese = isChineseLanguage(targetLanguage);
  const usesPinyin = targetIsChinese || sourceIsChinese;
  const normalizedReading = usesPinyin ? reading : "";
  const japanese = sourceIsJapanese
    ? input.sourceText
    : targetIsJapanese
      ? input.targetText
      : "";
  const chinese = sourceIsChinese
    ? input.sourceText
    : targetIsChinese
      ? input.targetText
      : targetIsJapanese
        ? input.sourceText
        : input.targetText;

  return {
    direction: input.direction,
    japanese,
    chinese,
    pinyin: normalizedReading,
    sourceLanguage,
    targetLanguage,
    sourceText: input.sourceText,
    targetText: input.targetText,
    reading: normalizedReading,
    readingType: usesPinyin ? "pinyin" : "none",
    explanation: input.explanation ?? "",
  };
}
