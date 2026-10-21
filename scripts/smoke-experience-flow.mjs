import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { loadSource } from "./load-typescript-source.mjs";

const origin = process.env.PHRABIT_TEST_ORIGIN || "http://127.0.0.1:3012";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const directory = resolve("tmp/phrabit-responsive-shots/experience-mock-20261021");
mkdirSync(directory, { recursive: true });
const { EXPERIENCE_MOCK_EXAMPLES, validateExperiencePhraseRequest } = loadSource(resolve("src/lib/experience-phrase"));
const { createExperienceMockResponse } = loadSource(resolve("src/infrastructure/server/experience-phrase-mock"));
const executablePath = [chromium.executablePath(), "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
const results = [];
try {
  const endpoint = origin + "/api/phrase/from-experience";
  const basic = { experienceText: EXPERIENCE_MOCK_EXAMPLES[0].text, targetLanguage: "en" };
  for (const [payload, expected] of [[basic, 200], [{ ...basic, persist: true }, 400], [{ ...basic, experienceText: "字".repeat(501) }, 400], [{ ...basic, targetLanguage: "ja" }, 400], [{ ...basic, experienceText: "未登録の模擬入力" }, 422]]) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(response.status, expected);
  }
  const malformed = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal(malformed.status, 400);
  results.push({ apiContract: "passed", paidCalls: 0 });
  for (const [language, width] of [["zh", 360], ["en", 430], ["en", 1280]]) await checkFlow(language, width);
  writeFileSync(resolve(directory, "results.json"), JSON.stringify({ status: "passed", results, paidCalls: 0, externalServices: "blocked", note: "Fixed fixtures verify UI and contracts, not live translation or physical microphone quality." }, null, 2));
} finally {
  await browser.close();
}

async function checkFlow(language, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "ja-JP", serviceWorkers: "block" });
  await context.addInitScript((language) => {
    localStorage.setItem("phrabit-learning-language-v1", language);
    localStorage.setItem("phrabit:add-tutorial-seen", "1");
    window.testSpeechCalls = [];
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, "speechSynthesis", { value: { getVoices: () => ["zh-CN", "en-US"].map((lang) => ({ lang, name: lang, localService: true })), cancel: () => {}, resume: () => {}, addEventListener: () => {}, speak: (utterance) => { window.testSpeechCalls.push(utterance.text); queueMicrotask(() => utterance.onend?.()); } } });
    window.SpeechRecognition = class {
      start() { window.testRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
    };
  }, language);
  const page = await context.newPage();
  const errors = [];
  const generationRequests = [];
  const otherApiRequests = [];
  let fault = null;
  let releaseLate;
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const payload = route.request().postDataJSON();
    if (url.pathname === "/api/phrase/from-experience") {
      generationRequests.push(payload);
      if (fault === "late") {
        const response = createExperienceMockResponse(validateExperiencePhraseRequest(payload));
        await new Promise((resolveGate) => { releaseLate = resolveGate; });
        try { await route.fulfill({ json: response }); } catch {}
        return;
      }
      if (fault === "invalid") return route.fulfill({ json: { status: "ready", phrase: { targetText: "invalid" }, mock: true } });
      return route.continue();
    }
    otherApiRequests.push({ path: url.pathname, payload });
    return route.fulfill({ json: { ok: true, tracked: true } });
  });
  const input = () => page.getByRole("textbox", { name: "何がありましたか？", exact: true });
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("poker-chinese-local-phrases-v1") ?? "[]"));
  const generate = async () => {
    const response = page.waitForResponse((response) => response.url().endsWith("/api/phrase/from-experience"));
    await page.getByRole("button", { name: "一言を作る", exact: true }).click();
    return (await response).json();
  };
  try {
    await page.goto(origin + "/add/experience");
    await page.getByText("画面確認用のサンプル応答", { exact: true }).waitFor();
    assert.equal(await page.getByRole("combobox", { name: "翻訳先言語" }).inputValue(), language);
    assert.equal(await page.getByRole("button", { name: "翻訳方向を切り替え" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: /翻訳モード:/ }).count(), 0);
    await page.getByRole("button", { name: "音声入力", exact: true }).click();
    await page.evaluate((text) => {
      const recognition = window.testRecognition;
      const result = [{ transcript: text }];
      result.isFinal = true;
      recognition.onresult({ results: [result] });
      recognition.onend();
    }, EXPERIENCE_MOCK_EXAMPLES[0].text);
    assert.equal(await input().inputValue(), EXPERIENCE_MOCK_EXAMPLES[0].text);
    assert.equal(generationRequests.length, 0);
    const generated = await generate();
    assert.equal(generated.status, "ready");
    assert.equal(generated.phrase.targetLanguage, language);
    await page.getByText(generated.phrase.targetText, { exact: true }).waitFor();
    assert.equal(await page.getByText(generated.phrase.sourceText, { exact: true }).isVisible(), true);
    assert.equal((await saved()).length, 0);
    assert.deepEqual(await page.evaluate(() => window.testSpeechCalls), []);
    assert.equal(otherApiRequests.filter((request) => request.path === "/api/phrase/explain").length, 0);
    if (language === "zh") {
      assert.ok(generated.phrase.reading.length > 0);
      assert.equal(await page.getByText(generated.phrase.reading, { exact: true }).isVisible(), true);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole("button", { name: "ドリルに追加", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(directory, `${language}-${width}-candidate.png`) });

    await page.getByRole("link", { name: "そのまま翻訳", exact: true }).click();
    await page.getByPlaceholder("日本語を入力", { exact: true }).fill("通常翻訳の入力は別に保持");
    await page.getByRole("link", { name: "出来事から", exact: true }).click();
    assert.equal(await input().inputValue(), EXPERIENCE_MOCK_EXAMPLES[0].text);
    await page.getByText(generated.phrase.targetText, { exact: true }).waitFor();
    await page.getByRole("link", { name: "そのまま翻訳", exact: true }).click();
    assert.equal(await page.getByPlaceholder("日本語を入力", { exact: true }).inputValue(), "通常翻訳の入力は別に保持");
    await page.getByRole("link", { name: "出来事から", exact: true }).click();

    await page.getByRole("button", { name: "調整", exact: true }).click();
    await page.getByRole("textbox", { name: "ニュアンスを調整", exact: true }).fill("小さいサイズに");
    const refineResponse = page.waitForResponse((response) => response.url().endsWith("/api/phrase/from-experience"));
    await page.getByRole("button", { name: "このニュアンスで作り直す", exact: true }).click();
    const refined = await (await refineResponse).json();
    await page.getByText(refined.phrase.sourceText, { exact: true }).waitFor();
    await page.getByText(refined.phrase.targetText, { exact: true }).waitFor();
    assert.equal(await input().inputValue(), EXPERIENCE_MOCK_EXAMPLES[0].text);
    assert.equal(generationRequests.at(-1).previousPhrase.sourceText, generated.phrase.sourceText);
    assert.deepEqual(await page.evaluate(() => window.testSpeechCalls), []);

    await page.getByRole("button", { name: "調整", exact: true }).click();
    await page.getByRole("textbox", { name: "ニュアンスを調整", exact: true }).fill("この補足は模擬未対応");
    const rejectedResponse = page.waitForResponse((response) => response.url().endsWith("/api/phrase/from-experience"));
    await page.getByRole("button", { name: "このニュアンスで作り直す", exact: true }).click();
    assert.equal((await rejectedResponse).status(), 422);
    await page.getByText(/模擬応答は画面内/).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "ニュアンスを調整", exact: true }).inputValue(), "この補足は模擬未対応");
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    await page.getByText(refined.phrase.targetText, { exact: true }).waitFor();

    fault = "invalid";
    await generate();
    await page.getByText(refined.phrase.targetText, { exact: true }).waitFor();
    await page.getByText("出来事の入力を確認してください。", { exact: true }).waitFor();
    fault = null;
    await page.getByRole("button", { name: "ドリルに追加", exact: true }).click();
    await page.getByRole("link", { name: "追加した一言を練習", exact: true }).waitFor();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("poker-chinese-local-phrases-v1") ?? "[]")[0]?.explanation?.includes("動作確認用"));
    const phrases = await saved();
    assert.equal(phrases.length, 1);
    assert.equal(phrases[0].sourceText, refined.phrase.sourceText);
    assert.equal(phrases[0].targetText, refined.phrase.targetText);
    assert.equal(phrases[0].shouldDrill, true);
    const persisted = await page.evaluate(() => Object.values(localStorage).join("\n"));
    assert.equal(persisted.includes(EXPERIENCE_MOCK_EXAMPLES[0].text), false);
    assert.equal(otherApiRequests.filter((request) => ["/api/phrase/explain", "/api/phrase/save-pack", "/api/phrases"].includes(request.path)).length, 0);
    await page.getByRole("button", { name: "再生", exact: true }).click();
    await page.waitForFunction(() => window.testSpeechCalls.length === 1);
    await page.getByRole("link", { name: "追加した一言を練習", exact: true }).click();
    await page.getByText(refined.phrase.sourceText, { exact: true }).waitFor();
    await page.screenshot({ path: resolve(directory, `${language}-${width}-drill.png`), fullPage: true });
    await page.getByRole("link", { name: "翻訳", exact: true }).click();
    await page.getByRole("link", { name: "出来事から", exact: true }).click();
    await page.getByText(refined.phrase.targetText, { exact: true }).waitFor();
    assert.equal((await saved()).length, 1);

    await input().fill("今日は店で困った");
    await generate();
    await page.getByText(/言いたかったことを一言足すと/).waitFor();
    await page.getByText(refined.phrase.targetText, { exact: true }).waitFor();
    await input().fill("字".repeat(501));
    assert.equal(await page.getByRole("button", { name: "一言を作る", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "サイズ交換", exact: true }).click();
    fault = "late";
    await page.getByRole("button", { name: "一言を作る", exact: true }).click();
    await page.getByRole("button", { name: "待機を中止", exact: true }).waitFor();
    while (!releaseLate) await new Promise((resolveTick) => setTimeout(resolveTick, 20));
    await page.getByRole("button", { name: "待機を中止", exact: true }).click();
    await page.getByText(/待機を中止しました/).waitFor();
    releaseLate();
    releaseLate = null;
    fault = null;
    await page.getByText(refined.phrase.targetText, { exact: true }).waitFor();
    assert.equal(await input().inputValue(), EXPERIENCE_MOCK_EXAMPLES[0].text);

    await page.getByRole("combobox", { name: "翻訳先言語" }).selectOption(language === "en" ? "zh" : "en");
    assert.equal(await page.getByText(refined.phrase.targetText, { exact: true }).count(), 0);
    assert.equal(await input().inputValue(), EXPERIENCE_MOCK_EXAMPLES[0].text);
    await page.evaluate(() => { localStorage.setItem("phrabit-account-cache-owner-v1", "mock-account-other"); window.dispatchEvent(new Event("phrabit-local-data-changed")); });
    await page.waitForFunction(() => document.querySelector("#translation-input")?.value === "");
    await page.evaluate(() => { localStorage.removeItem("phrabit-account-cache-owner-v1"); window.dispatchEvent(new Event("phrabit-local-data-changed")); });
    await page.waitForFunction((text) => document.querySelector("#translation-input")?.value === text, EXPERIENCE_MOCK_EXAMPLES[0].text);
    await page.reload();
    await input().waitFor();
    assert.equal(await input().inputValue(), "");
    assert.equal(await page.getByRole("heading", { name: "次に言う一言（日本語）" }).count(), 0);
    assert.equal((await saved()).length, 1);
    assert.deepEqual(errors, []);
    results.push({ language, width, inputAndApi: "passed", refinementAndRetention: "passed", explicitSaveAndDrill: "passed", cancellationAndIsolation: "passed", realVoiceTested: false });
    console.log(`PASS ${language}/${width}: API mock, voice event, refinement, save/drill, cancel, mode/language/account isolation`);
  } finally {
    releaseLate?.();
    await context.close();
  }
}
