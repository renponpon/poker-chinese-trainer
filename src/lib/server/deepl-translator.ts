import { buildGeneratedPhrase, LANGUAGE_CONFIGS, parseDirection } from "@/lib/languages";
import type { GeneratedPhrase, PhraseDirection } from "@/lib/types";
const DEEPL_TIMEOUT_MS = 8_000;
const DEEPL_FREE_ENDPOINT = "https://api-free.deepl.com";
const DEEPL_PRO_ENDPOINT = "https://api.deepl.com";
export const DEEPL_MODEL = "deepl-translate-v2";

class DeepLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepLError";
  }
}

type DeepLResponse = {
  translations?: Array<{
    text?: string;
    detected_source_language?: string;
  }>;
};

export async function translateWithDeepL(input: {
  direction: PhraseDirection;
  text: string;
}): Promise<GeneratedPhrase> {
  const key = process.env.DEEPL_API_KEY;
  if (!key) {
    throw new DeepLError("DEEPL_API_KEY が設定されていません");
  }

  const endpoint = resolveDeepLEndpoint();
  const { sourceLanguage, targetLanguage } = parseDirection(input.direction);
  const sourceLang = LANGUAGE_CONFIGS[sourceLanguage].deeplSourceCode;
  const targetLang = LANGUAGE_CONFIGS[targetLanguage].deeplTargetCode;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEEPL_TIMEOUT_MS);

  try {
    const res = await fetch(`${endpoint}/v2/translate`, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: [input.text],
        source_lang: sourceLang,
        target_lang: targetLang,
      }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as
      | DeepLResponse
      | { message?: string }
      | null;

    if (!res.ok) {
      const message =
        data && typeof data === "object" && "message" in data && data.message
          ? data.message
          : `DeepL error: ${res.status}`;
      throw new DeepLError(message);
    }

    const translated = (data as DeepLResponse)?.translations?.[0]?.text?.trim();
    if (!translated) {
      throw new DeepLError("DeepL から空の翻訳が返りました");
    }

    return buildGeneratedPhrase({
      direction: input.direction,
      sourceText: input.text,
      targetText: translated,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new DeepLError("DeepL がタイムアウトしました");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveDeepLEndpoint(): string {
  const custom = process.env.DEEPL_API_ENDPOINT?.replace(/\/+$/, "");
  if (custom) return custom;
  return process.env.DEEPL_API_PLAN?.toLowerCase() === "pro"
    ? DEEPL_PRO_ENDPOINT
    : DEEPL_FREE_ENDPOINT;
}
