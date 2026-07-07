import type {
  TranslationProvider,
  TranslationProviders,
} from "@/application/phrase/generate-translation";
import { toMandarinPinyin } from "@/lib/chinese-pinyin";
import type { GeneratedPhrase, PhraseDirection } from "@/lib/types";

const AZURE_TRANSLATOR_MODEL = "azure-translator-text-v3";
const DEEPL_TRANSLATOR_MODEL = "deepl-translate-v2";
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const WARMUP_TEXT = "warmup";

export type TranslationTiming = Record<string, number | string | null>;

export type WarmupProviderResult = {
  provider: Extract<TranslationProvider, "azure" | "deepl">;
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

export type CreatePhraseTranslationProvidersInput = {
  timing: TranslationTiming | null;
  translateWithGemini: () => Promise<GeneratedPhrase>;
};

export function createPhraseTranslationProviders(
  input: CreatePhraseTranslationProvidersInput,
): TranslationProviders {
  return {
    azure: async (request) => {
      const startedAt = Date.now();
      const { translateWithAzure } = await import("@/lib/server/azure-translator");
      const generated = await translateWithAzure({
        direction: request.direction,
        text: request.inputText,
        skipPinyin: true,
      });
      if (input.timing) input.timing.azureMs = Date.now() - startedAt;
      return ensureMandarinReading(generated);
    },
    deepl: process.env.DEEPL_API_KEY
      ? async (request) => {
          const startedAt = Date.now();
          try {
            const { translateWithDeepL } = await import("@/lib/server/deepl-translator");
            const generated = await translateWithDeepL({
              direction: request.direction,
              text: request.inputText,
            });
            return ensureMandarinReading(generated);
          } finally {
            if (input.timing) input.timing.deeplMs = Date.now() - startedAt;
          }
        }
      : undefined,
    gemini: async () => {
      const startedAt = Date.now();
      const generated = await input.translateWithGemini();
      if (input.timing) input.timing.geminiMs = Date.now() - startedAt;
      return generated;
    },
  };
}

export async function warmupTranslationProviders(
  direction: PhraseDirection,
  timing: TranslationTiming | null,
): Promise<WarmupProviderResult[]> {
  return Promise.all([
    warmupAzure(direction, timing),
    warmupDeepL(direction, timing),
  ]);
}

export function getTranslationProviderModel(provider: TranslationProvider): string {
  switch (provider) {
    case "deepl":
      return DEEPL_TRANSLATOR_MODEL;
    case "azure":
      return AZURE_TRANSLATOR_MODEL;
    case "gemini":
      return GEMINI_MODEL;
  }
}

export function getTranslationTimingErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 180);
}

async function warmupAzure(
  direction: PhraseDirection,
  timing: TranslationTiming | null,
): Promise<WarmupProviderResult> {
  if (!process.env.AZURE_TRANSLATOR_KEY) {
    return { provider: "azure", ok: false, skipped: true };
  }

  const startedAt = Date.now();
  try {
    const { translateWithAzure } = await import("@/lib/server/azure-translator");
    await translateWithAzure({ direction, text: WARMUP_TEXT, skipPinyin: true });
    return { provider: "azure", ok: true };
  } catch (error) {
    return { provider: "azure", ok: false, error: getTranslationTimingErrorMessage(error) };
  } finally {
    if (timing) timing.warmupAzureMs = Date.now() - startedAt;
  }
}

async function warmupDeepL(
  direction: PhraseDirection,
  timing: TranslationTiming | null,
): Promise<WarmupProviderResult> {
  if (!process.env.DEEPL_API_KEY) {
    return { provider: "deepl", ok: false, skipped: true };
  }

  const startedAt = Date.now();
  try {
    const { translateWithDeepL } = await import("@/lib/server/deepl-translator");
    await translateWithDeepL({ direction, text: WARMUP_TEXT });
    return { provider: "deepl", ok: true };
  } catch (error) {
    return { provider: "deepl", ok: false, error: getTranslationTimingErrorMessage(error) };
  } finally {
    if (timing) timing.warmupDeepLMs = Date.now() - startedAt;
  }
}

function ensureMandarinReading(generated: GeneratedPhrase): GeneratedPhrase {
  if (generated.readingType !== "pinyin") return generated;
  if (generated.reading.trim() && generated.pinyin.trim()) return generated;

  const chineseText =
    generated.targetLanguage === "zh"
      ? generated.targetText
      : generated.sourceLanguage === "zh"
        ? generated.sourceText
        : generated.chinese;
  const reading = toMandarinPinyin(chineseText);
  if (!reading) return generated;

  return {
    ...generated,
    pinyin: generated.pinyin.trim() || reading,
    reading: generated.reading.trim() || reading,
  };
}
