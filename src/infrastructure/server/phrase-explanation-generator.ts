import type { PhraseFollowUpTextGenerator } from "@/application/phrase/generate-phrase-follow-up";
import type { PackExplanationTextGenerator } from "@/lib/pack-explanation";
import { assertGeminiConfigured, generateGeminiText } from "./gemini-client";

export type GeminiExplanationGeneratorConfig = {
  model: string;
  createMissingApiKeyError: () => Error;
};

export function assertPhraseExplanationProviderConfigured(
  input: Pick<GeminiExplanationGeneratorConfig, "createMissingApiKeyError">,
): void {
  assertGeminiConfigured(input.createMissingApiKeyError);
}

export function createPhraseFollowUpTextGenerator(
  input: GeminiExplanationGeneratorConfig,
): PhraseFollowUpTextGenerator {
  return ({ prompt }) =>
    generateGeminiText({
      model: input.model,
      contents: prompt,
      responseMimeType: "application/json",
      createMissingApiKeyError: input.createMissingApiKeyError,
    });
}

export function createPhrasePackExplanationTextGenerator(
  input: GeminiExplanationGeneratorConfig,
): PackExplanationTextGenerator {
  return ({ contents, maxOutputTokens }) =>
    generateGeminiText({
      model: input.model,
      contents,
      responseMimeType: "application/json",
      maxOutputTokens,
      createMissingApiKeyError: input.createMissingApiKeyError,
    });
}
