import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const origin = "http://localhost:3010";
const preferenceKey = "phrabit-learning-language-v1";
const phrasesKey = "poker-chinese-local-phrases-v1";
const screenshotDir = resolve("tmp/phrabit-responsive-shots/learning-language");
mkdirSync(screenshotDir, { recursive: true });
const executablePath = [
  chromium.executablePath(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((candidate) => existsSync(candidate));
const browser = await chromium.launch({ executablePath, headless: true });
const requests = [];
const errors = [];
const fixtures = ["en", "zh"].map((language) => ({
  id: `language-test-${language}`,
  createdAt: "2026-09-01T00:00:00.000Z",
  direction: `ja-to-${language}`,
  sourceLanguage: "ja",
  targetLanguage: language,
  sourceText: language === "en" ? "英語の練習用" : "中国語の練習用",
  targetText: language === "en" ? "English fixture" : "中文测试",
  japanese: language === "en" ? "英語の練習用" : "中国語の練習用",
  chinese: language === "en" ? "English fixture" : "中文测试",
  pinyin: "",
  reading: "",
  readingType: language === "en" ? "none" : "pinyin",
  explanation: "テスト用解説",
  shouldDrill: true,
  categoryId: "other",
}));

async function createContext(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const payload = route.request().postDataJSON();
    requests.push({ path: url.pathname, payload });
    if (url.pathname === "/api/phrase/add" && !payload?.warmup) {
      const [sourceLanguage, targetLanguage] = payload.direction.split("-to-");
      const targetText = `テスト結果 ${payload.direction}`;
      return route.fulfill({ json: {
        id: payload.phraseId,
        direction: payload.direction,
        sourceLanguage,
        targetLanguage,
        sourceText: payload.text,
        targetText,
        japanese: sourceLanguage === "ja" ? payload.text : targetText,
        chinese: sourceLanguage === "ja" ? targetText : payload.text,
        pinyin: "",
        reading: "",
        readingType: "none",
        explanation: "テスト応答",
        provider: "deepl",
      } });
    }
    return route.fulfill({ json: { ok: true, explanation: "テスト応答" } });
  });
  await context.addInitScript(({ phrases, key }) => {
    if (location.origin !== "http://localhost:3010") return;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(phrases));
      localStorage.setItem("poker-chinese-starter-phrases-v1", "1");
      localStorage.setItem("phrabit:add-tutorial-seen", "1");
    }
    window.testSpeechLanguage = null;
    window.SpeechRecognition = class {
      start() {
        window.testSpeechLanguage = this.lang;
        this.onstart?.();
        this.onend?.();
      }
      stop() { this.onend?.(); }
    };
  }, { phrases: fixtures, key: phrasesKey });
  return context;
}

async function expectValue(locator, value) {
  await locator.waitFor({ state: "visible" });
  await locator.page().waitForFunction(
    ({ label, expected }) => [...document.querySelectorAll("select")].some(
      (select) => (select.getAttribute("aria-label") === label || select.closest("label")?.textContent.includes(label))
        && select.value === expected && !select.disabled,
    ),
    { label: await locator.getAttribute("aria-label") || "学習言語（全画面共通）", expected: value },
  );
  assert.equal(await locator.inputValue(), value);
}

async function checkLibrary(page, language) {
  await page.goto(`${origin}/library`);
  const label = language === "en" ? "英語の練習用" : "中国語の練習用";
  const otherLabel = language === "en" ? "中国語の練習用" : "英語の練習用";
  await page.getByText(label, { exact: true }).waitFor();
  assert.equal(await page.getByText(otherLabel, { exact: true }).count(), 0);
  await page.getByRole("button", { name: /フィルター/ }).click();
  await expectValue(page.getByLabel("学習言語（全画面共通）"), language);
}

try {
  const context = await createContext();
  const page = await context.newPage();
  await page.goto(origin);
  await expectValue(page.getByLabel("翻訳先言語"), "zh");
  await page.getByRole("button", { name: "メニュー", exact: true }).click();
  await page.getByLabel("学習言語（全画面共通）").selectOption("en");
  await expectValue(page.getByLabel("翻訳先言語"), "en");
  await page.screenshot({ path: resolve(screenshotDir, "menu-390.png") });
  await page.getByRole("button", { name: "メニュー", exact: true }).click();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), preferenceKey), "en");
  await page.reload();
  await expectValue(page.getByLabel("翻訳先言語"), "en");
  await page.getByPlaceholder("日本語を入力").fill("英語へ翻訳");
  await page.getByRole("button", { name: "送信", exact: true }).click();
  await page.getByText("テスト結果 ja-to-en", { exact: true }).waitFor();
  await page.getByRole("button", { name: "翻訳方向を切り替え" }).click();
  await page.getByPlaceholder("英語を入力").fill("Hello");
  await page.getByRole("button", { name: "音声入力", exact: true }).click();
  assert.equal(await page.evaluate(() => window.testSpeechLanguage), "en-US");
  await page.getByRole("button", { name: "送信", exact: true }).click();
  await page.getByText("テスト結果 en-to-ja", { exact: true }).waitFor();

  await page.getByRole("link", { name: "ドリル", exact: true }).click();
  await page.getByRole("button", { name: "英語", exact: true, pressed: true }).waitFor();
  await page.getByText("英語の練習用", { exact: true }).first().waitFor();
  assert.equal(await page.getByText("中国語の練習用", { exact: true }).count(), 0);
  assert.equal(requests.filter(({ payload }) => payload?.eventName === "drill_open").at(-1)?.payload.targetLanguage, "en");
  await page.screenshot({ path: resolve(screenshotDir, "drill-en-390.png") });
  await checkLibrary(page, "en");
  await page.getByLabel("学習言語（全画面共通）").selectOption("all");
  await page.getByText("中国語の練習用", { exact: true }).waitFor();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), preferenceKey), "en");
  await page.reload();
  await page.getByText("英語の練習用", { exact: true }).waitFor();
  assert.equal(await page.getByText("中国語の練習用", { exact: true }).count(), 0);

  await page.goto(`${origin}/conversation`);
  await expectValue(page.getByLabel("翻訳先言語"), "en");
  await page.getByPlaceholder("日本語を入力").fill("会話のテスト");
  await page.getByRole("button", { name: "送信", exact: true }).click();
  await page.getByText("テスト結果 ja-to-en", { exact: true }).waitFor();
  await page.getByLabel("翻訳先言語").selectOption("zh");
  await checkLibrary(page, "zh");
  await page.getByLabel("学習言語（全画面共通）").selectOption("en");
  await page.getByText("英語の練習用", { exact: true }).waitFor();
  await page.goto(`${origin}/drill`);
  await page.getByRole("button", { name: "英語", exact: true, pressed: true }).waitFor();
  await page.getByRole("button", { name: "中国語", exact: true }).click();
  await page.getByText("中国語の練習用", { exact: true }).first().waitFor();
  await page.goto(`${origin}/add`);
  await expectValue(page.getByLabel("翻訳先言語"), "zh");
  await page.getByRole("button", { name: "翻訳方向を切り替え" }).click();

  const secondPage = await context.newPage();
  await secondPage.goto(origin);
  await expectValue(secondPage.getByLabel("翻訳先言語"), "zh");
  await secondPage.getByLabel("翻訳先言語").selectOption("en");
  await expectValue(page.getByLabel("翻訳先言語"), "en");
  await page.getByPlaceholder("英語を入力").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).length, phrasesKey), 2);
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).map(
    ({ id, sourceText, targetText, targetLanguage }) => ({ id, sourceText, targetText, targetLanguage }),
  ), phrasesKey), fixtures.map(({ id, sourceText, targetText, targetLanguage }) => ({ id, sourceText, targetText, targetLanguage })));
  assert.equal(requests.some(({ path }) => path === "/api/phrase/save-pack"), false);

  const storageState = await context.storageState();
  await context.close();
  const restored = await createContext({ storageState, viewport: { width: 430, height: 932 } });
  const restoredPage = await restored.newPage();
  await restoredPage.goto(`${origin}/conversation`);
  await expectValue(restoredPage.getByLabel("翻訳先言語"), "en");
  await restoredPage.evaluate((key) => localStorage.setItem(key, "invalid"), preferenceKey);
  await restoredPage.reload();
  await expectValue(restoredPage.getByLabel("翻訳先言語"), "zh");
  await restoredPage.getByLabel("翻訳先言語").selectOption("en");
  await restoredPage.goto(origin);
  await expectValue(restoredPage.getByLabel("翻訳先言語"), "en");
  await restoredPage.screenshot({ path: resolve(screenshotDir, "translate-en-430.png") });
  await restored.close();

  const blocked = await createContext();
  await blocked.addInitScript((key) => {
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("Test quota", "QuotaExceededError");
      return originalSet.call(this, name, value);
    };
  }, preferenceKey);
  const blockedPage = await blocked.newPage();
  await blockedPage.goto(origin);
  await expectValue(blockedPage.getByLabel("翻訳先言語"), "zh");
  await blockedPage.getByLabel("翻訳先言語").selectOption("en");
  await expectValue(blockedPage.getByLabel("翻訳先言語"), "en");
  await blockedPage.getByRole("link", { name: "ドリル", exact: true }).click();
  await blockedPage.getByRole("button", { name: "英語", exact: true, pressed: true }).waitFor();
  await blocked.close();
  assert.deepEqual(errors, []);
  console.log("PASS: shared language across translation/drill/library/conversation, reload, restored browser, cross-tab, reverse direction, speech locale, invalid value, storage failure, no phrase mutation, 390/430px");
} finally {
  await browser.close();
}
