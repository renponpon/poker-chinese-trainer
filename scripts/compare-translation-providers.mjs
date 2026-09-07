import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const root = resolve(projectRoot, "src");
const nativeRequire = createRequire(resolve(projectRoot, "package.json"));
const modules = new Map();
const outputDirectory = resolve(projectRoot, "tmp/phrabit-responsive-shots", `provider-comparison-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const rates = {
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2 },
  "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
};
const maximumLlmUsd = 0.8;
const maximumOutputTokens = 8192;
let reservedLlmUsd = 0;
let activeCalls = null;
const overrides = new Map();
const results = [];
const availability = [];
const samples = [
  ["fragment", "全てのチップ", "名詞句を保つ。曖昧な語義だけで失格にしない。動作や支払いは追加しない。"],
  ["return", "彼に渡すのではなく、私に返してください。", "返す相手・否定範囲・返還の意味。还の読みはhuán。"],
  ["experience", "前にもここで買ったことがあります。", "過去の経験。過去の一度だけに限定しない。"],
  ["frequency", "毎週ではなく、隔週でお願いします。", "週2回ではなく2週間に1回。"],
  ["quantity", "全部で二つです。二人に一つずつではありません。", "合計2個と配分の否定をともに保つ。"],
  ["deadline", "すぐ対応できますが、今日中に完了できるという意味ではありません。", "着手可能と完了保証を区別する。"],
  ["housing", "鍵を部屋の中に置いたまま、ドアを閉めてしまいました。", "鍵の場所と不本意な動作。施錠は明示されていない。"],
  ["request", "窓側の席が空いたら、移ってもいいですか？", "空席になったら、という条件と許可を保つ。"],
  ["plans", "誘ってくれてありがとう。でも今回は遠慮しておきます。", "誘いへの感謝と今回の辞退。永久拒否ではない。"],
  ["work", "この件はまだ決定ではないので、社外には伝えないでください。", "未決定と社外への伝達禁止。"],
].flatMap(([id, text, criterion]) => ["zh", "en"].map((language) => ({ id: `${id}-${language}`, text, criterion, direction: `ja-to-${language}`, language })));

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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(60000) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return data;
}

function deeplEndpoint() {
  return (process.env.DEEPL_API_ENDPOINT || (process.env.DEEPL_API_PLAN === "pro" ? "https://api.deepl.com" : process.env.DEEPL_API_PLAN === "free" || process.env.DEEPL_API_KEY?.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com")).replace(/\/+$/, "");
}

async function generateGeminiText(input) {
  const rate = rates[input.model];
  const reserve = ((Buffer.byteLength(input.contents, "utf8") + 512) * rate.input + maximumOutputTokens * rate.output) / 1e6;
  if (reservedLlmUsd + reserve > maximumLlmUsd) throw new Error("TEST_BUDGET_STOP");
  reservedLlmUsd += reserve;
  const started = performance.now();
  if (input.model.startsWith("gpt-")) {
    const data = await fetchJson("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: input.model, input: input.contents, reasoning: { effort: "none" }, text: { format: { type: "json_object" } }, max_output_tokens: maximumOutputTokens, store: false }),
    });
    const usage = data.usage;
    const cachedTokens = usage?.input_tokens_details?.cached_tokens ?? 0;
    const actualUsd = usage ? (((usage.input_tokens ?? 0) - cachedTokens) * rate.input + cachedTokens * rate.cachedInput + (usage.output_tokens ?? 0) * rate.output) / 1e6 : null;
    if (actualUsd !== null) reservedLlmUsd += actualUsd - reserve;
    const rawText = data.output?.flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text).join("") ?? "";
    activeCalls.push({ ms: Math.round(performance.now() - started), usage, actualUsd, modelVersion: data.model, finishReason: data.status, rawText });
    if (data.status !== "completed") throw new Error("FINISH_INCOMPLETE");
    return rawText;
  }
  const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: input.contents }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: maximumOutputTokens, ...(input.model === "gemini-3.8-flash" ? { thinkingConfig: { thinkingLevel: "LOW" } } : {}) },
    }),
  });
  const usage = data.usageMetadata;
  const actualUsd = usage ? ((usage.promptTokenCount ?? 0) * rate.input + ((usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0)) * rate.output) / 1e6 : null;
  if (actualUsd !== null) reservedLlmUsd += actualUsd - reserve;
  const candidate = data.candidates?.[0];
  const rawText = candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? "").join("") ?? "";
  activeCalls.push({ ms: Math.round(performance.now() - started), usage, actualUsd, modelVersion: data.modelVersion, finishReason: candidate?.finishReason, rawText });
  if (candidate?.finishReason !== "STOP") throw new Error(`FINISH_${candidate?.finishReason ?? "EMPTY"}`);
  return rawText;
}

overrides.set(resolve(root, "infrastructure/server/gemini-client"), { generateGeminiText });
const { buildQualityPrompt } = loadSource(resolve(root, "infrastructure/server/quality-phrase-prompt"));
const { generateQualityPhraseWithGemini } = loadSource(resolve(root, "infrastructure/server/quality-phrase-generator"));
const { toMandarinPinyin } = loadSource(resolve(root, "lib/chinese-pinyin"));

async function translate(provider, sample) {
  if (["speed", "normal", "quality"].includes(provider)) {
    const data = await fetchJson("https://phrabit.com/api/phrase/add", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phraseId: crypto.randomUUID(), text: sample.text, direction: sample.direction, generationMode: provider, persist: false, shouldDrill: false }),
    });
    if (!data.targetText?.trim()) throw new Error("EMPTY_TRANSLATION");
    return data;
  }
  if (provider.startsWith("gemini-") || provider.startsWith("gpt-")) {
    return generateQualityPhraseWithGemini({ model: provider, inputText: sample.text, direction: sample.direction, prompt: buildQualityPrompt(sample.direction), createMissingApiKeyError: () => new Error("MISSING_KEY"), createEmptyResponseError: () => new Error("EMPTY_RESPONSE") });
  }
  let targetText;
  let metadata;
  if (provider === "azure") {
    const endpoint = (process.env.AZURE_TRANSLATOR_ENDPOINT || "https://api.cognitive.microsofttranslator.com").replace(/\/+$/, "");
    const params = new URLSearchParams({ "api-version": "3.0", from: "ja", to: sample.language === "zh" ? "zh-Hans" : "en" });
    const data = await fetchJson(`${endpoint}/translate?${params}`, { method: "POST", headers: { "Content-Type": "application/json", "Ocp-Apim-Subscription-Key": process.env.AZURE_TRANSLATOR_KEY, ...(process.env.AZURE_TRANSLATOR_REGION ? { "Ocp-Apim-Subscription-Region": process.env.AZURE_TRANSLATOR_REGION } : {}) }, body: JSON.stringify([{ text: sample.text }]) });
    targetText = data?.[0]?.translations?.[0]?.text;
    metadata = { inputCharacters: Array.from(sample.text).length };
  } else {
    const modelType = provider === "deepl-default" ? undefined : provider.slice("deepl-".length);
    const data = await fetchJson(`${deeplEndpoint()}/v2/translate`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}` }, body: JSON.stringify({ text: [sample.text], source_lang: "JA", target_lang: sample.language === "zh" ? "ZH" : "EN-US", ...(modelType ? { model_type: modelType } : {}), show_billed_characters: true }) });
    targetText = data?.translations?.[0]?.text;
    metadata = { inputCharacters: Array.from(sample.text).length, modelTypeUsed: data?.translations?.[0]?.model_type_used, billedCharacters: data?.translations?.[0]?.billed_characters };
  }
  if (!targetText?.trim()) throw new Error("EMPTY_TRANSLATION");
  return { targetText, reading: sample.language === "zh" ? toMandarinPinyin(targetText) : "", metadata };
}

function summarize() {
  return [...new Set(results.map((result) => result.provider))].map((provider) => {
    const rows = results.filter((result) => result.provider === provider);
    const successful = rows.filter((result) => result.ok);
    const times = successful.map((result) => result.ms).sort((left, right) => left - right);
    const middle = Math.floor(times.length / 2);
    return { provider, success: successful.length, failures: rows.length - successful.length, medianMs: times.length ? times.length % 2 ? times[middle] : (times[middle - 1] + times[middle]) / 2 : null, p90Ms: times[Math.ceil(times.length * 0.9) - 1] ?? null, minMs: times[0] ?? null, maxMs: times.at(-1) ?? null, llmUsd: rows.some((row) => row.calls.length) ? rows.reduce((total, row) => total + row.calls.reduce((subtotal, call) => subtotal + (call.actualUsd ?? 0), 0), 0) : null, sourceCharacters: rows.reduce((total, row) => total + Array.from(row.sample.text).length, 0) };
  });
}

function save() {
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, "results.json"), JSON.stringify({ timestamp: new Date().toISOString(), constraints: { liveMode: process.argv.includes("--live"), maximumLlmUsdDirectOnly: maximumLlmUsd, maximumOutputTokensDirectOnly: maximumOutputTokens, maximumLiveRequests: samples.length * 3, prices: rates, location: process.env.VERCEL_ENV === "preview" ? "Vercel Preview build egress; direct provider calls; no app or database calls" : "local PC egress; no phrase saves; production usage events may include live tests", note: "translation-only MT vs translation+explanation LLM; one request at a time; rotated order; OpenAI cached input discount included; live endpoint does not expose actual token usage or test cost ceiling" }, samples, availability, summary: summarize(), reservedLlmUsd, results }, null, 2));
  writeFileSync(resolve(outputDirectory, "results.txt"), results.map((result) => `## ${result.sample.id} | ${result.provider} | ${result.ms}ms\n入力: ${result.sample.text}\n判定基準: ${result.sample.criterion}\n${result.ok ? `${result.output.targetText}\n${result.output.reading ?? ""}\n${result.output.explanation ?? ""}` : result.error}\n`).join("\n"));
}

if (process.argv.includes("--preview-report") && (process.env.VERCEL_ENV !== "preview" || process.argv.includes("--live"))) {
  throw new Error("Preview-only reports require VERCEL_ENV=preview and direct provider calls");
}
const providers = [];
if (process.argv.includes("--live")) {
  providers.push("speed", "normal", "quality");
} else {
for (const [provider, key] of [["azure", "AZURE_TRANSLATOR_KEY"], ["deepl-default", "DEEPL_API_KEY"]]) {
  if (process.argv.includes("--llm-only")) continue;
  const present = Boolean(process.env[key]);
  availability.push({ provider, keyPresent: present });
  if (present) providers.push(provider);
}
const requestedModels = process.env.PROVIDER_MODELS?.split(",").map((model) => model.trim()).filter(Boolean);
for (const model of requestedModels?.length ? requestedModels : Object.keys(rates)) {
  if (!rates[model]) { availability.push({ provider: model, available: false, error: "UNKNOWN_MODEL" }); continue; }
  const openai = model.startsWith("gpt-");
  const key = openai ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
  if (!key) { availability.push({ provider: model, available: false, error: "MISSING_KEY" }); continue; }
  try {
    const data = await fetchJson(openai ? `https://api.openai.com/v1/models/${model}` : `https://generativelanguage.googleapis.com/v1beta/models/${model}`, { headers: openai ? { Authorization: `Bearer ${key}` } : { "x-goog-api-key": key } });
    const available = openai ? data.id === model : data.supportedGenerationMethods?.includes("generateContent") ?? false;
    availability.push({ provider: model, available, modelName: data.name ?? data.id });
    if (available) providers.push(model);
  } catch (error) { availability.push({ provider: model, available: false, error: /^HTTP_\d+$/.test(error.message) ? error.message : "PREFLIGHT_FAILED" }); }
}
}
console.log(JSON.stringify({ availability, outputDirectory }));
save();
if (!process.argv.includes("--run")) process.exit(0);
const disabled = new Set();
for (const [index, sample] of samples.entries()) {
  const order = [...providers.slice(index % providers.length), ...providers.slice(0, index % providers.length)];
  for (const provider of order) {
    if (disabled.has(provider)) continue;
    activeCalls = [];
    const started = performance.now();
    const result = { provider, sample, calls: activeCalls };
    try {
      result.output = await translate(provider, sample);
      result.ok = true;
    } catch (error) {
      result.ok = false;
      result.error = /^(HTTP_\d+|TEST_BUDGET_STOP|FINISH_[A-Z_]+|EMPTY_RESPONSE|EMPTY_TRANSLATION)$/.test(error.message) ? error.message : "GENERATION_OR_PARSE_FAILED";
      if (result.error === "HTTP_429") providers.forEach((name) => disabled.add(name));
      if (/HTTP_(401|403|404)|TEST_BUDGET_STOP/.test(result.error)) disabled.add(provider);
    }
    result.ms = Math.round(performance.now() - started);
    results.push(result);
    save();
    console.log(`${sample.id} ${provider} ${result.ok ? "OK" : result.error} ${result.ms}ms`);
  }
}
console.log(JSON.stringify({ summary: summarize(), reservedLlmUsd, outputDirectory }, null, 2));
if (process.argv.includes("--preview-report")) {
  const reportDirectory = resolve(projectRoot, "public/provider-comparison");
  mkdirSync(reportDirectory, { recursive: true });
  for (const filename of ["results.json", "results.txt"]) {
    writeFileSync(resolve(reportDirectory, filename), readFileSync(resolve(outputDirectory, filename)));
  }
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  writeFileSync(resolve(reportDirectory, "index.html"), `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Phrabit 翻訳モデル比較</title><style>body{font:16px/1.65 system-ui;max-width:960px;margin:24px auto;padding:0 16px;background:#f8fafc;color:#172033}pre{white-space:pre-wrap;overflow-wrap:anywhere}details{background:white;border:1px solid #dce2eb;border-radius:12px;margin:12px 0;padding:14px}summary{cursor:pointer;font-weight:600}</style><h1>Phrabit 翻訳モデル比較</h1><p>検証専用・本番未変更。主訳/解説/ピンインの品質は個別に確認してください。翻訳は学習データに保存していません。</p><pre>${escapeHtml(JSON.stringify(summarize(), null, 2))}</pre><h2>モデル利用可否</h2><pre>${escapeHtml(JSON.stringify(availability, null, 2))}</pre>${samples.map((sample) => `<h2>${escapeHtml(sample.id)}: ${escapeHtml(sample.text)}</h2>${results.filter((result) => result.sample.id === sample.id).map((result) => `<details><summary>${escapeHtml(result.provider)} — ${result.ms}ms — ${escapeHtml(result.output?.targetText ?? result.error)}</summary><pre>${escapeHtml(result.output?.reading ?? "")}\n${escapeHtml(result.output?.explanation ?? "")}</pre></details>`).join("")}`).join("")}</html>`);
}
