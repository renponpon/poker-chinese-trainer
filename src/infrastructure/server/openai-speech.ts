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
}): Promise<{
  audio: ArrayBuffer;
  model: string;
}> {
  const apiKey = getOpenAiApiKey();
  const model = getOpenAiTextToSpeechModel();
  const voice = process.env.OPENAI_TTS_VOICE || DEFAULT_TTS_VOICE;
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      input: input.text,
      response_format: "mp3",
      instructions: input.instructions,
    }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new OpenAiSpeechProviderError(
      data?.error?.message || "Failed to generate speech audio.",
      response.status,
      "openai_tts_failed",
    );
  }

  return {
    audio: await response.arrayBuffer(),
    model,
  };
}

export async function transcribeSpeechWithOpenAi(input: {
  audio: File;
  languageHint: string | "auto";
}): Promise<{
  transcript: string;
  model: string;
}> {
  const apiKey = getOpenAiApiKey();
  const model = getOpenAiTranscriptionModel();
  const form = new FormData();
  form.set("file", input.audio);
  form.set("model", model);
  form.set("response_format", "json");
  if (input.languageHint !== "auto") {
    form.set("language", input.languageHint);
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });
  const data = (await response.json().catch(() => null)) as {
    text?: unknown;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new OpenAiSpeechProviderError(
      data?.error?.message || "Failed to transcribe audio.",
      response.status,
      "openai_transcribe_failed",
    );
  }

  const transcript = typeof data?.text === "string" ? data.text.trim() : "";
  if (!transcript) {
    throw new OpenAiSpeechProviderError(
      "OpenAI returned an empty transcript.",
      502,
      "empty_transcript",
    );
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
