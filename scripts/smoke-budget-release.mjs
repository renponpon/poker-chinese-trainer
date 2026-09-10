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
const budgetCalls = [];
const geminiRequests = [];
let providerCalls = 0;
let budgetStatus = "exceeded";
let geminiResponseText = "Hello";
const afterTasks = [];
overrides.set("next/server", { NextResponse: { json: Response.json }, after: (task) => { afterTasks.push(task); } });

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

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://budget-test.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
for (const name of ["GEMINI_API_KEY", "DEEPL_API_KEY", "AZURE_TRANSLATOR_KEY", "OPENAI_API_KEY"]) process.env[name] = "test";
for (const name of ["OPENAI_TRANSCRIBE_MODEL", "OPENAI_TTS_MODEL", "AZURE_TRANSLATOR_ENDPOINT", "DEEPL_API_ENDPOINT"]) delete process.env[name];
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://budget-test.invalid/rest/v1/rpc/")) {
    budgetCalls.push(JSON.parse(init.body));
    return Response.json(String(url).endsWith("reserve_ai_budget") ? budgetStatus : "settled");
  }
  providerCalls += 1;
  if (String(url).includes("/v2/translate")) return Response.json({ translations: [{ text: "Hello" }] });
  if (String(url).includes("/translate?")) return Response.json([{ translations: [{ text: "Hello" }] }]);
  if (String(url).includes("/transliterate?")) return Response.json([{ text: "ni hao" }]);
  if (String(url).includes("/audio/transcriptions")) {
    assert.equal(init.body.get("response_format"), init.body.get("model") === "whisper-1" ? "verbose_json" : "json");
    return Response.json({ text: "Hello", duration: 1.2, usage: { type: "tokens", input_tokens: 100, output_tokens: 20, total_tokens: 120 } });
  }
  if (String(url).includes("/audio/speech")) {
    assert.equal(JSON.parse(init.body).stream_format, "sse");
    return new Response('data: {"type":"speech.audio.delta","audio":"AQID"}\n\ndata: {"type":"speech.audio.done","usage":{"input_tokens":14,"output_tokens":101,"total_tokens":115}}\n\n', { headers: { "content-type": "text/event-stream" } });
  }
  throw new Error("Unexpected request; real network is disabled");
};
overrides.set("@google/genai", { GoogleGenAI: class {
  constructor(options) {
    assert.equal(options.httpOptions.retryOptions.attempts, 1);
    this.models = { generateContent: async (input) => {
      providerCalls += 1;
      assert.ok(input.config.abortSignal);
      assert.equal(input.config.maxOutputTokens, 16384);
      geminiRequests.push(input);
      return { text: geminiResponseText, usageMetadata: { totalTokenCount: 1200 } };
    } };
  }
} });
const gemini = loadSource(resolve(root, "infrastructure/server/gemini-client"));
const speech = loadSource(resolve(root, "infrastructure/server/openai-speech"));
const paths = [
  ["gemini:test-model", () => gemini.generateGeminiText({ model: "test-model", contents: "こんにちは" })],
  ["deepl:translate", () => loadSource(resolve(root, "lib/server/deepl-translator")).translateWithDeepL({ direction: "ja-to-en", text: "こんにちは" })],
  ["azure:translate", () => loadSource(resolve(root, "lib/server/azure-translator")).translateWithAzure({ direction: "ja-to-en", text: "こんにちは" })],
  ["azure:transliterate", () => loadSource(resolve(root, "lib/server/azure-translator")).transliterateChinesePinyin("你好")],
  ["openai:tts:gpt-4o-mini-tts", () => speech.synthesizeSpeechWithOpenAi({ text: "hello", instructions: "clearly" })],
  ["openai:transcribe:whisper-1", () => speech.transcribeSpeechWithOpenAi({ audio: new File(["test"], "speech.webm"), languageHint: "auto" })],
];
for (const [operation, call] of paths) {
  for (const status of ["exceeded", "unconfigured"]) {
    budgetStatus = status;
    const before = providerCalls;
    await assert.rejects(call(), (error) => error.code === (status === "exceeded" ? "ai_budget_exceeded" : "ai_budget_unavailable"));
    assert.equal(providerCalls, before);
    assert.equal(budgetCalls.at(-1).operation_name, operation);
  }
  budgetStatus = "reserved";
  const before = providerCalls;
  await call();
  assert.equal(providerCalls, before + 1);
}
assert.equal(budgetCalls.filter((call) => call.actual_units === 2).length, 2);
assert.equal(budgetCalls.filter((call) => call.actual_units === 4).length, 1);
process.env.OPENAI_TRANSCRIBE_MODEL = "gpt-4o-transcribe";
await speech.transcribeSpeechWithOpenAi({ audio: new File(["test"], "speech.webm"), languageHint: "ja" });
assert.equal(budgetCalls.at(-2).operation_name, "openai:transcribe:gpt-4o-transcribe");
assert.equal(budgetCalls.at(-1).actual_units, 5);
const beforeOversized = providerCalls;
const beforeReservations = budgetCalls.length;
await assert.rejects(gemini.generateGeminiText({ model: "test-model", contents: "あ".repeat(50000) }), (error) => error.code === "ai_budget_unavailable");
assert.equal(providerCalls, beforeOversized);
assert.equal(budgetCalls.length, beforeReservations);

const quality = loadSource(resolve(root, "infrastructure/server/quality-phrase-generator"));
const prompts = loadSource(resolve(root, "infrastructure/server/quality-phrase-prompt"));
for (const direction of ["ja-to-en", "ja-to-zh", "zh-to-ja", "en-to-ja"]) {
  const sourceText = direction.startsWith("ja-") ? "私に返してください。" : direction.startsWith("zh-") ? "请还给我。" : "Please return it to me.";
  const targetText = direction === "ja-to-zh" ? "请还给我。" : direction.endsWith("-ja") ? "私に返してください。" : "Please return it to me.";
  geminiResponseText = JSON.stringify({ sourceText, targetText, explanation: "元の解説。" });
  const prompt = prompts.buildQualityPrompt(direction);
  const before = providerCalls;
  const result = await quality.generateQualityPhraseWithGemini({
    model: "test-model", direction, inputText: sourceText, prompt,
    createMissingApiKeyError: () => new Error("missing key"), createEmptyResponseError: () => new Error("empty response"),
  });
  assert.equal(providerCalls, before + 1);
  assert.equal(result.sourceText, sourceText);
  assert.equal(result.targetText, targetText);
  assert.equal(result.explanation, "元の解説。");
  const request = geminiRequests.at(-1);
  assert.equal(request.contents, `${prompt}\n\nInput:\n"${sourceText}"`);
  assert.equal(request.config.systemInstruction, undefined);
  assert.equal(request.config.responseJsonSchema, undefined);
  assert.equal(budgetCalls.at(-2).requested_units, Math.ceil((Buffer.byteLength(request.contents, "utf8") + 32768) / 1000));
}
overrides.set(resolve(root, "lib/server/supabase-admin"), {
  countAiUsageToday: async () => null, isUsageTrackingConfigured: () => true,
});
const usage = loadSource(resolve(root, "infrastructure/server/usage-limits"));
await assert.rejects(usage.assertWithinDailyAiLimit({ type: "guest", userId: null, ipHash: "test", dailyLimit: 10 }), usage.UsageTrackingError);
const { withDeferredBudgetSettlement } = loadSource(resolve(root, "lib/server/with-ai-budget-settlements"));
const beforeDeferred = budgetCalls.length;
const route = withDeferredBudgetSettlement(async () => Response.json(await speech.transcribeSpeechWithOpenAi({
  audio: new File([new Uint8Array(102400)], "speech.webm"), languageHint: "ja",
})));
const routeResponse = await route(new Request("https://test.invalid/api/speech/transcribe", { method: "POST" }));
assert.equal((await routeResponse.json()).transcript, "Hello");
assert.equal(budgetCalls.length, beforeDeferred + 1);
assert.equal(afterTasks.length, 1);
await afterTasks.shift()();
assert.equal(budgetCalls.at(-1).actual_units, 5);
for (const path of ["phrase/add", "phrase/explain", "phrase/generate-pack", "phrase/generate-pack/explain", "speech/synthesize", "speech/transcribe"]) {
  assert.ok(readFileSync(resolve(root, `app/api/${path}/route.ts`), "utf8").includes("export const POST = withDeferredBudgetSettlement(handlePost);"), path);
}

const immediateFetch = globalThis.fetch;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
globalThis.fetch = async (url, init) => {
  await delay(String(url).endsWith("reserve_ai_budget") ? 80 : String(url).endsWith("settle_ai_budget") ? 160 : 120);
  return immediateFetch(url, init);
};
const { withAiBudgetSettlements } = loadSource(resolve(root, "infrastructure/server/ai-budget"));
const timings = { inline: [], deferred: [] };
for (let iteration = 0; iteration < 5; iteration += 1) {
  for (const mode of iteration % 2 === 0 ? ["inline", "deferred"] : ["deferred", "inline"]) {
    const pending = [];
    const started = performance.now();
    const run = () => speech.transcribeSpeechWithOpenAi({ audio: new File([new Uint8Array(102400)], "speech.webm"), languageHint: "ja" });
    if (mode === "inline") await run();
    else await withAiBudgetSettlements((task) => { pending.push(task); }, run);
    timings[mode].push(performance.now() - started);
    for (const task of pending) await task();
  }
}
globalThis.fetch = immediateFetch;
const median = (values) => [...values].sort((first, second) => first - second)[2];
assert.ok(median(timings.inline) - median(timings.deferred) > 100);
console.log(JSON.stringify({ simulatedLatencyMs: { inlineMedian: Math.round(median(timings.inline)), deferredMedian: Math.round(median(timings.deferred)) }, injectedDelaysMs: { reserve: 80, provider: 120, settle: 160 }, samplesPerMode: 5, realApiCalls: 0 }));
console.log("PASS budget-only release: 6 paid paths, billed STT usage, deferred settlement/route wiring, production prompt preserved in 4 directions, failures closed; latency is a mock experiment, not a production measurement; real API calls 0");
