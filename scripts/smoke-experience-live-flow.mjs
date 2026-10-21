import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { loadSource } from "./load-typescript-source.mjs";

const origin = process.env.PHRABIT_TEST_ORIGIN || "http://127.0.0.1:3014";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const directory = resolve("tmp/phrabit-responsive-shots/experience-gemini-contract-20261021");
mkdirSync(directory, { recursive: true });
const { parseExperiencePhraseResponse } = loadSource(resolve("src/infrastructure/server/experience-phrase-generator"));
const executablePath = [chromium.executablePath(), "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
const results = [];
try {
  for (const [language, width, explanationFails] of [["zh", 360, false], ["en", 430, false], ["en", 1280, true]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "ja-JP", serviceWorkers: "block" });
    let releaseExplanation;
    try {
      await context.addInitScript((language) => {
        localStorage.setItem("phrabit-learning-language-v1", language);
        localStorage.setItem("phrabit:add-tutorial-seen", "1");
        window.testSpeechCalls = [];
        window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
        Object.defineProperty(window, "speechSynthesis", { value: { getVoices: () => [], cancel: () => {}, resume: () => {}, addEventListener: () => {}, speak: (utterance) => window.testSpeechCalls.push(utterance.text) } });
      }, language);
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      let rejectGeneration = false;
      let candidate;
      page.on("pageerror", (error) => errors.push(error.message));
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith("/api/")) return route.continue();
        const payload = route.request().postData() ? route.request().postDataJSON() : null;
        requests.push({ path: url.pathname, payload });
        if (url.pathname === "/api/phrase/from-experience") {
          if (rejectGeneration) return route.fulfill({ status: 429, json: { error: "サービス全体の生成予算に達しました。" } });
          const refined = Boolean(payload.nuance);
          candidate = parseExperiencePhraseResponse(JSON.stringify({ status: "ready", sourceText: refined ? "明日の午前に届けていただけますか？" : "明日の午前に届けてください。", targetText: language === "zh" ? (refined ? "可以明天上午送到吗？" : "请明天上午送到。") : (refined ? "Could you deliver it tomorrow morning?" : "Please deliver it tomorrow morning.") }), language);
          return route.fulfill({ json: candidate });
        }
        if (url.pathname === "/api/phrase/explain") {
          await new Promise((resolveGate) => { releaseExplanation = resolveGate; });
          return route.fulfill(explanationFails ? { status: 503, json: { error: "模擬解説失敗" } } : { json: { explanation: "明日の午前に届くよう依頼する表現です。" } });
        }
        return route.fulfill({ json: { ok: true, tracked: true } });
      });
      await page.goto(origin + "/add/experience");
      const input = page.getByRole("textbox", { name: "何がありましたか？", exact: true });
      await input.waitFor();
      assert.equal(await page.getByText("画面確認用のサンプル応答", { exact: true }).count(), 0);
      const story = "荷物の受取りで困った。明日の午前に届けてほしいと言えなかった。この出来事本文は保存しない。";
      await input.fill(story);
      await page.getByRole("button", { name: "一言を作る", exact: true }).click();
      await page.getByRole("heading", { name: "次に言う一言（日本語）", exact: true }).waitFor();
      await page.getByText(candidate.phrase.targetText, { exact: true }).waitFor();
      assert.equal(requests.filter((request) => request.path === "/api/phrase/explain").length, 0);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("poker-chinese-local-phrases-v1") ?? "[]").length), 0);
      await page.getByRole("button", { name: "調整", exact: true }).click();
      await page.getByRole("textbox", { name: "ニュアンスを調整", exact: true }).fill("もっと丁寧に");
      await page.getByRole("button", { name: "このニュアンスで作り直す", exact: true }).click();
      await page.getByText("明日の午前に届けていただけますか？", { exact: true }).waitFor();
      assert.equal(await input.inputValue(), story);
      assert.equal(requests.filter((request) => request.path === "/api/phrase/from-experience").length, 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: resolve(directory, `${language}-${width}-candidate.png`), fullPage: true });
      rejectGeneration = true;
      await page.getByRole("button", { name: "一言を作る", exact: true }).click();
      await page.getByText("サービス全体の生成予算に達しました。", { exact: true }).waitFor();
      await page.getByText(candidate.phrase.targetText, { exact: true }).waitFor();
      assert.equal(await input.inputValue(), story);
      await page.getByRole("button", { name: "ドリルに追加", exact: true }).click();
      await page.getByRole("link", { name: "追加した一言を練習", exact: true }).waitFor();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("poker-chinese-local-phrases-v1") ?? "[]").length === 1);
      while (!releaseExplanation) await new Promise((resolveTick) => setTimeout(resolveTick, 20));
      const explain = requests.find((request) => request.path === "/api/phrase/explain").payload;
      assert.equal(explain.sourceText, candidate.phrase.sourceText);
      assert.equal(explain.targetText, candidate.phrase.targetText);
      assert.notEqual(explain.sourceText, story);
      const storedBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("poker-chinese-local-phrases-v1"))[0]);
      assert.equal(storedBefore.explanation, "");
      releaseExplanation();
      releaseExplanation = null;
      if (!explanationFails) await page.waitForFunction(() => JSON.parse(localStorage.getItem("poker-chinese-local-phrases-v1"))[0].explanation.includes("明日の午前"));
      await page.getByRole("link", { name: "追加した一言を練習", exact: true }).click();
      await page.getByText(candidate.phrase.sourceText, { exact: true }).waitFor();
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("poker-chinese-local-phrases-v1")));
      assert.equal(stored.length, 1);
      assert.equal(stored[0].id, storedBefore.id);
      assert.equal(stored[0].shouldDrill, true);
      const cloud = requests.filter((request) => request.path === "/api/phrase/save-pack");
      assert.ok(cloud.length >= 1);
      assert.equal(cloud[0].payload.phrases[0].id, stored[0].id);
      assert.doesNotMatch(JSON.stringify(requests.filter((request) => request.path !== "/api/phrase/from-experience")), /この出来事本文/);
      assert.equal(await page.evaluate((story) => JSON.stringify(localStorage).includes(story), story), false);
      assert.deepEqual(await page.evaluate(() => window.testSpeechCalls), []);
      assert.deepEqual(errors, []);
      results.push({ language, width, explanationFails, status: "passed", services: "all mocked" });
      console.log(`PASS ${language}/${width}: one candidate, refinement, budget failure retention, explicit save before explanation, drill; explanation failure=${explanationFails}`);
    } finally {
      releaseExplanation?.();
      await context.close();
    }
  }
  writeFileSync(resolve(directory, "results.json"), JSON.stringify({ status: "passed", results, paidCalls: 0, actualModelQualityTested: false, actualCloudSyncTested: false }, null, 2));
} finally {
  await browser.close();
}
