import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const origin = process.argv.includes("--production") ? "https://phrabit.com" : "http://127.0.0.1:3061";
const oldPage = "/add/experience";
const retiredApi = "/api/phrase/from-experience";
const previous = { id: "20000000-0000-4000-8000-000000000001", source: "manual", shouldDrill: true, japanese: "部屋の掃除をお願いできますか。", chinese: "请帮我打扫一下房间。", sourceText: "部屋の掃除をお願いできますか。", targetText: "请帮我打扫一下房间。", sourceLanguage: "ja", targetLanguage: "zh", direction: "ja-to-zh", reading: "qǐng bāng wǒ dǎsǎo yíxià fángjiān", readingType: "pinyin", explanation: "ホテルで使う表現。", createdAt: "2026-10-21T00:00:00Z" };
const redirect = await fetch(origin + oldPage, { redirect: "manual" });
assert.equal(redirect.status, 308);
assert.equal(new URL(redirect.headers.get("location"), origin).href, origin + "/");
assert.equal((await fetch(origin + retiredApi)).status, 404);
if (origin.startsWith("http://127.")) assert.equal((await fetch(origin + retiredApi, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 404);
const browser = await chromium.launch({ headless: true, executablePath: [chromium.executablePath(), "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync) });
try {
  const context = await browser.newContext({ viewport: { width: 430, height: 850 }, serviceWorkers: "block" });
  const errors = [], retiredRequests = [];
  await context.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === retiredApi) retiredRequests.push(url.pathname);
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { ok: true, tracked: true, phrases: [], srsItems: [] } });
    if (!["GET", "HEAD"].includes(request.method()) || request.headers().authorization) return route.abort();
    return route.continue();
  });
  await context.addInitScript(phrase => {
    if (sessionStorage.getItem("previous-phrase-fixture")) return;
    sessionStorage.setItem("previous-phrase-fixture", "1");
    localStorage.setItem("phrabit:add-tutorial-seen", "1");
    localStorage.setItem("phrabit-learning-language-v1", "zh");
    localStorage.setItem("poker-chinese-local-phrases-v1", JSON.stringify([phrase]));
    localStorage.setItem("poker-chinese-srs-v1", JSON.stringify([{ id: phrase.id, status: "review", intervalDays: 2, consecutiveGood: 1, easeFactor: 2.5, lastScore: 2, lastReviewedAt: Date.now() - 86400000, nextReviewAt: Date.now() - 1 }]));
  }, previous);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + oldPage);
  await page.getByPlaceholder("日本語を入力", { exact: true }).waitFor();
  assert.equal(page.url(), origin + "/");
  assert.equal(await page.getByRole("navigation", { name: "入力方法" }).count(), 0);
  assert.equal(await page.getByText("出来事から", { exact: true }).count(), 0);
  await page.getByRole("link", { name: "会話モードを開く" }).click();
  await page.waitForURL(origin + "/conversation");
  await page.getByPlaceholder("日本語を入力", { exact: true }).waitFor();
  await page.goto(origin + "/library");
  await page.getByText(previous.sourceText, { exact: true }).first().click();
  await page.getByRole("heading", { name: "使い方・想定返答" }).waitFor();
  await page.getByRole("link", { name: "ドリル", exact: true }).click();
  await page.getByText(previous.sourceText, { exact: true }).first().waitFor();
  await page.getByText("タップして確認", { exact: true }).click();
  await page.getByRole("button", { name: /^Good/ }).waitFor();
  assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem("poker-chinese-local-phrases-v1")).some(phrase => phrase.id === id), previous.id), true);
  assert.deepEqual(retiredRequests, []);
  assert.deepEqual(errors, []);
  console.log("PASS: old URL redirects to translation, old API absent, no mode switch, conversation accessible, previous saved phrase available in library and drill");
} finally { await browser.close(); }
