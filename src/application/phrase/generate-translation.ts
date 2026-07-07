import type { GenerationMode } from "../../lib/generation-mode";
import type { GeneratedPhrase, PhraseDirection } from "../../lib/types";

export type TranslationProvider = "azure" | "deepl" | "gemini";

export type TranslationRequest = {
  direction: PhraseDirection;
  inputText: string;
};

export type TranslationProviderPort = (
  request: TranslationRequest,
) => Promise<GeneratedPhrase>;

export type TranslationProviders = {
  azure: TranslationProviderPort;
  deepl?: TranslationProviderPort;
  gemini: TranslationProviderPort;
};

export type TranslationFallbackEvent = {
  from: TranslationProvider;
  to: TranslationProvider;
  error: unknown;
};

export type GenerateTranslationInput = {
  mode: GenerationMode;
  request: TranslationRequest;
  providers: TranslationProviders;
  onProviderFallback?: (event: TranslationFallbackEvent) => void;
};

export type GenerateTranslationResult = {
  generated: GeneratedPhrase;
  provider: TranslationProvider;
};

export async function generateTranslation(
  input: GenerateTranslationInput,
): Promise<GenerateTranslationResult> {
  switch (input.mode) {
    case "speed":
      return {
        generated: await input.providers.azure(input.request),
        provider: "azure",
      };
    case "quality":
      return {
        generated: await input.providers.gemini(input.request),
        provider: "gemini",
      };
    case "normal":
      return generateNormalTranslation(input);
  }
}

async function generateNormalTranslation(
  input: GenerateTranslationInput,
): Promise<GenerateTranslationResult> {
  if (input.providers.deepl) {
    try {
      return {
        generated: await input.providers.deepl(input.request),
        provider: "deepl",
      };
    } catch (error) {
      input.onProviderFallback?.({
        from: "deepl",
        to: "azure",
        error,
      });
    }
  }

  return {
    generated: await input.providers.azure(input.request),
    provider: "azure",
  };
}
