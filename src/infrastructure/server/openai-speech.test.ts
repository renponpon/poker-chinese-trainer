import assert from "node:assert/strict";
import test from "node:test";
import { transcribeSpeechWithOpenAi, synthesizeSpeechWithOpenAi } from "./openai-speech";

test("speech reservation and usage settlement with all external network mocked", async (context) => {
  const originalFetch = globalThis.fetch;
  const envNames = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY", "OPENAI_TRANSCRIBE_MODEL", "OPENAI_TTS_MODEL", "OPENAI_TTS_VOICE"];
  const originalEnv = envNames.map((name) => process.env[name]);
  context.after(() => {
    globalThis.fetch = originalFetch;
    envNames.forEach((name, index) => {
      if (originalEnv[index] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[index];
    });
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://budget-test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  process.env.OPENAI_API_KEY = "test-only";
  process.env.OPENAI_TRANSCRIBE_MODEL = "gpt-4o-transcribe";
  process.env.OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
  process.env.OPENAI_TTS_VOICE = "marin";
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  let status = "reserved";
  let providerStatus = 200;
  let response: Record<string, unknown> = {};
  let speechUsage: unknown = { input_tokens: 14, output_tokens: 101, total_tokens: 115 };
  let speechMode = "complete";
  let expectedAudio: File | null = null;
  let providerMode = "normal";
  let settlementFails = false;
  globalThis.fetch = async (url, init) => {
    const address = String(url);
    if (address.startsWith("https://budget-test.invalid/rest/v1/rpc/")) {
      calls.push({ url: address, body: JSON.parse(String(init?.body)) });
      if (address.endsWith("settle_ai_budget") && settlementFails) throw new TypeError("Ambiguous settlement failure");
      return Response.json(address.endsWith("reserve_ai_budget") ? status : "settled");
    }
    if (address === "https://api.openai.com/v1/audio/transcriptions") {
      const form = init?.body as FormData;
      assert.equal(form.get("response_format"), form.get("model") === "whisper-1" ? "verbose_json" : "json");
      assert.equal(form.get("language"), "ja");
      const fields: string[] = [];
      form.forEach((_value, key) => fields.push(key));
      assert.deepEqual(fields.sort(), ["file", "language", "model", "response_format"]);
      calls.push({ url: address, body: { model: form.get("model") } });
      if (expectedAudio) {
        const uploaded = form.get("file") as File;
        assert.equal(uploaded.name, expectedAudio.name);
        assert.equal(uploaded.type, expectedAudio.type);
        assert.equal(uploaded.size, expectedAudio.size);
        assert.deepEqual(await uploaded.arrayBuffer(), await expectedAudio.arrayBuffer());
      }
      if (providerMode === "network") throw new TypeError("Ambiguous provider failure");
      if (providerMode === "malformed-json") return new Response("{incomplete");
      if (providerMode === "never") return new Promise<Response>(() => {});
      return Response.json(response, { status: providerStatus });
    }
    if (address === "https://api.openai.com/v1/audio/speech") {
      const body = JSON.parse(String(init?.body));
      calls.push({ url: address, body });
      if (providerStatus !== 200) return Response.json({ error: { message: "failure" } }, { status: providerStatus });
      if (!body.stream_format || speechMode === "wrong-type") return new Response(new Uint8Array([1, 2, 3]));
      const delta = 'data: {"type":"speech.audio.delta","audio":"AQID"}\n\n';
      const done = `data: ${JSON.stringify({ type: "speech.audio.done", usage: speechUsage })}\n\n`;
      return new Response(delta + (speechMode === "complete" ? done : ""), { headers: { "content-type": "text/event-stream; charset=utf-8" } });
    }
    throw new Error("Unexpected network request");
  };
  const generate = () => transcribeSpeechWithOpenAi({ audio: new File([new Uint8Array(102400)], "test.webm"), languageHint: "ja" });
  const usage = { type: "tokens", input_tokens: 100, output_tokens: 20, total_tokens: 120 };

  await context.test("100 KiB reserves the 18 yen single-block ceiling and settles to 0.15 yen", async () => {
    response = { text: "  そこに置いてください  ", usage };
    assert.deepEqual(await generate(), { transcript: "そこに置いてください", model: "gpt-4o-transcribe" });
    assert.equal(calls[0].body.requested_units, 600);
    assert.equal(calls[2].body.actual_units, 5);
    assert.equal(calls[0].body.reservation_id, calls[2].body.reservation_id);
    assert.equal(calls.length, 3);
  });
  await context.test("unavailable and exceeded budget stop before any provider request", async () => {
    for (status of ["unconfigured", "exceeded"]) {
      calls.length = 0;
      await assert.rejects(generate(), (error: Error & { code?: string }) => error.code === (status === "exceeded" ? "ai_budget_exceeded" : "ai_budget_unavailable"));
      assert.equal(calls.length, 1);
    }
    status = "reserved";
  });
  await context.test("file formats, filenames and codec bytes pass through unchanged without parsing or trusting duration", async () => {
    for (const [name, type] of [["speech.webm", "audio/webm;codecs=opus"], ["speech.mp4", "audio/mp4"],
      ["speech.m4a", "audio/mp4;codecs=mp4a.40.2"], ["speech.mp3", "audio/mpeg"],
      ["speech.wav", "audio/wav"], ["speech.ogg", "audio/ogg"], ["unrecognized.bin", "application/octet-stream"]]) {
      calls.length = 0;
      expectedAudio = new File([new Uint8Array([0, 255, 18, 4, 55])], name, { type });
      response = { text: "テスト", usage };
      await transcribeSpeechWithOpenAi({ audio: expectedAudio, languageHint: "ja" });
      assert.equal(calls[0].body.requested_units, 600);
      assert.equal(calls.length, 3);
    }
    expectedAudio = null;
  });
  await context.test("empty and oversized files cannot reserve money or reach the provider", async () => {
    for (const size of [0, 5 * 1024 * 1024 + 1]) {
      calls.length = 0;
      await assert.rejects(transcribeSpeechWithOpenAi({ audio: new File([new Uint8Array(size)], "test.webm"), languageHint: "ja" }), { code: "invalid_audio_size" });
      assert.equal(calls.length, 0);
    }
    calls.length = 0;
    await transcribeSpeechWithOpenAi({ audio: new File([new Uint8Array(5 * 1024 * 1024)], "limit.mp4"), languageHint: "ja" });
    assert.equal(calls[0].body.requested_units, 600);
  });
  await context.test("single-block maximum usage fits its reservation, larger reported usage is never clamped", async () => {
    for (const outputTokens of [2000, 2001]) {
      calls.length = 0;
      response = { text: "テスト", usage: { type: "tokens", input_tokens: 16000, output_tokens: outputTokens, total_tokens: 16000 + outputTokens } };
      await generate();
      assert.equal(calls[0].body.requested_units, 600);
      assert.equal(calls[2].body.actual_units, outputTokens === 2000 ? 600 : 601);
    }
  });
  await context.test("unknown transport outcomes and incomplete JSON retain the full reservation and never retry", async () => {
    for (providerMode of ["network", "malformed-json"]) {
      calls.length = 0;
      await assert.rejects(generate());
      assert.equal(calls.length, 2);
      assert.equal(calls[0].body.requested_units, 600);
    }
    providerMode = "normal";
  });
  await context.test("settlement failure still returns an existing transcript and makes no second provider call", async () => {
    calls.length = 0;
    response = { text: "テスト", usage };
    settlementFails = true;
    assert.equal((await generate()).transcript, "テスト");
    assert.equal(calls.length, 3);
    assert.equal(calls[2].body.actual_units, 5);
    settlementFails = false;
  });
  await context.test("provider timeout retains the reservation without a retry", async (timeoutContext) => {
    timeoutContext.mock.timers.enable({ apis: ["setTimeout"] });
    calls.length = 0;
    providerMode = "never";
    const pending = assert.rejects(generate(), { code: "request_timeout" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 2);
    timeoutContext.mock.timers.tick(35_000);
    await pending;
    assert.equal(calls.length, 2);
    providerMode = "normal";
  });
  await context.test("missing usage returns the transcript but keeps the reservation", async () => {
    calls.length = 0;
    response = { text: "テスト", duration: 0.1 };
    assert.equal((await generate()).transcript, "テスト");
    assert.equal(calls.length, 2);
  });
  await context.test("failed provider request never releases unknown charges or retries", async () => {
    calls.length = 0;
    providerStatus = 500;
    response = { error: { message: "failure" } };
    await assert.rejects(generate(), { code: "openai_transcribe_failed" });
    assert.equal(calls.length, 2);
    providerStatus = 200;
  });
  await context.test("empty transcript still accounts for known billed usage", async () => {
    calls.length = 0;
    response = { text: " ", usage };
    await assert.rejects(generate(), { code: "empty_transcript" });
    assert.equal(calls[2].body.actual_units, 5);
  });
  await context.test("Whisper keeps its original verbose response and seconds", async () => {
    calls.length = 0;
    process.env.OPENAI_TRANSCRIBE_MODEL = "whisper-1";
    response = { text: "テスト", duration: 1.2 };
    await generate();
    assert.equal(calls[2].body.actual_units, 2);
  });
  await context.test("TTS model, voice, instructions and MP3 output are unchanged", async () => {
    calls.length = 0;
    const result = await synthesizeSpeechWithOpenAi({ text: "Hello", instructions: "Speak clearly." });
    assert.deepEqual(new Uint8Array(result.audio), new Uint8Array([1, 2, 3]));
    assert.deepEqual(calls[1].body, {
      model: "gpt-4o-mini-tts", voice: "marin", input: "Hello", response_format: "mp3", instructions: "Speak clearly.",
      stream_format: "sse",
    });
    assert.equal(calls[0].body.requested_units, 147);
    assert.equal(calls[2].body.actual_units, 4);
    assert.equal(calls[0].body.reservation_id, calls[2].body.reservation_id);
    assert.equal(calls.length, 3);
  });
  const speak = () => synthesizeSpeechWithOpenAi({ text: "Hello", instructions: "Speak clearly." });
  await context.test("TTS keeps the reservation for missing or invalid usage", async () => {
    for (speechUsage of [undefined, null, {}, { input_tokens: 1, output_tokens: 2, total_tokens: 999 }]) {
      calls.length = 0;
      assert.deepEqual(new Uint8Array((await speak()).audio), new Uint8Array([1, 2, 3]));
      assert.equal(calls.length, 2);
    }
    speechUsage = { input_tokens: 14, output_tokens: 101, total_tokens: 115 };
  });
  await context.test("blocked TTS never calls the provider", async () => {
    for (status of ["exceeded", "unconfigured"]) {
      calls.length = 0;
      await assert.rejects(speak(), (error: Error & { code?: string }) => error.code === (status === "exceeded" ? "ai_budget_exceeded" : "ai_budget_unavailable"));
      assert.equal(calls.length, 1);
    }
    status = "reserved";
  });
  await context.test("TTS HTTP failure and incomplete or wrong-format audio never retry or refund", async () => {
    for (speechMode of ["incomplete", "wrong-type", "complete"]) {
      providerStatus = speechMode === "complete" ? 500 : 200;
      calls.length = 0;
      await assert.rejects(speak(), { code: "openai_tts_failed" });
      assert.equal(calls.length, 2);
    }
    providerStatus = 200;
  });
  await context.test("legacy TTS models retain raw MP3 without the mini TTS token conversion", async () => {
    calls.length = 0;
    process.env.OPENAI_TTS_MODEL = "tts-1";
    assert.deepEqual(new Uint8Array((await speak()).audio), new Uint8Array([1, 2, 3]));
    assert.equal(calls[1].body.stream_format, undefined);
    assert.equal(calls.length, 2);
  });
});
