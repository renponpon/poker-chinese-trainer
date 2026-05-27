import { createId } from "@/lib/id";
import { buildGeneratedPhrase, LANGUAGE_CONFIGS, parseDirection } from "@/lib/languages";
import type { GeneratedPhrase, PhraseDirection } from "@/lib/types";

const DEFAULT_ENDPOINT = "https://api.cognitive.microsofttranslator.com";
const API_VERSION = "3.0";

class AzureTranslatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AzureTranslatorError";
  }
}

type AzureTranslationResponse = Array<{
  translations?: Array<{
    text?: string;
    to?: string;
  }>;
}>;

type AzureTransliterationResponse = Array<{
  text?: string;
  script?: string;
}>;

export async function translateWithAzure(input: {
  direction: PhraseDirection;
  text: string;
  skipPinyin?: boolean;
}): Promise<GeneratedPhrase> {
  const translated = await translateText(input);
  const { sourceLanguage, targetLanguage } = parseDirection(input.direction);
  const chineseText =
    targetLanguage === "zh" ? translated : sourceLanguage === "zh" ? input.text : "";
  const reading = input.skipPinyin || !chineseText
    ? ""
    : await transliterateChinesePinyin(chineseText).catch((error) => {
        console.warn("[azure-translator] transliteration failed", error);
        return "";
      });

  return buildGeneratedPhrase({
    direction: input.direction,
    sourceText: input.text,
    targetText: translated,
    reading,
  });
}

async function translateText(input: {
  direction: PhraseDirection;
  text: string;
}): Promise<string> {
  const key = getRequiredEnv("AZURE_TRANSLATOR_KEY");
  const endpoint = normalizeEndpoint(process.env.AZURE_TRANSLATOR_ENDPOINT);
  const region = process.env.AZURE_TRANSLATOR_REGION;
  const { sourceLanguage, targetLanguage } = parseDirection(input.direction);
  const params = new URLSearchParams({
    "api-version": API_VERSION,
    from: LANGUAGE_CONFIGS[sourceLanguage].azureCode,
    to: LANGUAGE_CONFIGS[targetLanguage].azureCode,
  });

  const res = await fetch(`${endpoint}/translate?${params.toString()}`, {
    method: "POST",
    headers: azureHeaders(key, region),
    body: JSON.stringify([{ text: input.text }]),
  });
  const data = (await res.json().catch(() => null)) as AzureTranslationResponse | null;
  if (!res.ok) {
    throw new AzureTranslatorError(`Azure Translator error: ${res.status}`);
  }

  const translated = data?.[0]?.translations?.[0]?.text?.trim();
  if (!translated) {
    throw new AzureTranslatorError("Azure Translator から空の翻訳が返りました");
  }
  return translated;
}

export async function transliterateChinesePinyin(chinese: string): Promise<string> {
  if (!chinese.trim()) return "";

  const key = getRequiredEnv("AZURE_TRANSLATOR_KEY");
  const endpoint = normalizeEndpoint(process.env.AZURE_TRANSLATOR_ENDPOINT);
  const region = process.env.AZURE_TRANSLATOR_REGION;
  const params = new URLSearchParams({
    "api-version": API_VERSION,
    language: "zh-Hans",
    fromScript: "Hans",
    toScript: "Latn",
  });

  const res = await fetch(`${endpoint}/transliterate?${params.toString()}`, {
    method: "POST",
    headers: azureHeaders(key, region),
    body: JSON.stringify([{ text: chinese }]),
  });
  const data = (await res.json().catch(() => null)) as AzureTransliterationResponse | null;
  if (!res.ok) {
    throw new AzureTranslatorError(`Azure Transliteration error: ${res.status}`);
  }
  return data?.[0]?.text?.trim() ?? "";
}

function azureHeaders(key: string, region: string | undefined): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": key,
    ...(region ? { "Ocp-Apim-Subscription-Region": region } : {}),
    "X-ClientTraceId": createId(),
  };
}

function normalizeEndpoint(value: string | undefined): string {
  return (value || DEFAULT_ENDPOINT).replace(/\/+$/, "");
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new AzureTranslatorError(`${name} が設定されていません`);
  }
  return value;
}
