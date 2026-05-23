import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const samples = [
  { dir: "ja-zh", text: "もう一杯ください" },
  { dir: "ja-zh", text: "今からご飯を食べに行きます" },
  { dir: "ja-zh", text: "フォールドします" },
  { dir: "zh-ja", text: "我要去吃晚饭了" },
];

async function azure(text, from, to) {
  const endpoint = (
    env.AZURE_TRANSLATOR_ENDPOINT || "https://api.cognitive.microsofttranslator.com"
  ).replace(/\/+$/, "");
  const params = new URLSearchParams({ "api-version": "3.0", from, to });
  const started = performance.now();
  const res = await fetch(`${endpoint}/translate?${params}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": env.AZURE_TRANSLATOR_KEY,
      "Ocp-Apim-Subscription-Region": env.AZURE_TRANSLATOR_REGION,
    },
    body: JSON.stringify([{ text }]),
  });
  const data = await res.json();
  const ms = performance.now() - started;
  if (!res.ok) throw new Error(`Azure ${res.status}: ${JSON.stringify(data)}`);
  return { ms, out: data[0]?.translations?.[0]?.text ?? "" };
}

async function deepl(text, source, target) {
  const endpoint =
    env.DEEPL_API_PLAN === "pro" ? "https://api.deepl.com" : "https://api-free.deepl.com";
  const started = performance.now();
  const res = await fetch(`${endpoint}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${env.DEEPL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: [text], source_lang: source, target_lang: target }),
  });
  const data = await res.json();
  const ms = performance.now() - started;
  if (!res.ok) throw new Error(`DeepL ${res.status}: ${JSON.stringify(data)}`);
  return { ms, out: data.translations?.[0]?.text ?? "" };
}

async function gemini(text, direction) {
  const prompt =
    direction === "ja-zh"
      ? `日本語を自然な中国語（簡体字）に訳し、JSONのみ返す: {"chinese":"...","pinyin":"..."}`
      : `中国語を自然な日本語に訳し、JSONのみ返す: {"japanese":"..."}`;
  const started = performance.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${prompt}\n\n入力: ${text}` }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );
  const data = await res.json();
  const ms = performance.now() - started;
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { ms, out: data.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 80) ?? "" };
}

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const avg = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    min: Math.round(sorted[0]),
    p50: Math.round(sorted[Math.floor(sorted.length / 2)]),
    max: Math.round(sorted[sorted.length - 1]),
    avg: Math.round(avg),
  };
}

async function bench(name, fn, runs = 5) {
  const times = [];
  let sample = "";
  for (let i = 0; i < runs; i += 1) {
    const result = await fn();
    times.push(result.ms);
    sample = result.out;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { provider: name, ...stats(times), sample };
}

const summary = [];
for (const sample of samples) {
  const from = sample.dir === "ja-zh" ? "ja" : "zh-Hans";
  const to = sample.dir === "ja-zh" ? "zh-Hans" : "ja";
  const dlSource = sample.dir === "ja-zh" ? "JA" : "ZH";
  const dlTarget = sample.dir === "ja-zh" ? "ZH" : "JA";
  const phrase = sample.text.slice(0, 20);
  console.log(`\n=== ${phrase} (${sample.dir}) ===`);
  for (const [name, fn] of [
    ["Azure", () => azure(sample.text, from, to)],
    ["DeepL", () => deepl(sample.text, dlSource, dlTarget)],
    ["Gemini", () => gemini(sample.text, sample.dir)],
  ]) {
    try {
      const result = await bench(name, fn, 3);
      console.log(
        `${result.provider.padEnd(7)} avg ${String(result.avg).padStart(4)}ms  p50 ${String(result.p50).padStart(4)}ms  min ${String(result.min).padStart(4)}ms  max ${String(result.max).padStart(4)}ms  -> ${result.sample}`,
      );
      if (sample.text === "もう一杯ください" && sample.dir === "ja-zh") {
        summary.push(result);
      }
    } catch (error) {
      console.log(`${name.padEnd(7)} ERROR: ${error.message}`);
    }
  }
}

console.log("\n=== 5-run summary: もう一杯ください (ja-zh) ===");
for (const [name, fn] of [
  ["Azure", () => azure("もう一杯ください", "ja", "zh-Hans")],
  ["DeepL", () => deepl("もう一杯ください", "JA", "ZH")],
  ["Gemini", () => gemini("もう一杯ください", "ja-zh")],
]) {
  try {
    const result = await bench(name, fn, 5);
    console.log(
      `${result.provider.padEnd(7)} avg ${result.avg}ms  p50 ${result.p50}ms  min ${result.min}ms  max ${result.max}ms`,
    );
  } catch (error) {
    console.log(`${name.padEnd(7)} ERROR: ${error.message}`);
  }
}
