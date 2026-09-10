import { reserveAiBudget, AiBudgetError } from "./ai-budget";
import { createTimedRequest } from "../../lib/timed-request";

export type GenerateGeminiTextInput = {
  model: string;
  contents: string;
  responseMimeType?: string;
  maxOutputTokens?: number;
  createMissingApiKeyError?: () => Error;
};

export function assertGeminiConfigured(createMissingApiKeyError?: () => Error): void {
  if (!process.env.GEMINI_API_KEY) {
    throw createMissingApiKeyError?.() ?? new Error("GEMINI_API_KEY is not configured");
  }
}

export async function generateGeminiText(
  input: GenerateGeminiTextInput,
): Promise<string | undefined> {
  assertGeminiConfigured(input.createMissingApiKeyError);

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { timeout: 35_000, retryOptions: { attempts: 1 } } });
  const maxOutputTokens = input.maxOutputTokens ?? 16_384;
  const inputBytes = Buffer.byteLength(input.contents, "utf8");
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 65_536 || inputBytes > 131_072) {
    throw new AiBudgetError("ai_budget_unavailable");
  }
  const budget = await reserveAiBudget(`gemini:${input.model}`, Math.ceil((inputBytes + 2 * maxOutputTokens) / 1000));
  const config: {
    responseMimeType?: string;
    maxOutputTokens?: number;
  } = {};

  if (input.responseMimeType) config.responseMimeType = input.responseMimeType;
  config.maxOutputTokens = maxOutputTokens;

  const response = await createTimedRequest(35_000).run((signal) => ai.models.generateContent({
    model: input.model,
    contents: input.contents,
    config: { ...config, abortSignal: signal },
  }));
  const totalTokens = response.usageMetadata?.totalTokenCount;
  if (typeof totalTokens === "number" && totalTokens > 0) await budget.settle(Math.ceil(totalTokens / 1000));

  return response.text;
}
