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
const tasks = [];
const usage = [];
const budgetCalls = [];
const sdkCalls = [];
const logged = [];
const actor = { type: "user", userId: "test-user", ipHash: null, dailyLimit: 200 };
let guardError = null;
let budgetStatus = "reserved";
let providerError = null;
let providerText;
let identities = 0;
let dailyChecks = 0;
let burstChecks = 0;
process.env.NODE_ENV = "development";
process.env.PHRABIT_EXPERIENCE_ENABLED = "1";
delete process.env.PHRABIT_EXPERIENCE_MOCK;
process.env.GEMINI_API_KEY = "test-not-a-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://budget-test.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-not-a-secret";
const originalError = console.error;
console.error = (...args) => logged.push(args);

function loadSource(path) {
  const filename = path.endsWith(".ts") ? path : path + ".ts";
  if (modules.has(filename)) return modules.get(filename).exports;
  const compiledModule = { exports: {} };
  modules.set(filename, compiledModule);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const require = (name) => {
    const target = name.startsWith("@/") ? resolve(root, name.slice(2)) : name.startsWith(".") ? resolve(dirname(filename), name) : null;
    if (overrides.has(target ?? name)) return overrides.get(target ?? name);
    return target ? loadSource(target) : nativeRequire(name);
  };
  runInThisContext("(function(require,module,exports){" + code + "\n})", { filename })(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

globalThis.fetch = async (url, init) => {
  assert.ok(String(url).startsWith("https://budget-test.invalid/rest/v1/rpc/"), "No external network is allowed");
  const name = String(url).split("/").at(-1);
  budgetCalls.push({ name, ...JSON.parse(init.body) });
  return Response.json(name === "reserve_ai_budget" ? budgetStatus : "settled");
};
overrides.set("next/server", { NextResponse: { json: Response.json }, after: (task) => tasks.push(task) });
const limits = loadSource(resolve(root, "infrastructure/server/usage-limits"));
overrides.set(resolve(root, "infrastructure/server/usage-limits"), {
  ...limits,
  identifyRequestActor: async (_request, token) => { identities += 1; assert.equal(token, "test-auth"); return actor; },
  assertWithinAiBurstLimit: () => { burstChecks += 1; },
  assertWithinDailyAiLimit: async () => { dailyChecks += 1; if (guardError) throw guardError; },
});
overrides.set(resolve(root, "infrastructure/server/usage-event-recorder"), { recordAiUsageEvent: async (event) => usage.push(event) });
overrides.set("@google/genai", { GoogleGenAI: class {
  constructor(options) {
    assert.equal(options.httpOptions.retryOptions.attempts, 1);
    assert.equal(options.httpOptions.timeout, 35000);
    this.models = { generateContent: async (input) => {
      assert.equal(budgetCalls.at(-1).name, "reserve_ai_budget");
      assert.equal(budgetStatus, "reserved");
      assert.equal(input.model, "gemini-3.5-flash-lite");
      assert.equal(input.config.maxOutputTokens, 2048);
      assert.equal(input.config.responseMimeType, "application/json");
      assert.ok(input.config.abortSignal);
      assert.ok(!("tools" in input.config));
      sdkCalls.push(input);
      if (providerError) throw providerError;
      return { text: providerText, usageMetadata: { totalTokenCount: 321 } };
    } };
  }
} });
const { POST } = loadSource(resolve(root, "app/api/phrase/from-experience/route"));
const payload = { experienceText: "返金がまだ届かず、相手を責めずに状況を確認したい。個人の出来事全文。", targetLanguage: "en" };
async function call(body = payload, expected = 200) {
  const response = await POST(new Request("http://localhost/api/phrase/from-experience", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer test-auth" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  assert.equal(response.status, expected);
  while (tasks.length) await tasks.shift()();
  return response.json();
}
try {
  delete process.env.PHRABIT_EXPERIENCE_ENABLED;
  await call(payload, 503);
  assert.equal(identities, 0);
  process.env.PHRABIT_EXPERIENCE_MOCK = "1";
  await call({ experienceText: "服を買ったけどサイズが合わなくて、別のサイズに交換したかった。", targetLanguage: "en" });
  assert.equal(identities, 0);
  assert.equal(budgetCalls.length, 0);
  delete process.env.PHRABIT_EXPERIENCE_MOCK;
  process.env.PHRABIT_EXPERIENCE_ENABLED = "1";
  await call("{", 400);
  await call({ ...payload, persist: true }, 400);
  assert.equal(identities, 0);
  for (const error of [new limits.UsageLimitError(), new limits.UsageTrackingError()]) {
    guardError = error;
    await call(payload, error.status);
    assert.equal(sdkCalls.length, 0);
    assert.equal(budgetCalls.length, 0);
  }
  guardError = null;
  for (const [status, httpStatus] of [["exceeded", 429], ["unconfigured", 503]]) {
    budgetStatus = status;
    await call(payload, httpStatus);
    assert.equal(sdkCalls.length, 0);
  }
  budgetStatus = "reserved";
  for (const language of ["en", "zh"]) {
    const candidate = { status: "ready", sourceText: "返金の状況を確認していただけますか？", targetText: language === "zh" ? "请帮我确认一下退款的进度。" : "Could you check the status of my refund?" };
    providerText = JSON.stringify(candidate);
    const before = sdkCalls.length;
    const result = await call({ ...payload, targetLanguage: language });
    assert.equal(sdkCalls.length, before + 1);
    assert.equal(result.mock, false);
    assert.equal(result.phrase.sourceText, candidate.sourceText);
    assert.equal(result.phrase.targetText, candidate.targetText);
    assert.equal(result.phrase.explanation, "");
    assert.ok(language === "zh" ? result.phrase.reading.length > 0 : result.phrase.reading === "");
    assert.equal(usage.at(-1).success, true);
    assert.equal(usage.at(-1).userId, actor.userId);
    const refined = await call({ ...payload, targetLanguage: language, previousPhrase: { sourceText: candidate.sourceText, targetText: candidate.targetText }, nuance: "少し丁寧に" });
    assert.equal(refined.status, "ready");
    assert.equal(sdkCalls.length, before + 2);
    assert.match(sdkCalls.at(-1).contents, /少し丁寧に/);
  }
  providerText = '{"status":"insufficient_context","sourceText":"","targetText":""}';
  assert.deepEqual(await call(), { status: "insufficient_context", mock: false });
  assert.equal(usage.at(-1).outputChars, 0);
  providerText = "invalid JSON";
  const beforeInvalid = sdkCalls.length;
  await call(payload, 502);
  assert.equal(sdkCalls.length, beforeInvalid + 1);
  assert.equal(usage.at(-1).errorCode, "invalid_experience_response");
  providerError = new Error(payload.experienceText);
  const beforeFailure = sdkCalls.length;
  const settledBefore = budgetCalls.filter((event) => event.name === "settle_ai_budget").length;
  const result = await call(payload, 502);
  assert.equal(sdkCalls.length, beforeFailure + 1);
  assert.equal(budgetCalls.filter((event) => event.name === "settle_ai_budget").length, settledBefore);
  assert.doesNotMatch(result.error, /個人の出来事全文/);
  assert.doesNotMatch(JSON.stringify(logged), /個人の出来事全文/);
  assert.doesNotMatch(JSON.stringify(usage), /個人の出来事全文|返金の状況/);
  assert.equal(usage.at(-1).success, false);
  delete process.env.GEMINI_API_KEY;
  await call(payload, 503);
  assert.equal(sdkCalls.length, beforeFailure + 1);
  assert.equal(burstChecks, dailyChecks);
  assert.ok(budgetCalls.filter((event) => event.name === "reserve_ai_budget").every((event) => event.operation_name === "gemini:gemini-3.5-flash-lite" && event.requested_units > 0));
} finally {
  console.error = originalError;
}
console.log("Experience route → one Gemini request → budget/usage/contract checks passed; all SDK and DB traffic mocked, no paid calls.");
