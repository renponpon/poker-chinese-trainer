import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import test from "node:test";

test("usage metadata requests are bounded, unretried and fail closed", async (context) => {
  const envNames = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const previousEnv = envNames.map((name) => process.env[name]);
  envNames.forEach((name, index) => {
    process.env[name] = index === 0 ? "https://usage-test.invalid" : "offline-test-key";
  });
  context.after(() => envNames.forEach((name, index) => {
    if (previousEnv[index] === undefined) delete process.env[name];
    else process.env[name] = previousEnv[index];
  }));
  const refuseNetwork = () => { throw new Error("Real network is forbidden"); };
  context.mock.method(http, "request", refuseNetwork);
  context.mock.method(https, "request", refuseNetwork);
  context.mock.method(console, "error", () => {});
  const calls: { url: URL; method: string; body: unknown; signal: AbortSignal }[] = [];
  let countHeader: string | null = "0-0/4";
  let responseStatus = 200;
  let networkError = false;
  let neverRespond = false;
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, "https://usage-test.invalid");
    assert.equal(url.pathname, "/rest/v1/ai_usage_events");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer offline-test-key");
    assert.equal(headers.get("x-retry-count"), null);
    assert.ok(init?.signal);
    calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : null, signal: init.signal });
    if (networkError) throw new TypeError("Offline connection failure");
    if (neverRespond) return new Promise<Response>(() => {});
    const responseHeaders: Record<string, string> = { "retry-after": "60" };
    if (countHeader !== null) responseHeaders["content-range"] = countHeader;
    return new Response(null, { status: responseStatus, headers: responseHeaders });
  });
  const admin = await import("./supabase-admin");
  const actor = { actorType: "guest" as const, userId: null, ipHash: "offline-ip", now: new Date("2026-09-09T12:34:00Z") };
  const event = {
    requestId: "offline-request", userId: null, actorType: "guest" as const, ipHash: "offline-ip",
    endpoint: "/api/speech/synthesize", feature: "usage_event" as const, provider: "openai" as const,
    mode: "text_to_speech", sourcePage: null, direction: null, inputChars: 6, outputChars: 0,
    audioDurationMs: null, success: true, errorCode: null, model: "gpt-4o-mini-tts",
  };
  const reset = () => {
    calls.length = 0;
    countHeader = "0-0/4";
    responseStatus = 200;
    networkError = neverRespond = false;
  };

  await context.test("preserves exact daily count, actor scope and UTC boundary", async () => {
    assert.equal(await admin.countAiUsageToday(actor), 4);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "HEAD");
    assert.deepEqual(Object.fromEntries(calls[0].url.searchParams), {
      select: "id", actor_type: "eq.guest", created_at: "gte.2026-09-09T00:00:00.000Z", ip_hash: "eq.offline-ip",
    });
    reset();
    assert.equal(await admin.countAiUsageToday({ ...actor, actorType: "user", userId: "offline-user" }), 4);
    assert.equal(calls[0].url.searchParams.get("user_id"), "eq.offline-user");
    assert.equal(calls[0].url.searchParams.has("ip_hash"), false);
  });
  await context.test("preserves phrase-pack filters and ownership checks", async () => {
    reset();
    assert.equal(await admin.countPhrasePackUsageToday(actor), 4);
    assert.equal(calls[0].url.searchParams.get("endpoint"), "eq./api/phrase/generate-pack");
    assert.equal(calls[0].url.searchParams.get("mode"), "eq.phrase_pack");
    assert.equal(calls[0].url.searchParams.get("success"), "eq.true");
    reset();
    assert.equal(await admin.isValidPhrasePackRequest({ ...actor, packRequestId: "offline-pack" }), true);
    assert.equal(calls[0].url.searchParams.get("request_id"), "eq.offline-pack");
    assert.equal(calls[0].url.searchParams.get("ip_hash"), "eq.offline-ip");
  });
  await context.test("does not read all users when actor identity is absent", async () => {
    reset();
    const unidentified = { ...actor, ipHash: null };
    assert.equal(await admin.countAiUsageToday(unidentified), null);
    assert.equal(await admin.countPhrasePackUsageToday(unidentified), null);
    assert.equal(await admin.isValidPhrasePackRequest({ ...unidentified, packRequestId: "offline-pack" }), false);
    assert.equal(calls.length, 0);
  });
  await context.test("only a confirmed zero counts as zero; missing and malformed counts fail closed", async () => {
    reset();
    countHeader = "*/0";
    assert.equal(await admin.countAiUsageToday(actor), 0);
    for (const header of [null, "*/*", "*/NaN", "*/-1", "*/9007199254740992"]) {
      countHeader = header;
      assert.equal(await admin.countAiUsageToday(actor), null);
      assert.equal(await admin.countPhrasePackUsageToday(actor), null);
      assert.equal(await admin.isValidPhrasePackRequest({ ...actor, packRequestId: "offline-pack" }), false);
    }
  });
  await context.test("network and retryable HTTP failures make one attempt, not automatic retries", async () => {
    for (const status of [403, 500, 520]) {
      reset();
      responseStatus = status;
      assert.equal(await admin.countAiUsageToday(actor), null);
      assert.equal(calls.length, 1);
    }
    reset();
    networkError = true;
    assert.equal(await admin.countAiUsageToday(actor), null);
    assert.equal(calls.length, 1);
  });
  await context.test("usage insert stays awaited and preserves the event payload", async () => {
    reset();
    responseStatus = 201;
    assert.equal(await admin.recordAiUsageEvent(event), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(calls[0].body, {
      request_id: event.requestId, user_id: null, actor_type: "guest", ip_hash: event.ipHash,
      endpoint: event.endpoint, feature: "usage_event", provider: "openai", mode: "text_to_speech",
      source_page: null, direction: null, input_chars: 6, output_chars: 0, audio_duration_ms: null,
      success: true, error_code: null, model: event.model,
    });
  });
  await context.test("failed insert is not retried or reported as recorded", async () => {
    for (const mode of ["http", "network"]) {
      reset();
      responseStatus = 500;
      networkError = mode === "network";
      assert.equal(await admin.recordAiUsageEvent(event), false);
      assert.equal(calls.length, 1);
    }
  });
  await context.test("quota checks and usage writes stop at 8 seconds even if fetch ignores abort", async (timedContext) => {
    timedContext.mock.timers.enable({ apis: ["setTimeout"] });
    const operations = [
      () => admin.countAiUsageToday(actor),
      () => admin.countPhrasePackUsageToday(actor),
      () => admin.isValidPhrasePackRequest({ ...actor, packRequestId: "offline-pack" }),
      () => admin.recordAiUsageEvent(event),
    ];
    for (const [index, operation] of operations.entries()) {
      reset();
      neverRespond = true;
      let finished = false;
      const pending = operation().then((value) => { finished = true; return value; });
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(calls.length, 1);
      timedContext.mock.timers.tick(7_999);
      await Promise.resolve();
      assert.equal(finished, false);
      timedContext.mock.timers.tick(1);
      assert.equal(await pending, index < 2 ? null : false);
      assert.equal(calls[0].signal.aborted, true);
      assert.equal(calls.length, 1);
    }
  });
});
