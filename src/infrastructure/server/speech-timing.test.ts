import assert from "node:assert/strict";
import test from "node:test";
import { markSpeechStage, measureSpeechStage, withSpeechTiming } from "./speech-timing";

test("speech timing is opt-in, isolated, numeric-only and unavailable in production", async (context) => {
  const originalFlag = process.env.PHRABIT_SPEECH_TIMING;
  const originalEnvironment = process.env.VERCEL_ENV;
  context.after(() => {
    if (originalFlag === undefined) delete process.env.PHRABIT_SPEECH_TIMING;
    else process.env.PHRABIT_SPEECH_TIMING = originalFlag;
    if (originalEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalEnvironment;
  });
  let clock = 0;
  context.mock.method(performance, "now", () => clock);
  const response = () => new Response("audio", { headers: { "Cache-Control": "private, max-age=86400" } });
  const measuredResponse = () => withSpeechTiming(async () => {
    await measureSpeechStage("budget_reserve", async () => { clock += 200; });
    return response();
  });

  await context.test("disabled by default and even with flag enabled in production", async () => {
    for (const [flag, environment] of [["0", "preview"], ["1", "production"], ["true", "preview"]]) {
      process.env.PHRABIT_SPEECH_TIMING = flag;
      process.env.VERCEL_ENV = environment;
      const result = await measuredResponse();
      assert.equal(result.headers.get("server-timing"), null);
      assert.equal(result.headers.get("cache-control"), "private, max-age=86400");
    }
  });
  process.env.PHRABIT_SPEECH_TIMING = "1";
  process.env.VERCEL_ENV = "preview";
  await context.test("durations and first-only marks have stable numeric names and no input data", async () => {
    clock = 0;
    const result = await withSpeechTiming(async () => {
      await measureSpeechStage("budget_reserve", async () => { clock = 200; });
      markSpeechStage("first_audio_at");
      clock = 250;
      markSpeechStage("first_audio_at");
      return response();
    });
    assert.equal(result.headers.get("server-timing"), "budget_reserve;dur=200.0, first_audio_at;dur=200.0, total;dur=250.0");
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(await result.text(), "audio");
  });
  await context.test("failure timing preserves the original error and handled status", async () => {
    const failure = new Error("private provider message");
    const result = await withSpeechTiming(async () => {
      await assert.rejects(measureSpeechStage("provider_headers", async () => {
        clock += 80;
        throw failure;
      }), (error) => error === failure);
      return new Response(null, { status: 502 });
    });
    assert.equal(result.status, 502);
    assert.equal(result.headers.get("server-timing"), "provider_headers;dur=80.0, total;dur=80.0");
    await assert.rejects(withSpeechTiming(async () => { throw failure; }), (error) => error === failure);
  });
  await context.test("simultaneous requests do not share timing entries", async () => {
    const results = await Promise.all(["actor", "daily_quota"].map((stage) => withSpeechTiming(async () => {
      await measureSpeechStage(stage as "actor" | "daily_quota", async () => { await Promise.resolve(); });
      return response();
    })));
    assert.match(results[0].headers.get("server-timing")!, /^actor;dur=/);
    assert.doesNotMatch(results[0].headers.get("server-timing")!, /daily_quota/);
    assert.match(results[1].headers.get("server-timing")!, /^daily_quota;dur=/);
    assert.doesNotMatch(results[1].headers.get("server-timing")!, /actor/);
  });
});
