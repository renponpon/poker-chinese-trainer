import { markSpeechStage, measureSpeechStage } from "./speech-timing";

const MAX_STREAM_BYTES = 12 * 1024 * 1024;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_EVENT_CHARS = 2 * 1024 * 1024;

export class SpeechStreamError extends Error {
  constructor() {
    super("OpenAI returned an invalid or incomplete speech stream.");
    this.name = "SpeechStreamError";
  }
}

export async function readOpenAiSpeechStream(body: ReadableStream<Uint8Array> | null): Promise<{
  audio: ArrayBuffer;
  usage: unknown;
}> {
  if (!body) throw new SpeechStreamError();
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunks: Uint8Array[] = [];
  let buffer = "";
  let streamBytes = 0;
  let audioBytes = 0;
  let completed = false;
  let usage: unknown = null;

  const consume = (frame: string) => {
    if (frame.length > MAX_EVENT_CHARS) throw new SpeechStreamError();
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, "")).join("\n");
    if (!data) return;
    if (data === "[DONE]" && completed) return;
    if (completed) throw new SpeechStreamError();
    let event: unknown;
    try { event = JSON.parse(data); } catch { throw new SpeechStreamError(); }
    if (!event || typeof event !== "object" || Array.isArray(event)) throw new SpeechStreamError();
    const payload = event as Record<string, unknown>;
    if (payload.type === "speech.audio.done") {
      if (audioBytes === 0) throw new SpeechStreamError();
      completed = true;
      usage = payload.usage;
      markSpeechStage("audio_done_at");
      return;
    }
    if (payload.type !== "speech.audio.delta" || typeof payload.audio !== "string"
      || payload.audio.length === 0 || payload.audio.length % 4 !== 0
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload.audio)) throw new SpeechStreamError();
    const bytes = Buffer.from(payload.audio, "base64");
    if (bytes.length === 0 || bytes.toString("base64") !== payload.audio) throw new SpeechStreamError();
    audioBytes += bytes.length;
    if (audioBytes > MAX_AUDIO_BYTES) throw new SpeechStreamError();
    chunks.push(bytes);
    markSpeechStage("first_audio_at");
  };

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        markSpeechStage("stream_eof_at");
        break;
      }
      streamBytes += next.value.byteLength;
      if (streamBytes > MAX_STREAM_BYTES) throw new SpeechStreamError();
      buffer += decoder.decode(next.value, { stream: true });
      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        consume(buffer.slice(0, separator.index));
        buffer = buffer.slice(separator.index + separator[0].length);
      }
      if (buffer.length > MAX_EVENT_CHARS) throw new SpeechStreamError();
    }
    buffer += decoder.decode();
    if (buffer.trim()) throw new SpeechStreamError();
    if (!completed) throw new SpeechStreamError();
    const audio = new Uint8Array(audioBytes);
    let offset = 0;
    for (const chunk of chunks) {
      audio.set(chunk, offset);
      offset += chunk.length;
    }
    return { audio: audio.buffer, usage };
  } finally {
    await measureSpeechStage("stream_cleanup", () => reader.cancel().catch(() => undefined));
    reader.releaseLock();
  }
}
