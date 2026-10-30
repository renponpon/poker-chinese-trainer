import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const origin = "http://127.0.0.1:3042";
const output = resolve("../release-artifacts/20261030-drill-controls");
const phraseKey = "poker-chinese-local-phrases-v1";
const srsKey = "poker-chinese-srs-v1";
const now = Date.now();
const day = 86400000;
const results = [];
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: [chromium.executablePath(), "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync) });
const basePhrase = (id, language, overrides = {}) => ({
  id, japanese: `確認用 ${id}`, chinese: language === "zh" ? "请帮我打扫一下房间。" : "Could you clean my room, please?",
  sourceLanguage: "ja", targetLanguage: language, sourceText: `確認用 ${id}`, targetText: language === "zh" ? "请帮我打扫一下房间。" : "Could you clean my room, please?",
  reading: language === "zh" ? "qǐng bāng wǒ dǎ sǎo yí xià fáng jiān" : "", pinyin: "", readingType: language === "zh" ? "pinyin" : "none", explanation: "検証用の固定解説です。",
  audioUrl: null, createdAt: new Date(now - day * 7).toISOString(), direction: `ja-to-${language}`, categoryId: null, shouldDrill: true, source: "manual", usedAt: null, ...overrides,
});
const baseItem = (id, overrides = {}) => ({ id, status: "review", intervalDays: 1, consecutiveGood: 1, easeFactor: 2.5, lastScore: 3, lastReviewedAt: now - day, nextReviewAt: now - 1, ...overrides });

async function setup(language, width, ids = ["ordinary", "good", "old-bad", "recent-bad", "priority", "future", "paused", "mastered"], startPath = "/drill") {
  const phrases = ids.map((id) => basePhrase(id, language, { shouldDrill: id !== "paused", drillPriority: ["priority", "future", "paused", "mastered"].includes(id) }));
  const items = ids.map((id) => baseItem(id, { lastScore: id.includes("bad") ? 1 : id === "good" ? 2 : 3, lastReviewedAt: id === "old-bad" ? now - 3 * day : now - day, nextReviewAt: id === "future" ? now + day : now - 1, status: id === "mastered" ? "mastered" : "review" }));
  const context = await browser.newContext({ viewport: { width, height: width === 360 ? 740 : 850 }, timezoneId: "Asia/Tokyo", serviceWorkers: "block" });
  await context.addInitScript(({ phrases, items, language, phraseKey, srsKey }) => {
    if (!localStorage.getItem("drill-controls-fixture")) {
      localStorage.setItem(phraseKey, JSON.stringify(phrases));
      localStorage.setItem(srsKey, JSON.stringify(items));
      localStorage.setItem("phrabit-learning-language-v1", language);
      localStorage.setItem("phrabit:add-tutorial-seen", "1");
      localStorage.setItem("drill-controls-fixture", "1");
    }
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (window.failPhraseWrite && key === phraseKey) throw new DOMException("synthetic failure", "QuotaExceededError");
      if (window.failRoundWrite && key.startsWith("phrabit-drill-round-v1:")) throw new DOMException("synthetic progress failure", "QuotaExceededError");
      if (window.failSrsWrite && key === srsKey) throw new DOMException("synthetic SRS failure", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  }, { phrases, items, language, phraseKey, srsKey });
  const events = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/analytics/event") events.push(route.request().postDataJSON());
    if (/speech|tts/.test(url.pathname)) return route.fulfill({ status: 503, json: { error: "local-only test" } });
    return route.fulfill({ json: { ok: true, tracked: true } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + startPath, { waitUntil: "networkidle" });
  if (ids.length) await page.getByText(`確認用 ${ids.includes("priority") ? "priority" : ids[0]}`, { exact: true }).waitFor();
  else await page.getByText("まだフレーズがありません", { exact: true }).waitFor();
  return { page, context, phrases, items, events, errors };
}

const snapshot = (page) => page.evaluate(({ phraseKey, srsKey }) => ({ phrases: JSON.parse(localStorage.getItem(phraseKey) || "[]"), items: JSON.parse(localStorage.getItem(srsKey) || "[]"), days: Object.keys(localStorage).filter((key) => key.startsWith("phrabit-learning-days-v1:") && key.includes(":event:")) }), { phraseKey, srsKey });
async function current(page, id) { await page.getByText(`確認用 ${id}`, { exact: true }).waitFor({ state: "visible" }); }
async function operate(page, name) {
  await page.getByText("カード設定", { exact: true }).click();
  await page.getByRole("button", { name, exact: false }).click();
}
async function answer(page, id, score) {
  await current(page, id);
  await page.getByText("タップして確認", { exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`^${score}`) }).click();
}
try {
  for (const [language, width] of [["en", 430], ["zh", 360], ["zh", 390], ["en", 1280]]) {
    const state = await setup(language, width);
    const { page } = state;
    try {
      assert.equal(await page.getByText("0/5 · 0%", { exact: true }).isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const priorityButton = page.getByRole("button", { name: "優先表示", exact: true });
      const cardSettings = page.getByText("カード設定", { exact: true });
      assert.equal(await priorityButton.getAttribute("aria-pressed"), "true");
      const compactHeight = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize) * 2);
      assert.ok(Math.abs((await priorityButton.boundingBox()).height - compactHeight) < 0.1);
      assert.ok(Math.abs((await cardSettings.boundingBox()).height - compactHeight) < 0.1);
      await cardSettings.click();
      assert.equal(await page.getByText("保存フレーズには残します", { exact: true }).isVisible(), true);
      assert.equal(await page.getByText("ドリルと保存フレーズから削除します", { exact: true }).isVisible(), true);
      await page.screenshot({ path: resolve(output, `controls-${language}-${width}.png`), fullPage: true });
      await page.getByRole("button", { name: "ドリルから外す", exact: false }).click();
      await current(page, "recent-bad");
      let saved = await snapshot(page);
      assert.equal(saved.phrases.find((phrase) => phrase.id === "priority").shouldDrill, false);
      assert.deepEqual(saved.items.find((item) => item.id === "priority"), state.items.find((item) => item.id === "priority"));
      assert.equal(saved.days.length, 0);
      page.once("dialog", (dialog) => dialog.dismiss());
      await operate(page, "保存からも削除する");
      await current(page, "recent-bad");
      page.once("dialog", (dialog) => { assert.match(dialog.message(), /他の端末/); return dialog.accept(); });
      await operate(page, "保存からも削除する");
      await current(page, "old-bad");
      saved = await snapshot(page);
      assert.equal(saved.phrases.some((phrase) => phrase.id === "recent-bad"), false);
      assert.equal(saved.items.some((item) => item.id === "recent-bad"), false);
      const inactiveColor = await priorityButton.evaluate((button) => getComputedStyle(button).backgroundColor);
      await page.getByRole("button", { name: "優先表示", exact: true, pressed: false }).click();
      await page.getByRole("button", { name: "優先表示", exact: true, pressed: true }).waitFor();
      assert.notEqual(await priorityButton.evaluate((button) => getComputedStyle(button).backgroundColor), inactiveColor);
      assert.equal(await page.getByRole("status").filter({ hasText: /優先/ }).count(), 0);
      await page.reload({ waitUntil: "networkidle" });
      await current(page, "old-bad");
      await page.getByRole("button", { name: "優先表示", exact: true, pressed: true }).click();
      await page.getByRole("button", { name: "優先表示", exact: true, pressed: false }).waitFor();
      assert.equal(await priorityButton.evaluate((button) => getComputedStyle(button).backgroundColor), inactiveColor);
      await operate(page, "ドリルから外す");
      await current(page, "good");
      assert.equal(state.events.some((event) => event.eventName === "drill_answer"), false);
      await page.goto(origin + "/library", { waitUntil: "networkidle" });
      await page.getByText("確認用 priority", { exact: true }).click();
      await page.getByRole("button", { name: "ドリルに追加", exact: true }).click();
      await page.getByRole("button", { name: "優先表示", exact: true, pressed: true }).waitFor();
      await page.goto(origin + "/drill", { waitUntil: "networkidle" });
      await current(page, "good");
      await answer(page, "good", "Good");
      await answer(page, "ordinary", "Good");
      await page.getByRole("button", { name: "あと1問", exact: true }).click();
      await current(page, "priority");
      saved = await snapshot(page);
      assert.deepEqual(saved.items.find((item) => item.id === "priority"), state.items.find((item) => item.id === "priority"));
      assert.deepEqual(state.errors, []);
      results.push(`${language}/${width}: compact 2rem controls, requested labels/descriptions, priority color and pressed state persist; priority → recent Bad → older Bad → Good; pause preserves schedule, delete confirm/cancel, library resume, no false answer or horizontal overflow`);
    } finally { await state.context.close(); }
  }
  const failure = await setup("en", 430, ["only"]);
  try {
    await failure.page.evaluate(() => { window.failPhraseWrite = true; });
    await operate(failure.page, "ドリルから外す");
    await failure.page.getByRole("alert").filter({ hasText: "変更を完了できません" }).waitFor();
    assert.equal((await snapshot(failure.page)).phrases[0].shouldDrill, true);
    await failure.page.evaluate(() => { window.failPhraseWrite = false; });
    await operate(failure.page, "ドリルから外す");
    await failure.page.getByText("英語のドリル対象がありません", { exact: true }).waitFor();
    assert.equal((await snapshot(failure.page)).items.length, 1);
    assert.equal(failure.events.filter((event) => event.eventName === "drill_answer").length, 0);
    results.push("last-card pause: no blank card, storage failure shown, retry succeeds without an answer");
  } finally { await failure.context.close(); }
  const deletion = await setup("zh", 430, ["only"]);
  try {
    deletion.page.once("dialog", (dialog) => dialog.accept());
    await operate(deletion.page, "保存からも削除する");
    await deletion.page.getByText("まだフレーズがありません", { exact: true }).waitFor();
    assert.deepEqual((await snapshot(deletion.page)).phrases, []);
    assert.deepEqual((await snapshot(deletion.page)).items, []);
    results.push("last-card deletion: empty state, saved phrase and schedule removed");
  } finally { await deletion.context.close(); }
  const practice = await setup("en", 430, ["first", "second"]);
  try {
    await answer(practice.page, "first", "Bad");
    await current(practice.page, "second");
    await practice.page.evaluate(() => window.dispatchEvent(new Event("phrabit-account-phrase-data-synced")));
    await current(practice.page, "second");
    await answer(practice.page, "second", "Good");
    await current(practice.page, "first");
    await answer(practice.page, "first", "Perfect");
    await practice.page.getByText("今回の2問が完了しました", { exact: true }).waitFor();
    assert.equal(practice.events.filter((event) => event.eventName === "drill_answer" && event.success).length, 3);
    await practice.page.goto(origin + "/drill?phrases=first&practice=once", { waitUntil: "networkidle" });
    await current(practice.page, "first");
    await answer(practice.page, "first", "Bad");
    await practice.page.getByRole("heading", { name: "1回練習しました", exact: true }).waitFor();
    results.push("Bad stays at tail across background sync; batch completion and one-answer practice verified");
  } finally { await practice.context.close(); }
  for (const [language, width] of [["en", 430], ["zh", 360]]) {
    const ids = [...Array.from({ length: 12 }, (_, index) => `card-${String(index).padStart(2, "0")}`), "future", "paused", "mastered"];
    const state = await setup(language, width, ids);
    const { page } = state;
    try {
      await page.getByText("0/5 · 0%", { exact: true }).waitFor();
      await page.getByText("ドリル対象 14枚", { exact: true }).waitFor();
      await page.getByRole("button", { name: "メニュー", exact: true }).click();
      await page.getByRole("heading", { name: "1回あたりのドリル出題数", exact: true }).waitFor();
      await page.getByRole("button", { name: "10問", exact: true }).click();
      await page.getByText("設定：10問。変更は次の回から反映します。", { exact: true }).waitFor();
      await page.screenshot({ path: resolve(output, `round-settings-${language}-${width}.png`), fullPage: true });
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0);
      await page.getByText("0/5 · 0%", { exact: true }).waitFor();
      for (const id of ids.slice(0, 5)) await answer(page, id, "Bad");
      await current(page, ids[0]);
      await page.getByText("0/5 · 0%", { exact: true }).waitFor();
      await page.reload({ waitUntil: "networkidle" });
      await current(page, ids[0]);
      for (const id of ids.slice(0, 4)) await answer(page, id, "Good");
      await current(page, ids[4]);
      await page.getByText("4/5 · 80%", { exact: true }).waitFor();
      await answer(page, ids[4], "Bad");
      await current(page, ids[4]);
      await page.getByText("4/5 · 80%", { exact: true }).waitFor();
      await page.goto(origin + "/library", { waitUntil: "networkidle" });
      await page.goto(origin + "/drill", { waitUntil: "networkidle" });
      await current(page, ids[4]);
      await page.getByText("4/5 · 80%", { exact: true }).waitFor();
      await answer(page, ids[4], "Perfect");
      await page.getByRole("heading", { name: "今回の5問が完了しました" }).waitFor();
      await page.getByRole("button", { name: "あと7問", exact: true }).click();
      await page.getByText("0/7 · 0%", { exact: true }).waitFor();
      await current(page, ids[5]);
      await page.getByText("ドリル対象 14枚", { exact: true }).waitFor();
      await page.screenshot({ path: resolve(output, `round-${language}-${width}.png`), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(state.errors, []);
      results.push(`${language}/${width}: 5→10 next-round setting, frozen 5, all Bad stays 0%, final Bad stays 80%, tab/reload resume, 7 remaining, total unchanged`);
    } finally { await state.context.close(); }
  }
  const recovery = await setup("en", 390, Array.from({ length: 25 }, (_, index) => `card-${String(index).padStart(2, "0")}`));
  try {
    for (const limit of [10, 20]) {
      await recovery.page.evaluate((limit) => { localStorage.setItem("phrabit-drill-preferences-v1:guest", JSON.stringify({ limit, pendingId: null })); localStorage.removeItem("phrabit-drill-round-v1:guest:en"); }, limit);
      await recovery.page.reload({ waitUntil: "networkidle" });
      await recovery.page.getByText(`0/${limit} · 0%`, { exact: true }).waitFor();
    }
    await recovery.page.evaluate(() => { window.failSrsWrite = true; });
    await answer(recovery.page, "card-00", "Good");
    await recovery.page.getByRole("alert").filter({ hasText: "練習を保存できませんでした" }).waitFor();
    await recovery.page.getByText("0/20 · 0%", { exact: true }).waitFor();
    await recovery.page.evaluate(() => { window.failSrsWrite = false; window.failRoundWrite = true; });
    await answer(recovery.page, "card-00", "Good");
    await current(recovery.page, "card-01");
    await recovery.page.getByRole("alert").filter({ hasText: "中断位置を保存できません" }).waitFor();
    const saved = await snapshot(recovery.page);
    await recovery.page.reload({ waitUntil: "networkidle" });
    await current(recovery.page, "card-01");
    await recovery.page.getByText("1/20 · 5%", { exact: true }).waitFor();
    assert.deepEqual((await snapshot(recovery.page)).items, saved.items);
    const chinesePhrases = Array.from({ length: 3 }, (_, index) => basePhrase(`zh-${index}`, "zh"));
    await recovery.page.evaluate(({ chinesePhrases, chineseItems, phraseKey, srsKey }) => {
      localStorage.setItem(phraseKey, JSON.stringify([...JSON.parse(localStorage.getItem(phraseKey)), ...chinesePhrases]));
      localStorage.setItem(srsKey, JSON.stringify([...JSON.parse(localStorage.getItem(srsKey)), ...chineseItems]));
      window.dispatchEvent(new Event("phrabit-account-phrase-data-synced"));
    }, { chinesePhrases, chineseItems: chinesePhrases.map((phrase) => baseItem(phrase.id)), phraseKey, srsKey });
    await recovery.page.getByRole("button", { name: "中国語", exact: true }).click();
    await recovery.page.getByText("0/3 · 0%", { exact: true }).waitFor();
    await recovery.page.getByText("ドリル対象 3枚", { exact: true }).waitFor();
    await recovery.page.getByRole("button", { name: "メニュー", exact: true }).click();
    assert.equal(await recovery.page.getByRole("button", { name: "20問", exact: true }).getAttribute("aria-pressed"), "true");
    await recovery.page.keyboard.press("Escape");
    await answer(recovery.page, "zh-0", "Bad");
    await current(recovery.page, "zh-1");
    await recovery.page.getByRole("button", { name: "英語", exact: true }).click();
    await current(recovery.page, "card-01");
    await recovery.page.getByText("1/20 · 5%", { exact: true }).waitFor();
    await recovery.page.getByText("ドリル対象 25枚", { exact: true }).waitFor();
    await recovery.page.evaluate(({ srsKey }) => {
      const items = JSON.parse(localStorage.getItem(srsKey));
      const item = items.find((item) => item.id === "card-01");
      item.lastReviewedAt = Date.now(); item.lastScore = 2; item.nextReviewAt = Date.now() + 86400000;
      localStorage.setItem(srsKey, JSON.stringify(items)); window.dispatchEvent(new Event("phrabit-account-phrase-data-synced"));
    }, { srsKey });
    await current(recovery.page, "card-02");
    await recovery.page.getByText("2/20 · 10%", { exact: true }).waitFor();
    await recovery.page.evaluate(({ phraseKey }) => {
      const phrases = JSON.parse(localStorage.getItem(phraseKey)).filter((phrase) => phrase.id !== "card-02");
      localStorage.setItem(phraseKey, JSON.stringify(phrases)); window.dispatchEvent(new Event("phrabit-account-phrase-data-synced"));
    }, { phraseKey });
    await current(recovery.page, "card-03");
    await recovery.page.getByText("2/19 · 11%", { exact: true }).waitFor();
    await recovery.page.getByText("ドリル対象 24枚", { exact: true }).waitFor();
    results.push("10/20 persisted; failed SRS leaves progress unchanged; lost round write recovers from SRS without regrading");
    results.push("shared language preference, independent language rounds/counts, remote Good completes once and remote removal shrinks total without refilling");
  } finally { await recovery.context.close(); }
  for (const [language, width] of [["zh", 360], ["en", 430]]) {
    const ids = [...Array.from({ length: 27 }, (_, index) => `custom-${String(index).padStart(2, "0")}`), "future", "paused", "mastered"];
    const state = await setup(language, width, ids, "/library");
    const { page } = state;
    try {
      await page.getByRole("button", { name: "メニュー", exact: true }).click();
      await page.getByRole("button", { name: "無制限", exact: true }).click();
      await page.getByRole("button", { name: "カスタム", exact: true }).click();
      const input = page.getByLabel("問題数（1〜999問）", { exact: true });
      for (const invalid of ["", "0", "-1", "1.5", "1e2", "1000", "abc"]) {
        await input.fill(invalid);
        await page.getByRole("button", { name: "保存", exact: true }).click();
        await page.getByRole("alert").filter({ hasText: "1〜999の整数を入力してください。" }).waitFor();
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("phrabit-drill-preferences-v1:guest")).limit), 0);
      }
      for (const valid of ["1", "999", "７"]) {
        await input.fill(valid);
        await input.press("Enter");
        const count = valid === "７" ? 7 : Number(valid);
        await page.getByText(`設定：${count}問。変更は次の回から反映します。`, { exact: true }).waitFor();
      }
      await page.screenshot({ path: resolve(output, `menu-custom-${language}-${width}.png`), fullPage: true });
      await page.keyboard.press("Escape");
      await page.goto(origin + "/drill", { waitUntil: "networkidle" });
      await page.getByText("0/7 · 0%", { exact: true }).waitFor();
      await page.getByText("ドリル対象 29枚", { exact: true }).waitFor();
      await page.getByRole("button", { name: "メニュー", exact: true }).click();
      await page.getByRole("button", { name: "無制限", exact: true }).click();
      await page.screenshot({ path: resolve(output, `menu-unlimited-${language}-${width}.png`), fullPage: true });
      await page.keyboard.press("Escape");
      await page.getByText("0/7 · 0%", { exact: true }).waitFor();
      await answer(page, ids[0], "Bad");
      await current(page, ids[1]);
      await page.getByText("0/7 · 0%", { exact: true }).waitFor();
      await page.reload({ waitUntil: "networkidle" });
      await current(page, ids[1]);
      for (const id of [...ids.slice(1, 7), ids[0]]) await answer(page, id, "Good");
      await page.getByRole("heading", { name: "今回の7問が完了しました" }).waitFor();
      await page.getByRole("button", { name: "あと20問", exact: true }).click();
      await page.getByText("0/20 · 0%", { exact: true }).waitFor();
      assert.equal(await page.evaluate((language) => JSON.parse(localStorage.getItem(`phrabit-drill-round-v1:guest:${language}`)).limit, language), 0);
      await answer(page, ids[7], "Bad");
      await current(page, ids[8]);
      await page.reload({ waitUntil: "networkidle" });
      await current(page, ids[8]);
      await page.getByText("0/20 · 0%", { exact: true }).waitFor();
      await page.getByRole("button", { name: "メニュー", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "無制限", exact: true }).getAttribute("aria-pressed"), "true");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(state.errors, []);
      results.push(`${language}/${width}: global menu, custom 1/7/999 + invalid inputs, next-round unlimited, eligible-only total, Bad/reload restore, no overflow`);
    } finally { await state.context.close(); }
  }
  const lateCloud = await setup("zh", 390, []);
  try {
    await lateCloud.page.getByText("まだフレーズがありません", { exact: true }).waitFor();
    const phrase = basePhrase("late-cloud", "zh");
    const item = baseItem(phrase.id);
    await lateCloud.page.evaluate(({ phrase, item, phraseKey, srsKey }) => {
      localStorage.setItem(phraseKey, JSON.stringify([phrase]));
      localStorage.setItem(srsKey, JSON.stringify([item]));
      window.dispatchEvent(new Event("phrabit-account-phrase-data-synced"));
    }, { phrase, item, phraseKey, srsKey });
    await current(lateCloud.page, phrase.id);
    await lateCloud.page.getByText("0/1 · 0%", { exact: true }).waitFor();
    await lateCloud.page.getByText("カード設定", { exact: true }).click();
    await lateCloud.page.getByRole("button", { name: /^ドリルから外す/ }).click();
    await lateCloud.page.evaluate(({ phrase, item, phraseKey, srsKey }) => {
      const phrases = JSON.parse(localStorage.getItem(phraseKey));
      localStorage.setItem(phraseKey, JSON.stringify([...phrases, { ...phrase, id: "another", japanese: "確認用 another" }]));
      localStorage.setItem(srsKey, JSON.stringify([item, { ...item, id: "another" }]));
      window.dispatchEvent(new Event("phrabit-account-phrase-data-synced"));
    }, { phrase, item, phraseKey, srsKey });
    await lateCloud.page.getByRole("heading", { name: "今回の対象カードはありません", exact: true }).waitFor();
    assert.equal(await lateCloud.page.getByText("確認用 another", { exact: true }).count(), 0);
    assert.deepEqual(lateCloud.errors, []);
    results.push("late initial sync starts an empty round, but removing all selected cards does not refill it");
  } finally { await lateCloud.context.close(); }
  const sample = await setup("zh", 390, []);
  try {
    await sample.page.getByRole("button", { name: "サンプルで試す", exact: true }).click();
    await sample.page.getByRole("button", { name: "メニュー", exact: true }).click();
    await sample.page.getByRole("button", { name: "無制限", exact: true }).click();
    await sample.page.keyboard.press("Escape");
    await sample.page.getByText("0/2 · 0%", { exact: true }).waitFor();
    results.push("sample has global menu settings but remains two cards and does not create a normal round");
  } finally { await sample.context.close(); }
  writeFileSync(resolve(output, "browser-results.json"), JSON.stringify({ results, paidApiCalls: 0, productionChanges: 0, externalRequestsBlocked: true }, null, 2));
  console.log(results.map((result) => `PASS ${result}`).join("\n"));
} finally { await browser.close(); }
