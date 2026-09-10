import { reserveAiBudget } from "./ai-budget";
import { createTimedRequest } from "../../lib/timed-request";
import { getSpeechBudgetUnits, getTranscriptionBudgetUnits, getTranscriptionReservationUnits } from "./openai-speech-usage";
import { readOpenAiSpeechStream, SpeechStreamError } from "./openai-speech-stream";
import { measureSpeechStage } from "./speech-timing";

const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = "marin";
const DEFAULT_TRANSCRIBE_MODEL = "whisper-1";

export class OpenAiSpeechProviderError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "OpenAiSpeechProviderError";
  }
}

export function getOpenAiTextToSpeechModel(): string {
  return process.env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL;
}

export function getOpenAiTranscriptionModel(): string {
  return process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL;
}

export async function synthesizeSpeechWithOpenAi(input: {
  text: string;
  instructions: string;
}): Promise<{ audio: ArrayBuffer; model: string }> {
  const apiKey = getOpenAiApiKey();
  const model = getOpenAiTextToSpeechModel();
  const voice = process.env.OPENAI_TTS_VOICE || DEFAULT_TTS_VOICE;
  const budget = await measureSpeechStage("budget_reserve", () =>
    reserveAiBudget(`openai:tts:${model}`, 128 + Array.from(input.text + input.instructions).length));
  const streamUsage = model === DEFAULT_TTS_MODEL;
  const result = await createTimedRequest(35_000).run(async (signal) => {
    const response = await measureSpeechStage("provider_headers", () => fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model, voice, input: input.text, response_format: "mp3", instructions: input.instructions,
        ...(streamUsage ? { stream_format: "sse" } : {}),
      }),
    }));
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new OpenAiSpeechProviderError(
        data?.error?.message || "Failed to generate speech audio.",
        response.status,
        "openai_tts_failed",
      );
    }
    if (!streamUsage) return { audio: await measureSpeechStage("audio_receive", () => response.arrayBuffer()), usage: null };
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("text/event-stream")) {
      await response.body?.cancel();
      throw new OpenAiSpeechProviderError("OpenAI returned an unexpected speech format.", 502, "openai_tts_failed");
    }
    try {
      return await measureSpeechStage("audio_receive", () => readOpenAiSpeechStream(response.body));
    } catch (error) {
      if (!(error instanceof SpeechStreamError || error instanceof TypeError)) throw error;
      throw new OpenAiSpeechProviderError("OpenAI returned incomplete speech audio.", 502, "openai_tts_failed");
    }
  });
  const actualUnits = getSpeechBudgetUnits(model, result.usage);
  if (actualUnits !== null) await measureSpeechStage("settlement_dispatch", () => budget.settle(actualUnits));
  return { audio: result.audio, model };
}

export async function transcribeSpeechWithOpenAi(input: {
  audio: File;
  languageHint: string | "auto";
}): Promise<{ transcript: string; model: string }> {
  const apiKey = getOpenAiApiKey();
  const model = getOpenAiTranscriptionModel();
  if (input.audio.size <= 0 || input.audio.size > 5 * 1024 * 1024) {
    throw new OpenAiSpeechProviderError("音声ファイルが空か大きすぎます。20秒以内で録音してください。", 400, "invalid_audio_size");
  }
  const reservedUnits = getTranscriptionReservationUnits(model, input.audio.size);
  const budget = await reserveAiBudget(`openai:transcribe:${model}`, reservedUnits);
  const form = new FormData();
  form.set("file", input.audio);
  form.set("model", model);
  form.set("response_format", model === "whisper-1" ? "verbose_json" : "json");
  if (input.languageHint !== "auto") form.set("language", input.languageHint);

  const result = await createTimedRequest(35_000).run(async (signal) => {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const data = (await response.json().catch(() => null)) as {
      text?: unknown;
      duration?: unknown;
      usage?: unknown;
      error?: { message?: string };
    } | null;
    if (!response.ok) {
      throw new OpenAiSpeechProviderError(
        data?.error?.message || "Failed to transcribe audio.",
        response.status,
        "openai_transcribe_failed",
      );
    }
    return data;
  });
  const actualUnits = getTranscriptionBudgetUnits(model, result);
  if (actualUnits !== null) await budget.settle(actualUnits);
  const transcript = typeof result?.text === "string" ? result.text.trim() : "";
  if (!transcript) {
    throw new OpenAiSpeechProviderError("OpenAI returned an empty transcript.", 502, "empty_transcript");
  }
  return { transcript, model };
}

function getOpenAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAiSpeechProviderError(
      "OPENAI_API_KEY is not configured.",
      500,
      "missing_openai_api_key",
    );
  }
  return apiKey;
}
