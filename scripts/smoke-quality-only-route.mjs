import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const root = resolve("src");
const nativeRequire = createRequire(resolve("package.json"));
const calls = [];
const records = [];
const background = [];
let blocked = false;
class BudgetError extends Error {
  status = 503;
  code = "ai_budget_unavailable";
}
const mocks = new Map(Object.entries({
  "next/server": { NextResponse: { json: Response.json }, after: (task) => background.push(task) },
  "@/lib/server/with-ai-budget-settlements": { withDeferredBudgetSettlement: (handler) => handler },
  "@/infrastructure/server/ai-budget": { AiBudgetError: BudgetError },
  "@/infrastructure/server/usage-event-recorder": { recordAiUsageEvent: (record) => records.push(record) },
  "@/infrastructure/server/request-auth": { getBearerToken: () => null },
  "@/infrastructure/server/usage-limits": { identifyRequestActor: () => ({ type: "guest" }), assertWithinAiBurstLimit() {}, AiBurstLimitError: class extends Error {}, UsageLimitError: class extends Error {}, UsageTrackingError: class extends Error {} },
  "@/infrastructure/server/quality-phrase-generator": {
    QualityPhraseResponseError: class extends Error {},
    generateQualityPhraseWithGemini(input) {
      calls.push(input);
      if (blocked) throw new BudgetError("生成を停止しています");
      return { japanese: "日本語", chinese: "中文", pinyin: "", explanation: "解説" };
    },
  },
  "@/application/phrase/persist-saved-phrases": {},
  "@/infrastructure/server/phrase-cloud-storage": {},
}));
const modules = new Map();
function load(filename) {
  if (modules.has(filename)) return modules.get(filename);
  const compiled = { exports: {} };
  modules.set(filename, compiled.exports);
  const code = ts.transpileModule(readFileSync(filename + ".ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = (name) => {
    if (mocks.has(name)) return mocks.get(name);
    if (name.startsWith("@/")) return load(resolve(root, name.slice(2)));
    if (name.startsWith(".")) return load(resolve(dirname(filename), name));
    return nativeRequire(name);
  };
  new Function("require", "module", "exports", code)(require, compiled, compiled.exports);
  return compiled.exports;
}
globalThis.fetch = () => { throw new Error("External requests are disabled"); };
const { POST } = load(resolve(root, "app/api/phrase/add/route"));
async function request(body) {
  const response = await POST(new Request("http://localhost/api/phrase/add", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  for (const task of background.splice(0)) await task();
  return response;
}
assert.equal((await request({ warmup: true, targetLanguage: "en" })).status, 200);
assert.equal(calls.length, 0);
for (const direction of ["ja-to-zh", "zh-to-ja", "ja-to-en", "en-to-ja"]) {
  for (const generationMode of [undefined, "normal", "speed", "fast", "quality", "full"]) {
    const before = calls.length;
    const response = await request({ direction, generationMode, categoryId: "hotel", source: direction.endsWith("ja") ? "conversation" : "manual", text: "テスト", persist: false });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(calls.length, before + 1);
    assert.equal(result.provider, "gemini");
    assert.equal(result.model, "gemini-3.5-flash-lite");
    assert.equal(calls.at(-1).model, result.model);
    assert.equal(calls.at(-1).direction, direction);
    assert.equal(records.at(-1).mode, "quality");
    assert.equal(records.at(-1).provider, "gemini");
  }
}
blocked = true;
const before = calls.length;
assert.equal((await request({ text: "テスト", generationMode: "normal", persist: false })).status, 503);
assert.equal(calls.length, before + 1);
assert.equal(records.at(-1).success, false);
console.log("PASS: four directions × six mode values, no warm-up calls, no fallback on budget failure");
