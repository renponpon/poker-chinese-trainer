import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const origin = process.env.PHRABIT_TEST_ORIGIN || "http://127.0.0.1:3036";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const output = resolve("../release-artifacts/20261024-learning-days");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: [chromium.executablePath(), "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync) });
const results = [];
const prefix = "phrabit-learning-days-v1:guest:";

async function setup({ width = 430, height = 850, language = "zh", history = [], empty = false, prototype = false, owner = "guest" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
  context.setDefaultTimeout(20000);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-24T03:00:00Z"));
  await context.addInitScript(({ language, history, empty, prototype, owner }) => {
    if (!localStorage.getItem("learning-ui-seeded")) {
      const target = language === "zh" ? "请帮我打扫一下房间。" : "Could you clean my room, please?";
      localStorage.setItem("phrabit:add-tutorial-seen", "1");
      localStorage.setItem("phrabit-learning-language-v1", language);
      localStorage.setItem("phrabit-account-cache-owner-v1", owner);
      localStorage.setItem("poker-chinese-local-phrases-v1", JSON.stringify(empty ? [] : [{ id: "learning-ui-phrase", japanese: "部屋の掃除をお願いできますか。", chinese: target, sourceText: "部屋の掃除をお願いできますか。", targetText: target, sourceLanguage: "ja", targetLanguage: language, direction: `ja-to-${language}`, reading: "", readingType: language === "zh" ? "pinyin" : "none", pinyin: "", explanation: "テスト用。", shouldDrill: true, source: prototype ? "prototype" : "manual", createdAt: "2026-10-24T00:00Z", categoryId: null, audioUrl: null, usedAt: null }]));
      localStorage.setItem("poker-chinese-srs-v1", JSON.stringify(empty ? [] : [{ id: "learning-ui-phrase", status: "new", nextReviewAt: 0, intervalDays: 0, easeFactor: 2.5, consecutiveGood: 0, lastScore: null, lastReviewedAt: null }]));
      if (history.length) {
        localStorage.setItem(`phrabit-learning-days-v1:${owner}:zone`, JSON.stringify("Asia/Tokyo"));
        for (const day of history) localStorage.setItem(`phrabit-learning-days-v1:${owner}:day:${day}`, JSON.stringify(day));
      }
      localStorage.setItem("learning-ui-seeded", "1");
    }
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (window.failLearningWrite && key.includes(":event:")) throw new Error("test quota");
      if (window.failSrsWrite && key === "poker-chinese-srs-v1") throw new Error("test quota");
      return original.call(this, key, value);
    };
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
  }, { language, history, empty, prototype, owner });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (/speech|tts/.test(url.pathname)) return route.fulfill({ status: 503, json: { error: "offline test" } });
    return route.fulfill({ json: { ok: true, tracked: true } });
  });
  await page.goto(`${origin}/drill${empty ? "" : "?phrases=learning-ui-phrase&practice=once"}`, { waitUntil: "networkidle", timeout: 120000 });
  return { context, page, errors };
}

async function answer(page, name = "Bad") {
  await page.waitForFunction(() => {
    const card = document.querySelector(".cursor-pointer.preserve-3d");
    return card && getComputedStyle(card).pointerEvents !== "none" && getComputedStyle(card).visibility === "visible";
  });
  await page.getByText("タップして確認", { exact: true }).click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
}

async function assertCounts(page, expected) {
  await page.getByRole("heading", { name: "学習記録", exact: true }).waitFor();
  await page.waitForFunction((expected) => [...document.querySelectorAll("dd")].map((element) => element.textContent.trim().replace(/\s/g, "")).join(",") === expected.map((count) => `${count}日`).join(","), expected);
}

try {
  for (const [width, language] of [[344,"zh"],[360,"en"],[390,"zh"],[430,"en"],[768,"zh"],[1280,"en"]]) {
    const state = await setup({ width, language, history: ["2026-10-22", "2026-10-23"] });
    await state.page.getByRole("link", { name: /今週 2日.*2日連続/ }).waitFor();
    await answer(state.page);
    await state.page.getByRole("heading", { name: "1回練習しました", exact: true }).waitFor();
    await state.page.getByRole("link", { name: /今週 3日.*3日連続.*累計 3日/ }).waitFor();
    assert.equal(await state.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await state.page.screenshot({ path: resolve(output, `completion-${language}-${width}.png`) });
    await state.page.getByRole("button", { name: "もう1回", exact: true }).click();
    await answer(state.page, "Good");
    await state.page.getByRole("link", { name: /今週 3日.*3日連続.*累計 3日/ }).click();
    await assertCounts(state.page, [3,3,3]);
    await state.page.reload({ waitUntil: "networkidle" });
    await assertCounts(state.page, [3,3,3]);
    await state.page.screenshot({ path: resolve(output, `details-${language}-${width}.png`), fullPage: true });
    assert.deepEqual(state.errors, []);
    await state.context.close();
    results.push(`EN/ZH ${width}px: Bad, repeat dedup, completion/details, reload`);
    console.log(results.at(-1));
  }
  {
    const state = await setup();
    assert.equal(await state.page.getByRole("link", { name: /今週/ }).count(), 0);
    await state.page.evaluate(() => { window.failLearningWrite = true; });
    await answer(state.page);
    await state.page.getByRole("heading", { name: "1回練習しました", exact: true }).waitFor();
    await state.page.getByRole("link", { name: "学習記録の保存を確認する ›" }).click();
    await state.page.getByRole("alert").waitFor();
    const srs = await state.page.evaluate(() => localStorage.getItem("poker-chinese-srs-v1"));
    await state.page.evaluate(() => { window.failLearningWrite = false; });
    await state.page.getByRole("button", { name: "記録を再読み込み" }).click();
    await assertCounts(state.page, [1,1,1]);
    assert.equal(await state.page.evaluate(() => localStorage.getItem("poker-chinese-srs-v1")), srs);
    await state.context.close();
    results.push("first day hidden before answer; quota after SRS commit recovers without repeated score");
    console.log(results.at(-1));
  }
  {
    const state = await setup();
    await state.page.evaluate(() => { window.failSrsWrite = true; });
    await answer(state.page);
    await state.page.getByRole("alert").waitFor();
    assert.equal(await state.page.evaluate((prefix) => Object.keys(localStorage).filter((key) => key.startsWith(prefix) && key.includes(":event:")).length, prefix), 0);
    await state.page.waitForTimeout(600);
    await state.page.evaluate(() => { window.failSrsWrite = false; });
    await answer(state.page);
    await state.page.getByRole("link", { name: /今週 1日.*累計 1日/ }).waitFor();
    await state.context.close();
    results.push("SRS failure no credit; explicit retry credits once");
    console.log(results.at(-1));
  }
  for (const sample of [false,true]) {
    const state = await setup({ empty: sample, prototype: !sample });
    if (sample) await state.page.getByRole("button", { name: "サンプルで試す" }).click();
    await answer(state.page, "Good");
    await state.page.goto(`${origin}/learning`, { waitUntil: "networkidle" });
    assert.equal(await state.page.locator("dd").count(), 0);
    await state.context.close();
  }
  results.push("samples and mock prototypes excluded");
  console.log(results.at(-1));
  {
    const owner = "11111111-1111-4111-8111-111111111111";
    const state = await setup({ owner });
    await answer(state.page);
    await state.page.getByRole("link", { name: "学習日は同期後に確定します ›" }).click();
    await state.page.getByText(/回答は保存済みです。アカウントの学習日付/).waitFor();
    assert.equal(await state.page.locator("dd").count(), 0);
    await state.page.evaluate(() => {
      localStorage.setItem("phrabit-account-cache-owner-v1", "22222222-2222-4222-8222-222222222222");
      window.dispatchEvent(new Event("phrabit-account-phrase-data-synced"));
    });
    await state.page.getByText("保存した一言を1回練習すると、ここに学習日が残ります。").waitFor();
    await state.context.close();
    results.push("offline new account waits for shared timezone; owner switch hides preceding account");
    console.log(results.at(-1));
  }
  {
    const state = await setup({ history: ["2026-10-22","2026-10-23"] });
    await state.page.goto(`${origin}/learning`, { waitUntil: "networkidle" });
    const otherTab = await state.context.newPage();
    await otherTab.goto(`${origin}/learning`, { waitUntil: "networkidle" });
    await assertCounts(otherTab, [2,2,2]);
    await state.page.evaluate((prefix) => localStorage.setItem(prefix + "day:2026-10-24", JSON.stringify("2026-10-24")), prefix);
    await assertCounts(otherTab, [3,3,3]);
    await state.context.close();
    results.push("other-tab storage event updates counters");
    console.log(results.at(-1));
  }
  {
    const state = await setup({ width: 360, height: 640, history: ["2026-10-22","2026-10-23"] });
    await state.page.getByText("タップして確認", { exact: true }).click();
    const bad = state.page.getByRole("button", { name: /Bad/ });
    await bad.waitFor();
    await bad.click({ trial: true });
    const bounds = await bad.boundingBox();
    await state.page.screenshot({ path: resolve(output, "active-360x640.png") });
    assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height < 570, `rating above bottom navigation on short screen: ${JSON.stringify(bounds)}`);
    await bad.click();
    await state.page.getByRole("link", { name: /今週 3日.*累計 3日/ }).click();
    await state.page.clock.setFixedTime(new Date("2026-10-25T03:00:00Z"));
    await state.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await assertCounts(state.page, [3,3,3]);
    await state.page.getByText(/今日はまだ未記録/).waitFor();
    await state.page.clock.setFixedTime(new Date("2026-10-26T03:00:00Z"));
    await state.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await assertCounts(state.page, [0,0,3]);
    await state.context.close();
    results.push("360x640 rating reachable; midnight/yesterday streak and Monday weekly reset preserve lifetime");
  }
  writeFileSync(resolve(output, "browser-results.json"), JSON.stringify({ origin, results, paidApiCalls: 0 }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
