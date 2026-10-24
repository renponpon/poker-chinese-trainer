import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const origin = process.env.PHRABIT_TEST_ORIGIN || "http://127.0.0.1:3034";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const output = resolve("../release-artifacts/20261024-once-practice");
mkdirSync(output, { recursive: true });
const phraseKey = "poker-chinese-local-phrases-v1";
const srsKey = "poker-chinese-srs-v1";
const results = [];
const browser = await chromium.launch({ headless: true, executablePath: [chromium.executablePath(), "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync) });

async function setup(language, width, experience = false, conversation = false) {
  const context = await browser.newContext({ viewport: { width, height: 850 }, serviceWorkers: "block" });
  const events = [];
  const errors = [];
  const controls = { delaySync: false, failSync: false, tracked: true, syncCalls: 0, generationCalls: 0 };
  const gate = Promise.withResolvers();
  await context.addInitScript((language) => {
    if (!localStorage.getItem("once-test-initialized")) {
      localStorage.setItem("phrabit-learning-language-v1", language);
      localStorage.setItem("phrabit:add-tutorial-seen", "1");
      localStorage.setItem("once-test-initialized", "1");
    }
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (window.failSrsWrite && key === "poker-chinese-srs-v1") throw new DOMException("test-only storage failure", "QuotaExceededError");
      return original.call(this, key, value);
    };
  }, language);
  const sourceText = "部屋の掃除をお願いできますか。";
  const targetText = language === "zh" ? "请帮我打扫一下房间。" : "Could you clean my room, please?";
  const phrase = {
    direction: `ja-to-${language}`, sourceLanguage: "ja", targetLanguage: language,
    sourceText, targetText, japanese: sourceText, chinese: targetText,
    reading: language === "zh" ? "qǐng bāng wǒ dǎ sǎo yí xià fáng jiān" : "",
    pinyin: language === "zh" ? "qǐng bāng wǒ dǎ sǎo yí xià fáng jiān" : "",
    readingType: language === "zh" ? "pinyin" : "none", explanation: "検証用の固定解説です。",
  };
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/analytics/event") {
      const event = route.request().postDataJSON();
      const snapshots = await page.evaluate(({ phraseKey, srsKey }) => ({ phrases: JSON.parse(localStorage.getItem(phraseKey) || "[]"), items: JSON.parse(localStorage.getItem(srsKey) || "[]") }), { phraseKey, srsKey });
      events.push({ ...event, snapshots });
      return route.fulfill({ json: { ok: true, tracked: controls.tracked } });
    }
    if (url.pathname === "/api/phrase/add") {
      const payload = route.request().postDataJSON();
      if (payload.warmup) return route.fulfill({ json: { ok: true } });
      controls.generationCalls += 1;
      return route.fulfill({ json: { ...phrase, id: payload.phraseId, provider: "gemini" } });
    }
    if (url.pathname === "/api/phrase/from-experience") {
      controls.generationCalls += 1;
      return route.fulfill({ json: { status: "ready", phrase, mock: false } });
    }
    if (url.pathname === "/api/phrase/save-pack") {
      controls.syncCalls += 1;
      if (controls.delaySync) await gate.promise;
      return route.fulfill({ status: controls.failSync ? 503 : 200, json: controls.failSync ? { error: "test sync failure" } : { ok: true } });
    }
    if (/speech|tts/.test(url.pathname)) return route.fulfill({ status: 503, json: { error: "offline test" } });
    if (url.pathname === "/api/phrase/explain") return route.fulfill({ json: { explanation: phrase.explanation } });
    return route.fulfill({ json: { ok: true } });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + (conversation ? "/conversation" : experience ? "/add/experience" : "/"), { waitUntil: "networkidle", timeout: 120000 });
  if (experience) {
    await page.getByRole("textbox", { name: "何がありましたか？", exact: true }).fill("ホテルで部屋の清掃をお願いしたかった");
    await page.getByRole("button", { name: "一言を作る", exact: true }).click();
  } else {
    await page.getByPlaceholder("日本語を入力", { exact: true }).fill(sourceText);
    await page.getByRole("button", { name: "送信", exact: true }).click();
  }
  await page.getByRole("button", { name: "ドリルに追加", exact: true }).waitFor();
  return { context, page, events, errors, controls, gate };
}

async function waitUntil(predicate, message) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((finish) => setTimeout(finish, 40));
  }
  assert.fail(message);
}

async function saveAndEnter(state) {
  await state.page.getByRole("button", { name: "ドリルに追加", exact: true }).click();
  const link = state.page.getByRole("link", { name: "この一言を1回練習", exact: true });
  await link.waitFor();
  const href = await link.getAttribute("href");
  assert.equal(new URL(href, origin).searchParams.get("practice"), "once");
  await link.click();
  await state.page.getByRole("heading", { name: "この一言を1回練習", exact: true }).waitFor();
  return href;
}

async function answer(page, score, double = false) {
  await page.getByText("タップして確認", { exact: true }).click();
  const button = page.getByRole("button", { name: new RegExp(["", "Bad", "Good", "Perfect"][score]) });
  if (double) await button.evaluate((element) => { element.click(); element.click(); });
  else await button.click();
}

async function readSrs(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), srsKey);
}

try {
  for (const [language, widths] of [["zh", [344, 390, 768]], ["en", [360, 430, 1280]]]) {
    for (const score of [1, 2, 3]) {
      const state = await setup(language, widths[score - 1], score === 3);
      try {
        await saveAndEnter(state);
        await answer(state.page, score, score === 2);
        await state.page.getByRole("heading", { name: "1回練習しました", exact: true }).waitFor();
        assert.equal(await state.page.evaluate(() => document.activeElement?.id), "once-practice-title");
        await waitUntil(() => state.events.some((event) => event.eventName === "drill_answer"), "answer event");
        const answers = state.events.filter((event) => event.eventName === "drill_answer");
        assert.equal(answers.length, 1);
        assert.equal(answers[0].success, true);
        assert.equal(answers[0].snapshots.items[0].lastScore, score, "persist before event");
        const items = await readSrs(state.page);
        assert.equal(items.length, 1);
        assert.equal(items[0].lastScore, score);
        assert.notEqual(items[0].status, "mastered");
        if (score === 1) {
          assert.equal(items[0].consecutiveGood, 0);
          assert.ok(Math.abs(items[0].nextReviewAt - items[0].lastReviewedAt - 600000) < 1000);
        }
        await state.page.evaluate(() => window.dispatchEvent(new Event("phrabit-account-phrase-data-synced")));
        await state.page.waitForTimeout(200);
        assert.equal(await state.page.getByRole("heading", { name: "1回練習しました", exact: true }).isVisible(), true);
        assert.equal(await state.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await state.page.screenshot({ path: resolve(output, `complete-${language}-${widths[score - 1]}.png`) });
        if (score === 1) {
          await state.page.getByRole("button", { name: "もう1回", exact: true }).click();
          await answer(state.page, 2);
          await state.page.getByRole("heading", { name: "1回練習しました", exact: true }).waitFor();
          await waitUntil(() => state.events.filter((event) => event.eventName === "drill_answer").length === 2, "explicit repeat counted once");
        }
        assert.equal(state.controls.generationCalls, 1, "no generation for practice");
        await state.page.getByRole("link", { name: "翻訳へ戻る", exact: true }).click();
        await state.page.getByPlaceholder("日本語を入力", { exact: true }).waitFor();
        assert.deepEqual(state.errors, []);
        results.push(`${language}/${widths[score - 1]}px/${score}: save→one answer, SRS, no duplicate, sync update, return`);
      } finally { state.gate.resolve(); await state.context.close(); }
    }
  }

  const state = await setup("zh", 430);
  try {
    state.controls.delaySync = true;
    state.controls.failSync = true;
    await state.page.getByRole("button", { name: "ドリルに追加", exact: true }).evaluate((element) => { element.click(); element.click(); });
    await waitUntil(() => state.events.some((event) => event.eventName === "translation_drill_save"), "save event before sync response");
    const saveEvent = state.events.find((event) => event.eventName === "translation_drill_save");
    assert.equal(saveEvent.success, true);
    assert.equal(saveEvent.snapshots.phrases.length, 1);
    assert.equal(saveEvent.snapshots.items.length, 1);
    state.gate.resolve();
    await state.page.getByText("この端末のドリルには追加しましたが、クラウド同期に失敗しました。", { exact: true }).waitFor();
    assert.equal(state.events.filter((event) => event.eventName === "translation_drill_save").length, 1);
    assert.equal(state.controls.syncCalls, 1);
    await state.page.getByRole("link", { name: "この一言を1回練習", exact: true }).click();
    await state.page.getByText("タップして確認", { exact: true }).waitFor();
    const before = await readSrs(state.page);
    await state.page.evaluate(() => { window.failSrsWrite = true; });
    await answer(state.page, 2, true);
    await state.page.getByRole("alert").getByText("練習を保存できませんでした。もう一度お試しください。", { exact: true }).waitFor();
    await waitUntil(() => state.events.some((event) => event.eventName === "drill_answer"), "failed event");
    assert.deepEqual(await readSrs(state.page), before);
    assert.equal(state.events.filter((event) => event.eventName === "drill_answer" && event.success).length, 0);
    assert.equal(state.events.filter((event) => event.eventName === "drill_answer").length, 1);
    assert.equal(await state.page.getByRole("heading", { name: "1回練習しました" }).count(), 0);
    await state.page.waitForTimeout(600);
    await state.page.screenshot({ path: resolve(output, "storage-failure.png") });
    await state.page.evaluate(() => { window.failSrsWrite = false; });
    state.controls.tracked = false;
    await answer(state.page, 1);
    await state.page.getByRole("heading", { name: "1回練習しました", exact: true }).waitFor();
    const savedItems = await readSrs(state.page);
    assert.equal(savedItems[0].lastScore, 1);
    const phraseId = savedItems[0].id;
    for (const query of ["practice=once", "phrases=missing&practice=once", `phrases=${phraseId},missing&practice=once`]) {
      await state.page.goto(`${origin}/drill?${query}`);
      await state.page.getByRole("heading", { name: "この一言を練習できません", exact: true }).waitFor();
      assert.equal(await state.page.getByText("タップして確認", { exact: true }).count(), 0);
    }
    await state.page.goto(`${origin}/drill?phrases=${phraseId}&practice=once`);
    await state.page.getByText("タップして確認", { exact: true }).waitFor();
    await state.page.getByRole("button", { name: "英語", exact: true }).click();
    await state.page.getByRole("heading", { name: "この一言を練習できません", exact: true }).waitFor();
    await state.page.getByRole("button", { name: "中国語", exact: true }).click();
    await state.page.getByText("タップして確認", { exact: true }).waitFor();
    await state.page.evaluate(() => {
      localStorage.setItem("phrabit-account-cache-owner-v1", "test-other-owner");
      localStorage.setItem("poker-chinese-local-phrases-v1", "[]");
      localStorage.setItem("poker-chinese-srs-v1", "[]");
      window.dispatchEvent(new Event("phrabit-local-data-changed"));
    });
    await state.page.getByRole("heading", { name: "この一言を練習できません", exact: true }).waitFor();
    assert.deepEqual(await readSrs(state.page), []);
    assert.deepEqual(state.errors, []);
    results.push("slow/failed cloud sync, save/answer double-click, local failure→retry, untracked analytics, invalid/missing/multi ID, language/owner change");
  } finally { state.gate.resolve(); await state.context.close(); }

  const failedSave = await setup("en", 360);
  try {
    await failedSave.page.evaluate(() => { window.failSrsWrite = true; });
    await failedSave.page.getByRole("button", { name: "ドリルに追加", exact: true }).click();
    await waitUntil(() => failedSave.events.some((event) => event.eventName === "translation_drill_save"), "failed translation save");
    assert.equal(failedSave.events.find((event) => event.eventName === "translation_drill_save").success, false);
    assert.equal(await failedSave.page.getByRole("link", { name: "この一言を1回練習" }).count(), 0);
    await failedSave.page.evaluate(() => { window.failSrsWrite = false; });
    await saveAndEnter(failedSave);
    assert.equal((await readSrs(failedSave.page)).length, 1);
    assert.equal(failedSave.controls.generationCalls, 1);
    assert.deepEqual(failedSave.errors, []);
    results.push("failed translation save has no success event/CTA; retry adds same phrase once");
  } finally { await failedSave.context.close(); }

  for (const routeType of ["normal", "focused", "multiple"]) {
    const normal = await setup("en", 390);
    try {
      const onceUrl = await saveAndEnter(normal);
      const phraseId = new URL(onceUrl, origin).searchParams.get("phrases");
      await normal.page.evaluate(({ phraseKey, srsKey }) => {
        const phrases = JSON.parse(localStorage.getItem(phraseKey));
        localStorage.setItem(phraseKey, JSON.stringify([...phrases, { ...phrases[0], id: "unrelated-phrase", japanese: "別の一言", sourceText: "別の一言" }]));
        const items = JSON.parse(localStorage.getItem(srsKey));
        localStorage.setItem(srsKey, JSON.stringify([...items, { ...items[0], id: "unrelated-phrase" }]));
        window.dispatchEvent(new Event("phrabit-account-phrase-data-synced"));
      }, { phraseKey, srsKey });
      await normal.page.waitForTimeout(200);
      assert.equal(await normal.page.getByText("0/1 · 0%", { exact: true }).isVisible(), true, "once excludes unrelated due phrases");
      const query = routeType === "normal" ? "" : `?phrases=${phraseId}${routeType === "multiple" ? ",unrelated-phrase" : ""}`;
      await normal.page.goto(origin + "/drill" + query);
      const count = routeType === "focused" ? 1 : 2;
      await normal.page.getByText(`0/${count} · 0%`, { exact: true }).waitFor();
      await answer(normal.page, 1);
      await waitUntil(() => normal.events.some((event) => event.eventName === "drill_answer"), "normal Bad persists");
      await normal.page.evaluate(() => window.dispatchEvent(new Event("phrabit-account-phrase-data-synced")));
      await normal.page.waitForTimeout(300);
      assert.equal(await normal.page.getByText(`0/${count} · 0%`, { exact: true }).isVisible(), true);
      await answer(normal.page, 2);
      if (count === 2) {
        await normal.page.getByText("1/2 · 50%", { exact: true }).waitFor();
        await answer(normal.page, 3);
      }
      await normal.page.getByText(routeType === "normal" ? "今日のドリル完了" : "追加した一言の練習完了", { exact: true }).waitFor();
      assert.equal(await normal.page.getByRole("heading", { name: "1回練習しました" }).count(), 0);
      if (routeType !== "normal") {
        await normal.page.getByRole("link", { name: "通常のドリルへ", exact: true }).click();
        await normal.page.getByText(routeType === "focused" ? "0/1 · 0%" : "今日のドリル完了", { exact: true }).waitFor();
      }
      assert.deepEqual(normal.errors, []);
      results.push(`${routeType}: Bad requeue + background sync + full completion retained; once ignores unrelated due items`);
    } finally { await normal.context.close(); }
  }

  const conversation = await setup("en", 430, false, true);
  try {
    conversation.controls.delaySync = true;
    conversation.controls.failSync = true;
    await conversation.page.getByRole("button", { name: "ドリルに追加", exact: true }).click();
    await conversation.page.getByText("部屋の掃除をお願いできますか。", { exact: true }).click();
    await conversation.page.getByRole("button", { name: "ドリルに追加", exact: true }).last().click();
    await waitUntil(() => conversation.events.some((event) => event.eventName === "conversation_drill_save"), "conversation event before sync");
    assert.equal(conversation.events.find((event) => event.eventName === "conversation_drill_save").success, true);
    conversation.gate.resolve();
    await conversation.page.getByText("端末には追加しました。未同期のデータは通信回復後に再試行します。", { exact: true }).waitFor();
    assert.equal(conversation.events.filter((event) => event.eventName === "conversation_drill_save").length, 1);
    const link = conversation.page.getByRole("link", { name: "追加した一言を練習", exact: true });
    assert.equal(new URL(await link.getAttribute("href"), origin).searchParams.has("practice"), false);
    await link.click();
    await answer(conversation.page, 1);
    await waitUntil(() => conversation.events.some((event) => event.eventName === "drill_answer"), "conversation Bad persists");
    assert.equal(await conversation.page.getByText("0/1 · 0%", { exact: true }).isVisible(), true);
    assert.deepEqual(conversation.errors, []);
    results.push("conversation: local success before slow/failed sync counted once; existing practice mode unchanged");
  } finally { conversation.gate.resolve(); await conversation.context.close(); }
  writeFileSync(resolve(output, "browser-results.json"), JSON.stringify({ results, paidApiCalls: 0, productionChanges: 0, externalRequestsBlocked: true }, null, 2));
  console.log(results.map((result) => `PASS ${result}`).join("\n"));
} finally { await browser.close(); }
