import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const root = resolve("src");
const nativeRequire = createRequire(resolve("package.json"));
const modules = new Map();
const overrides = new Map();
let delays = {};
let reservationStatus = "reserved";
let quotaBlocked = false;
let malformedStream = false;
let providerCalls = 0;
let reserveCalls = 0;
let settleCalls = 0;
let recordedEvents = 0;
const afterTasks = [];
const pause = async (stage) => {
  if (delays[stage]) await new Promise((resolve) => setTimeout(resolve, delays[stage]));
};
overrides.set("next/server", { NextResponse: { json: Response.json }, after: (task) => { afterTasks.push(task); } });
overrides.set(resolve(root, "infrastructure/server/usage-event-recorder"), {
  recordAiUsageEvent: async () => { await pause("usage_record"); recordedEvents += 1; return true; },
});
overrides.set(resolve(root, "lib/server/supabase-admin"), {
  countAiUsageToday: async () => { await pause("daily_quota"); return quotaBlocked ? 10000 : 0; },
  isUsageTrackingConfigured: () => true,
  getUserIdFromAccessToken: async () => { throw new Error("Unexpected authentication request"); },
});

function loadSource(path) {
  const filename = path.endsWith(".ts") ? path : path + ".ts";
  if (modules.has(filename)) return modules.get(filename).exports;
  const compiledModule = { exports: {} };
  modules.set(filename, compiledModule);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const require = (name) => {
    const target = name.startsWith("@/") ? resolve(root, name.slice(2)) : name.startsWith(".") ? resolve(dirname(filename), name) : null;
    if (overrides.has(target ?? name)) return overrides.get(target ?? name);
    return target ? loadSource(target) : nativeRequire(name);
  };
  runInThisContext("(function(require,module,exports){" + code + "\n})", { filename })(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://speech-timing-test.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
process.env.OPENAI_API_KEY = "test-only";
process.env.OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
process.env.OPENAI_TTS_VOICE = "marin";
process.env.PHRABIT_SPEECH_TIMING = "1";
process.env.VERCEL_ENV = "preview";
globalThis.fetch = async (url, init) => {
  if (String(url) === "https://speech-timing-test.invalid/rest/v1/rpc/reserve_ai_budget") {
    reserveCalls += 1;
    await pause("budget_reserve");
    assert.ok(JSON.parse(init.body).requested_units > 0);
    return Response.json(reservationStatus);
  }
  if (String(url) === "https://speech-timing-test.invalid/rest/v1/rpc/settle_ai_budget") {
    settleCalls += 1;
    assert.equal(JSON.parse(init.body).actual_units, 4);
    return Response.json("settled");
  }
  if (String(url) === "https://api.openai.com/v1/audio/speech") {
    assert.equal(reservationStatus, "reserved");
    assert.equal(reserveCalls, 1);
    providerCalls += 1;
    await pause("provider_headers");
    assert.equal(JSON.parse(init.body).stream_format, "sse");
    const stream = new ReadableStream({
      async start(controller) {
        const done = 'data: {"type":"speech.audio.done","usage":{"input_tokens":14,"output_tokens":101,"total_tokens":115}}\n\n';
        controller.enqueue(new TextEncoder().encode('data: {"type":"speech.audio.delta","audio":"AQID"}\n\n' + (malformedStream ? "" : done)));
        await pause("stream_tail");
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream" } });
  }
  throw new Error("Unexpected request: real external network is disabled");
};
const { POST } = loadSource(resolve(root, "app/api/speech/synthesize/route"));
const request = () => new Request("http://localhost/api/speech/synthesize", {
  method: "POST", body: JSON.stringify({ text: "Hello.", langCode: "en-US" }),
  headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.1" },
});
function reset() {
  providerCalls = reserveCalls = settleCalls = recordedEvents = 0;
  afterTasks.length = 0;
  delays = {};
  quotaBlocked = malformedStream = false;
  reservationStatus = "reserved";
}

for (const stage of ["daily_quota", "budget_reserve", "provider_headers", "stream_tail", "usage_record"]) {
  reset();
  delays = { [stage]: 120 };
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(response.headers.get("x-request-id"));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
  const header = response.headers.get("server-timing");
  assert.match(header, /^(?:[a-z_]+;dur=\d+\.\d)(?:, [a-z_]+;dur=\d+\.\d)*$/);
  const timing = Object.fromEntries(header.split(", ").map((entry) => {
    const [name, duration] = entry.split(";dur=");
    return [name, Number(duration)];
  }));
  const measured = stage === "stream_tail" ? timing.stream_eof_at - timing.audio_done_at : timing[stage];
  assert.ok(measured >= 100, `${stage}: ${measured}`);
  assert.ok(timing.total >= measured);
  assert.equal(recordedEvents, 1);
  assert.equal(providerCalls, 1);
  assert.equal(settleCalls, 0);
  assert.equal(afterTasks.length, 1);
  await afterTasks.shift()();
  assert.equal(settleCalls, 1);
  console.log(JSON.stringify({ injectedStage: stage, injectedMs: 120, measuredMs: measured, timing, realExternalCalls: 0 }));
}
for (const scenario of ["quota", "exceeded", "unconfigured", "incomplete"]) {
  reset();
  quotaBlocked = scenario === "quota";
  malformedStream = scenario === "incomplete";
  if (["exceeded", "unconfigured"].includes(scenario)) reservationStatus = scenario;
  const response = await POST(request());
  assert.equal(response.status, scenario === "unconfigured" ? 503 : scenario === "incomplete" ? 502 : 429);
  assert.ok(response.headers.get("server-timing"));
  assert.equal(providerCalls, scenario === "incomplete" ? 1 : 0);
  assert.equal(reserveCalls, quotaBlocked ? 0 : 1);
  assert.equal(settleCalls, 0);
  assert.equal(afterTasks.length, 0);
  assert.equal(recordedEvents, 1);
}
for (const environment of ["production", "preview"]) {
  reset();
  process.env.VERCEL_ENV = environment;
  process.env.PHRABIT_SPEECH_TIMING = environment === "production" ? "1" : "0";
  const response = await POST(request());
  assert.equal(response.headers.get("server-timing"), null);
  assert.equal(response.headers.get("cache-control"), "private, max-age=86400");
  assert.equal(providerCalls, 1);
  await afterTasks.shift()();
}
console.log("PASS TTS stage attribution: five injected delays, quota/budget/error safety, deferred settlement, opt-in privacy; real external calls 0");
