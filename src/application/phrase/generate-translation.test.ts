import assert from "node:assert/strict";
import test from "node:test";
import { generateTranslation, type TranslationProvider } from "./generate-translation";
import type { GeneratedPhrase } from "../../lib/types";

test("speed mode uses Azure", async () => {
  const calls: TranslationProvider[] = [];

  const result = await generateTranslation({
    mode: "speed",
    request: { direction: "ja-to-zh", inputText: "hello" },
    providers: {
      azure: async () => {
        calls.push("azure");
        return makeGeneratedPhrase("azure");
      },
      deepl: async () => {
        calls.push("deepl");
        return makeGeneratedPhrase("deepl");
      },
      gemini: async () => {
        calls.push("gemini");
        return makeGeneratedPhrase("gemini");
      },
    },
  });

  assert.equal(result.provider, "azure");
  assert.equal(result.generated.explanation, "azure");
  assert.deepEqual(calls, ["azure"]);
});

test("quality mode uses Gemini", async () => {
  const calls: TranslationProvider[] = [];

  const result = await generateTranslation({
    mode: "quality",
    request: { direction: "ja-to-zh", inputText: "hello" },
    providers: {
      azure: async () => {
        calls.push("azure");
        return makeGeneratedPhrase("azure");
      },
      deepl: async () => {
        calls.push("deepl");
        return makeGeneratedPhrase("deepl");
      },
      gemini: async () => {
        calls.push("gemini");
        return makeGeneratedPhrase("gemini");
      },
    },
  });

  assert.equal(result.provider, "gemini");
  assert.equal(result.generated.explanation, "gemini");
  assert.deepEqual(calls, ["gemini"]);
});

test("normal mode uses DeepL when it is available", async () => {
  const calls: TranslationProvider[] = [];

  const result = await generateTranslation({
    mode: "normal",
    request: { direction: "ja-to-zh", inputText: "hello" },
    providers: {
      azure: async () => {
        calls.push("azure");
        return makeGeneratedPhrase("azure");
      },
      deepl: async () => {
        calls.push("deepl");
        return makeGeneratedPhrase("deepl");
      },
      gemini: async () => {
        calls.push("gemini");
        return makeGeneratedPhrase("gemini");
      },
    },
  });

  assert.equal(result.provider, "deepl");
  assert.equal(result.generated.explanation, "deepl");
  assert.deepEqual(calls, ["deepl"]);
});

test("normal mode falls back to Azure when DeepL is unavailable", async () => {
  const calls: TranslationProvider[] = [];

  const result = await generateTranslation({
    mode: "normal",
    request: { direction: "ja-to-zh", inputText: "hello" },
    providers: {
      azure: async () => {
        calls.push("azure");
        return makeGeneratedPhrase("azure");
      },
      gemini: async () => {
        calls.push("gemini");
        return makeGeneratedPhrase("gemini");
      },
    },
  });

  assert.equal(result.provider, "azure");
  assert.equal(result.generated.explanation, "azure");
  assert.deepEqual(calls, ["azure"]);
});

test("normal mode reports DeepL failure and falls back to Azure", async () => {
  const calls: TranslationProvider[] = [];
  const fallbackEvents: string[] = [];

  const result = await generateTranslation({
    mode: "normal",
    request: { direction: "ja-to-zh", inputText: "hello" },
    providers: {
      azure: async () => {
        calls.push("azure");
        return makeGeneratedPhrase("azure");
      },
      deepl: async () => {
        calls.push("deepl");
        throw new Error("deepl failed");
      },
      gemini: async () => {
        calls.push("gemini");
        return makeGeneratedPhrase("gemini");
      },
    },
    onProviderFallback: (event) => {
      fallbackEvents.push(`${event.from}->${event.to}`);
    },
  });

  assert.equal(result.provider, "azure");
  assert.equal(result.generated.explanation, "azure");
  assert.deepEqual(calls, ["deepl", "azure"]);
  assert.deepEqual(fallbackEvents, ["deepl->azure"]);
});

function makeGeneratedPhrase(explanation: string): GeneratedPhrase {
  return {
    direction: "ja-to-zh",
    japanese: "hello",
    chinese: "ni hao",
    pinyin: "ni hao",
    sourceLanguage: "ja",
    targetLanguage: "zh",
    sourceText: "hello",
    targetText: "ni hao",
    reading: "ni hao",
    readingType: "pinyin",
    explanation,
  };
}
