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
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const config: {
    responseMimeType?: string;
    maxOutputTokens?: number;
  } = {};

  if (input.responseMimeType) config.responseMimeType = input.responseMimeType;
  if (typeof input.maxOutputTokens === "number") {
    config.maxOutputTokens = input.maxOutputTokens;
  }

  const response = await ai.models.generateContent({
    model: input.model,
    contents: input.contents,
    config,
  });

  return response.text;
}
