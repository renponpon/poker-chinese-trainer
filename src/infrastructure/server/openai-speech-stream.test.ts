import assert from "node:assert/strict";
import test from "node:test";
import { readOpenAiSpeechStream, SpeechStreamError } from "./openai-speech-stream";

const usage = { input_tokens: 14, output_tokens: 101, total_tokens: 115 };
const frame = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;
const delta = frame({ type: "speech.audio.delta", audio: "AQID" });
const done = frame({ type: "speech.audio.done", usage });
const stream = (chunks: Uint8Array[]) => new ReadableStream<Uint8Array>({
  start(controller) {
    for (const chunk of chunks) controller.enqueue(chunk);
    controller.close();
  },
});
const parse = (text: string) => readOpenAiSpeechStream(stream([new TextEncoder().encode(text)]));

test("speech stream reconstructs the original bytes at every chunk boundary", async () => {
  const text = `: 音声\r\nevent: speech.audio.delta\r\n${delta.replaceAll("\n", "\r\n")}${delta}${done}data: [DONE]\n\n`;
  const bytes = new TextEncoder().encode(text);
  for (let split = 1; split < bytes.length; split += 1) {
    const result = await readOpenAiSpeechStream(stream([bytes.slice(0, split), bytes.slice(split)]));
    assert.deepEqual(new Uint8Array(result.audio), new Uint8Array([1, 2, 3, 1, 2, 3]));
    assert.deepEqual(result.usage, usage);
  }
  assert.deepEqual((await readOpenAiSpeechStream(stream(Array.from(bytes, (byte) => new Uint8Array([byte]))))).usage, usage);
});

test("speech stream supports multiline data and ignores SSE metadata", async () => {
  const result = await parse('id: 1\nretry: 3000\ndata:{"type": "speech.audio.delta",\ndata: "audio":"AQID"}\n\n' + done);
  assert.deepEqual(new Uint8Array(result.audio), new Uint8Array([1, 2, 3]));
});

test("missing usage does not discard completed audio or invent a zero cost", async () => {
  const result = await parse(delta + frame({ type: "speech.audio.done" }));
  assert.deepEqual(new Uint8Array(result.audio), new Uint8Array([1, 2, 3]));
  assert.equal(result.usage, undefined);
});

test("empty, truncated, failed and duplicate streams cannot return partial audio", async () => {
  for (const text of ["", delta, done, delta + done.trimEnd(), delta + "data: [DONE]\n\n",
    delta + frame({ type: "error", error: "failure" }), delta + done + delta, delta + done + done,
    "data: {invalid}\n\n", "data: null\n\n", "data: []\n\n",
    delta + done + "data: unfinished", delta + frame({ type: "unexpected" }),
  ]) await assert.rejects(parse(text), SpeechStreamError);
  await assert.rejects(readOpenAiSpeechStream(null), SpeechStreamError);
});

test("invalid base64 cannot be silently decoded", async () => {
  for (const audio of ["", "A", "AQI", "AQID====", "A=ID", "AQ D", "!!!!", "Zh==", null, 12]) {
    await assert.rejects(parse(frame({ type: "speech.audio.delta", audio }) + done), SpeechStreamError);
  }
  for (const audio of ["AQ==", "AQI="]) {
    const result = await parse(frame({ type: "speech.audio.delta", audio }) + done);
    assert.deepEqual(Buffer.from(result.audio), Buffer.from(audio, "base64"));
  }
});

test("oversized event, stream and audio are bounded", async () => {
  await assert.rejects(parse("data: " + "x".repeat(2 * 1024 * 1024)), SpeechStreamError);
  await assert.rejects(parse("data: " + "x".repeat(2 * 1024 * 1024) + "\n\n"), SpeechStreamError);
  const largeDelta = frame({ type: "speech.audio.delta", audio: Buffer.alloc(1024 * 1024).toString("base64") });
  await assert.rejects(parse(largeDelta.repeat(9) + done), SpeechStreamError);
  await assert.rejects(parse(":keepalive\n\n".repeat(1_200_000)), SpeechStreamError);
});

test("invalid UTF8 and transport failures reject without returning partial audio", async () => {
  await assert.rejects(readOpenAiSpeechStream(stream([new Uint8Array([0xc3, 0x28])])), TypeError);
  const transportError = new Error("transport interrupted");
  await assert.rejects(readOpenAiSpeechStream(new ReadableStream({
    start(controller) { controller.error(transportError); },
  })), transportError);
});

test("a parser failure cancels the upstream stream and releases the reader", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode("data: invalid\n\n")); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readOpenAiSpeechStream(body), SpeechStreamError);
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});
