import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const origin = "http://localhost:3010";
const phraseKey = "poker-chinese-local-phrases-v1";
const srsKey = "poker-chinese-srs-v1";
const historyKey = "phrabit-translation-history-v1";
const shots = resolve("tmp/phrabit-responsive-shots/personal-phrase");
mkdirSync(shots, { recursive: true });
const executablePath = [chromium.executablePath(), "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });

async function setup(language, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const errors = [];
  const calls = [];
  const gate = Promise.withResolvers();
  let failExplanation = false;
  await context.addInitScript((language) => {
    if (location.origin !== "http://localhost:3010") return;
    localStorage.setItem("phrabit:add-tutorial-seen", "1");
    localStorage.setItem("phrabit-learning-language-v1", language);
  }, language);
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const body = route.request().postDataJSON();
    calls.push({ path: url.pathname, body });
    if (url.pathname === "/api/phrase/add" && !body.warmup) {
      const targetText = language === "zh" ? "不用袋子。" : "I don't need a bag.";
      return route.fulfill({ json: { id: body.phraseId, direction: body.direction, sourceLanguage: "ja", targetLanguage: language, sourceText: body.text, targetText, japanese: body.text, chinese: targetText, reading: language === "zh" ? "bù yòng dài zi" : "", pinyin: language === "zh" ? "bù yòng dài zi" : "", readingType: language === "zh" ? "pinyin" : "none", explanation: "", provider: "deepl" } });
    }
    if (url.pathname === "/api/phrase/explain") {
      await gate.promise;
      return route.fulfill(failExplanation ? { status: 500, json: { error: "explanation failure" } } : { json: { explanation: "長い解説も省略せず保存します。".repeat(30) } });
    }
    return route.fulfill({ json: { ok: true } });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, gate, calls, errors, fail: () => { failExplanation = true; } };
}

async function stored(page, key) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), key);
}

try {
  for (const [language, width] of [["zh", 390], ["en", 430]]) {
    const { context, page, gate, calls, errors } = await setup(language, width);
    try {
      await page.goto(origin + "/drill");
      await page.getByRole("button", { name: "サンプルで試す" }).click();
      await page.getByRole("heading", { name: "サンプル", exact: true }).waitFor();
      assert.deepEqual(await stored(page, phraseKey), []);
      assert.deepEqual(await stored(page, srsKey), []);
      await page.getByRole("link", { name: "翻訳", exact: true }).click();
      await page.getByPlaceholder("日本語を入力").fill("袋は要りません");
      await page.getByRole("button", { name: "送信", exact: true }).click();
      const target = language === "zh" ? "不用袋子。" : "I don't need a bag.";
      await page.getByText(target, { exact: true }).waitFor();
      await page.getByRole("button", { name: "調整", exact: true }).click();
      await page.getByRole("textbox", { name: "ニュアンスを調整", exact: true }).fill("丁寧なニュアンス");
      await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
      await page.getByRole("link", { name: "保存", exact: true }).click();
      await page.getByText("該当するフレーズがありません", { exact: true }).waitFor();
      await page.getByRole("link", { name: "翻訳", exact: true }).click();
      await page.getByText(target, { exact: true }).waitFor();
      await page.getByRole("button", { name: "調整", exact: true }).click();
      assert.equal(await page.getByRole("textbox", { name: "ニュアンスを調整", exact: true }).inputValue(), "丁寧なニュアンス");
      await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
      const add = page.getByRole("button", { name: "ドリルに追加", exact: true });
      const details = page.getByText("使い方・想定返答", { exact: true });
      if (await details.count()) assert.ok((await add.boundingBox()).y < (await details.boundingBox()).y);
      await add.click();
      const practice = page.getByRole("link", { name: "追加した一言を練習", exact: true });
      await practice.waitFor({ timeout: 2000 });
      const saved = await stored(page, phraseKey);
      assert.equal(saved.length, 1);
      assert.equal(saved[0].explanation, "");
      assert.equal(calls.filter((call) => call.path === "/api/phrase/explain").length, 1, "navigation must not duplicate generation");
      await page.screenshot({ path: resolve(shots, language + "-saved-before-explanation.png"), fullPage: true });
      await practice.click();
      await page.getByRole("heading", { name: language === "zh" ? "中国語ドリル" : "英語ドリル", exact: true }).waitFor();
      await page.getByText("袋は要りません", { exact: true }).first().waitFor();
      await page.screenshot({ path: resolve(shots, language + "-focused-drill.png"), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.getByText("袋は要りません", { exact: true }).first().click();
      await page.getByRole("button", { name: /Good/ }).click();
      await page.getByText("追加した一言の練習完了", { exact: true }).waitFor();
      gate.resolve();
      await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key) ?? "[]")[0]?.explanation.includes("長い解説"), phraseKey);
      assert.equal((await stored(page, phraseKey)).length, 1);
      assert.equal((await stored(page, srsKey))[0].lastScore, 2, "explanation must preserve learning progress");
      assert.equal(await page.getByText("追加した一言の練習完了", { exact: true }).isVisible(), true);
      await page.getByRole("link", { name: "保存", exact: true }).click();
      await page.getByText("袋は要りません", { exact: true }).click();
      await page.getByRole("link", { name: "この一言を練習" }).waitFor();
      await page.screenshot({ path: resolve(shots, language + "-library.png"), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.getByRole("button", { name: /フィルター/ }).click();
      await page.getByLabel("学習言語（全画面共通）").selectOption(language === "zh" ? "en" : "zh");
      await page.getByRole("button", { name: /フィルター/ }).click();
      await page.getByLabel("学習言語（全画面共通）").selectOption("all");
      await page.getByText("袋は要りません", { exact: true }).click();
      await page.getByRole("link", { name: "この一言を練習" }).click();
      await page.getByText("袋は要りません", { exact: true }).first().waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem("phrabit-learning-language-v1")), language);
      await page.getByRole("link", { name: "保存", exact: true }).click();
      await page.getByText("袋は要りません", { exact: true }).click();
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "削除", exact: true }).click();
      await page.getByRole("link", { name: "翻訳", exact: true }).click();
      await page.getByRole("button", { name: "ドリルに追加", exact: true }).waitFor();
      assert.deepEqual(await stored(page, phraseKey), [], "deleted draft must not claim to be saved");
      assert.deepEqual(errors, []);
      console.log("PASS " + language + ": optional samples, restored draft/nuance, immediate save during explanation, one generation, focused practice, background enrichment preserves SRS, compact library");
    } finally {
      gate.resolve();
      await context.close();
    }
  }
  const { context, page, gate, calls, errors, fail } = await setup("en", 430);
  try {
    await page.goto(origin + "/conversation");
    await page.getByPlaceholder("日本語を入力").fill("袋は要りません");
    await page.getByRole("button", { name: "送信", exact: true }).click();
    await page.getByText("I don't need a bag.", { exact: true }).waitFor();
    assert.deepEqual(await stored(page, historyKey), [], "unselected conversation must not be persisted");
    assert.deepEqual(await stored(page, phraseKey), []);
    await page.getByRole("button", { name: "ドリルに追加", exact: true }).click();
    await page.getByText("袋は要りません", { exact: true }).click();
    await page.getByRole("button", { name: "ドリルに追加", exact: true }).last().click();
    await page.getByText("端末のドリルに追加済み", { exact: true }).waitFor({ timeout: 2000 });
    assert.equal((await stored(page, phraseKey)).length, 1);
    assert.equal((await stored(page, historyKey)).length, 1);
    fail();
    gate.resolve();
    await page.getByRole("link", { name: "追加した一言を練習" }).click();
    await page.getByText("袋は要りません", { exact: true }).first().waitFor();
    assert.equal((await stored(page, phraseKey)).length, 1);
    assert.equal(calls.filter((call) => call.path === "/api/phrase/add" && !call.body.warmup).length, 1);
    assert.deepEqual(errors, []);
    console.log("PASS conversation: no unselected history, explicit save before explanation, explanation failure does not prevent practice");
  } finally {
    gate.resolve();
    await context.close();
  }
  const normal = await setup("en", 390);
  try {
    await normal.page.goto(origin);
    await normal.page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify(["A", "B"].map((suffix) => ({
        id: "test-normal-" + suffix, japanese: "テスト" + suffix, chinese: "Test " + suffix,
        sourceLanguage: "ja", targetLanguage: "en", sourceText: "テスト" + suffix,
        targetText: "Test " + suffix, direction: "ja-to-en", pinyin: "", reading: "", readingType: "none",
        explanation: "", createdAt: new Date().toISOString(), shouldDrill: true, categoryId: "other", source: "manual",
      }))));
    }, phraseKey);
    await normal.page.getByRole("link", { name: "ドリル", exact: true }).click();
    await normal.page.getByText("0/2 · 0%", { exact: true }).waitFor();
    await normal.page.getByText(/^テスト[AB]$/).first().click();
    await normal.page.getByRole("button", { name: /Good/ }).click();
    await normal.page.evaluate(() => window.dispatchEvent(new Event("phrabit-account-phrase-data-synced")));
    await normal.page.getByText("1/2 · 50%", { exact: true }).waitFor();
    await normal.page.getByText(/^テスト[AB]$/).first().click();
    await normal.page.getByRole("button", { name: /Bad/ }).click();
    await normal.page.evaluate(() => window.dispatchEvent(new Event("phrabit-account-phrase-data-synced")));
    await normal.page.getByText("1/2 · 50%", { exact: true }).waitFor();
    await normal.page.getByText(/^テスト[AB]$/).first().click();
    await normal.page.getByRole("button", { name: /Good/ }).click();
    await normal.page.getByText("今日のドリル完了", { exact: true }).waitFor();
    assert.deepEqual(normal.errors, []);
    console.log("PASS normal drill: background account sync preserves session progress and Bad retry");
  } finally {
    normal.gate.resolve();
    await normal.context.close();
  }
} finally {
  await browser.close();
}
