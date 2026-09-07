import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const origin = process.env.PHRABIT_TEST_ORIGIN || "http://localhost:3010";
const executablePath = [
  chromium.executablePath(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((candidate) => existsSync(candidate));
const browser = await chromium.launch({ executablePath, headless: true });
const screenshotDir = resolve("tmp/phrabit-responsive-shots/translation-flow");
mkdirSync(screenshotDir, { recursive: true });

try {
  await checkFlow("zh", 360, false);
  await checkFlow("zh", 390, false);
  await checkFlow("en", 430, true);
} finally {
  await browser.close();
}

async function checkFlow(language, width, failCloudSave) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addInitScript(() => {
    window.testSpeechCalls = [];
    window.SpeechSynthesisUtterance = class {
      constructor(text) { this.text = text; }
    };
    Object.defineProperty(window, "speechSynthesis", { value: {
      getVoices: () => ["zh-CN", "en-US", "ja-JP"].map((lang) => ({ lang, name: lang, localService: true })),
      cancel: () => {},
      resume: () => {},
      addEventListener: () => {},
      speak: (utterance) => {
        window.testSpeechCalls.push({ text: utterance.text, lang: utterance.lang });
        utterance.onstart?.();
      },
    } });
  });
  const page = await context.newPage();
  const translationRequests = [];
  const saves = [];
  const analyticsEvents = [];
  const errors = [];
  let releaseRefinement;
  let rejectRefinement = false;
  const refinementGate = new Promise((resolveGate) => {
    releaseRefinement = resolveGate;
  });
  const originalText = language === "zh" ? "安静一下" : "Please be quiet.";
  const refinedText = language === "zh" ? "安静点！" : "Be quiet!";
  page.on("pageerror", (error) => errors.push(error.message));

  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const payload = route.request().postDataJSON();
    if (url.pathname === "/api/analytics/event") {
      analyticsEvents.push(payload);
      return route.fulfill({ json: { ok: true, tracked: true } });
    }
    if (url.pathname === "/api/phrase/add" && !payload?.warmup) {
      translationRequests.push(payload);
      if (payload.nuance) {
        if (rejectRefinement) {
          return route.fulfill({ status: 500, json: { error: "調整テストエラー" } });
        }
        await refinementGate;
      }
      const targetText = payload.nuance ? refinedText : originalText;
      return route.fulfill({
        json: {
          id: payload.phraseId,
          direction: payload.direction,
          sourceLanguage: "ja",
          targetLanguage: language,
          sourceText: payload.text,
          targetText,
          japanese: payload.text,
          chinese: language === "zh" ? targetText : "",
          pinyin: language === "zh" ? "ān jìng" : "",
          reading: language === "zh" ? "ān jìng" : "",
          readingType: language === "zh" ? "pinyin" : "none",
          explanation: payload.nuance ? "調整後の解説（テスト応答）" : "",
          provider: payload.nuance ? "gemini" : "deepl",
        },
      });
    }
    if (url.pathname === "/api/phrase/explain") {
      return route.fulfill({ json: { explanation: "元の解説（テスト応答）" } });
    }
    if (url.pathname === "/api/phrase/save-pack") {
      saves.push(payload);
      return route.fulfill({
        status: failCloudSave ? 500 : 200,
        json: failCloudSave ? { error: "同期テストエラー" } : { ok: true },
      });
    }
    return route.fulfill({ json: { ok: true } });
  });

  try {
    await page.goto(origin);
    await page.getByRole("button", { name: "メニュー", exact: true }).click();
    await page.getByText("入力データについて", { exact: true }).click();
    assert.ok(await page.getByText(/翻訳しただけではライブラリやドリルに追加されません/).isVisible());
    assert.ok(await page.getByText(/ゲストの保存データは、このブラウザ内だけにあります/).isVisible());
    await page.getByRole("button", { name: "使い方を見る", exact: true }).click();
    const tutorial = page.getByRole("dialog", { name: "使い方", exact: true });
    await tutorial.waitFor({ state: "visible" });
    assert.ok(await tutorial.getByText(/翻訳しただけでは保存されません/).isVisible());
    for (let step = 0; step < 4; step += 1) {
      await tutorial.getByRole("button", { name: "次へ", exact: true }).click();
      const bounds = await tutorial.boundingBox();
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 900);
      if (step === 2) {
        assert.ok(await tutorial.getByText(/覚えたい訳になったら「ドリルに追加」/).isVisible());
        await page.screenshot({ path: resolve(screenshotDir, `tutorial-${language}-${width}.png`) });
      }
    }
    await tutorial.getByRole("button", { name: "完了", exact: true }).click();
    assert.equal(await page.getByText("現地で訳したフレーズを、次は自分の言葉に。", { exact: true }).count(), 0);
    await page.getByRole("combobox", { name: "翻訳先言語" }).selectOption(language);
    await page.getByRole("button", { name: "翻訳モード: 通常。タップで切り替え", exact: true }).click();
    await page.getByRole("button", { name: "翻訳モード: 品質。タップで切り替え", exact: true }).click();
    assert.ok(await page.getByRole("button", { name: "翻訳モード: 通常。タップで切り替え", exact: true }).isVisible());
    assert.equal(await page.getByRole("button", { name: /翻訳モード: 速度/ }).count(), 0);
    await page.getByPlaceholder("日本語を入力", { exact: true }).fill("静かにして");
    const sendButton = page.getByRole("button", { name: "送信", exact: true });
    await sendButton.click();
    await page.getByText(originalText, { exact: true }).waitFor();
    await page.getByText("元の解説（テスト応答）", { exact: true }).waitFor();
    const resultMetadata = page.getByText(/日本語\s*→\s*(中国語|英語)\s*\/|\/\s*(未追加|ドリル追加済み)|Gemini品質|DeepL翻訳/);
    assert.equal(await resultMetadata.count(), 0, "翻訳結果に言語方向・追加状態・生成元を表示しない");
    assert.equal(await page.locator("details").evaluate((details) => details.open), true, "解説は最初から表示する");
    assert.deepEqual(await page.evaluate(() => window.testSpeechCalls), [], "初回翻訳の音声動作は変更しない");
    assert.equal(saves.length, 0, "翻訳時はクラウド保存しない");
    assert.equal((await savedPhrases(page)).length, 0, "翻訳時はライブラリに追加しない");
    assert.equal(translationRequests[0].persist, false);
    assert.equal(translationRequests[0].generationMode, "normal");
    assert.equal(translationRequests[0].shouldDrill, false);

    const adjustmentButton = page.getByRole("button", { name: "調整", exact: true });
    const dialog = page.getByRole("dialog", { name: "ニュアンスを調整", exact: true });
    const nuanceInput = page.getByRole("textbox", { name: "ニュアンスを調整", exact: true });
    assert.equal(await dialog.isVisible(), false, "入力欄は通常画面の場所を取らない");
    assert.equal(await nuanceInput.isVisible(), false);
    const adjustmentBox = await adjustmentButton.boundingBox();
    const playbackBox = await page.getByRole("button", { name: "再生", exact: true }).boundingBox();
    assert.ok(Math.abs(adjustmentBox.y - playbackBox.y) < 2, "調整は再生と同じ行");
    assert.ok(adjustmentBox.x + adjustmentBox.width <= playbackBox.x, "調整は再生のすぐ左");
    const translationBox = await page.getByText(originalText, { exact: true }).boundingBox();
    const drillButtonBox = await page.getByRole("button", { name: "ドリルに追加", exact: true }).boundingBox();
    assert.ok(translationBox.width > width - 100, "翻訳文はボタンの横に圧縮せずカード幅を使う");
    assert.ok(translationBox.y >= playbackBox.y + playbackBox.height, "訳文は調整/再生の下");
    assert.ok(drillButtonBox.y >= translationBox.y + translationBox.height, "追加操作は訳文の下");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve(screenshotDir, `${language}-${width}-compact.png`), fullPage: true });
    const nuance = "もっと命令っぽくして。罵倒しないで";
    await page.getByText("使い方・想定返答", { exact: true }).click();
    await adjustmentButton.click();
    await dialog.waitFor();
    assert.equal(await nuanceInput.evaluate((input) => input === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
    assert.equal(await page.getByRole("button", { name: "このニュアンスで作り直す" }).isDisabled(), true);
    await nuanceInput.fill(nuance);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true, "フォーカスはポップアップ内に留まる");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await adjustmentButton.evaluate((button) => button === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    await adjustmentButton.click();
    assert.equal(await nuanceInput.inputValue(), nuance, "閉じても補足文を残す");
    await page.setViewportSize({ width, height: 480 });
    const dialogBox = await dialog.boundingBox();
    assert.ok(dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= width);
    assert.ok(dialogBox.y >= 0 && dialogBox.y + dialogBox.height <= 480, "低い画面にも収まる");
    await page.screenshot({ path: resolve(screenshotDir, `${language}-${width}-nuance.png`) });
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "このニュアンスで作り直す" }).click();
    await page.getByRole("button", { name: "ニュアンスを反映中..." }).waitFor();
    assert.equal(await page.getByRole("button", { name: "送信", exact: true, includeHidden: true }).isDisabled(), true, "再調整中の別送信を防ぐ");
    assert.equal(await page.getByRole("button", { name: "ドリルに追加", exact: true, includeHidden: true }).isDisabled(), true);
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "調整中...", exact: true }).click();
    await dialog.waitFor();
    assert.equal(translationRequests.length, 2, "再生成中に開き直しても二重送信しない");
    releaseRefinement();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    await page.getByText(refinedText, { exact: true }).waitFor();
    await page.getByText("調整後の解説（テスト応答）", { exact: true }).waitFor();
    assert.equal(await resultMetadata.count(), 0, "ニュアンス再生成後もメタ情報を表示しない");
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => window.testSpeechCalls), [], "再生成成功時も自動では再生しない");
    await page.getByRole("button", { name: "再生", exact: true }).click();
    await page.waitForFunction(() => window.testSpeechCalls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.testSpeechCalls), [{ text: refinedText, lang: language === "zh" ? "zh-CN" : "en-US" }]);
    await page.getByRole("button", { name: "停止", exact: true }).click();
    await page.getByRole("button", { name: "再生", exact: true }).waitFor();
    assert.equal(translationRequests[1].text, "静かにして");
    assert.equal(translationRequests[1].previousTargetText, originalText);
    assert.equal(translationRequests[1].nuance, nuance);
    assert.equal(translationRequests[1].persist, false);
    assert.equal(translationRequests[1].generationMode, "quality");
    assert.equal((await savedPhrases(page)).length, 0, "再調整しても未追加のまま");

    await page.getByRole("link", { name: "保存", exact: true }).click();
    await page.getByRole("link", { name: "翻訳", exact: true }).click();
    await page.getByText(refinedText, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.testSpeechCalls.length), 1, "画面復帰で再生しない");
    rejectRefinement = true;
    await adjustmentButton.click();
    await nuanceInput.fill("別の調整");
    await page.getByRole("button", { name: "このニュアンスで作り直す" }).click();
    await page.getByText("調整テストエラー", { exact: true }).waitFor();
    assert.equal(await dialog.isVisible(), true, "失敗時はポップアップで再試行できる");
    assert.equal(await nuanceInput.inputValue(), "別の調整");
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.testSpeechCalls.length), 1, "調整失敗で再生しない");
    assert.equal(await page.getByText(refinedText, { exact: true }).isVisible(), true, "失敗時は直前の訳を残す");
    const analyticsResponse = page.waitForResponse((response) => response.url().endsWith("/api/analytics/event") && response.request().postDataJSON()?.eventName === "translation_drill_save");
    const cloudResponse = page.waitForResponse((response) => response.url().endsWith("/api/phrase/save-pack"));
    await page.getByRole("button", { name: "ドリルに追加", exact: true }).click();
    await cloudResponse;
    await analyticsResponse;
    const savedEvent = analyticsEvents.find((event) => event.eventName === "translation_drill_save");
    assert.equal(savedEvent.success, true, "端末への追加成功とクラウド同期失敗を混同しない");
    assert.equal(savedEvent.errorCode, failCloudSave ? "sync_failed" : null);
    if (failCloudSave) {
      await page.getByText("この端末のドリルには追加しましたが、クラウド同期に失敗しました。", { exact: true }).waitFor();
    }
    await page.getByRole("link", { name: "追加した一言を練習", exact: true }).waitFor();
    assert.equal(await resultMetadata.count(), 0, "追加後もメタ情報を表示しない");
    assert.equal(await page.getByRole("status").getByText("端末のドリルに追加済みです。解説の生成中でも練習できます。", { exact: true }).isVisible(), true, "保存完了の案内は維持する");
    assert.equal(await adjustmentButton.count(), 0, "追加済みの一言の調整可否は変更しない");
    const phrases = await savedPhrases(page);
    assert.equal(phrases.length, 1);
    assert.equal(phrases[0].targetText, refinedText);
    assert.equal(phrases[0].explanation, "調整後の解説（テスト応答）");
    assert.equal(phrases[0].shouldDrill, true);
    assert.equal(saves.length, 1, "明示追加時に一度だけ保存要求");
    assert.equal(saves[0].phrases[0].targetText, refinedText);
    assert.equal(await page.evaluate((phraseId) => {
      const items = JSON.parse(localStorage.getItem("poker-chinese-srs-v1") ?? "[]");
      return items.filter((item) => item.id === phraseId).length;
    }, phrases[0].id), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "横はみ出しなし");
    assert.deepEqual(errors, []);
    await page.screenshot({ path: resolve(screenshotDir, `${language}-${width}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => window.testSpeechCalls.length), 1, "保存や再描画で重複再生しない");
    console.log(`PASS ${language}/${width}px: compact actions, nuance dialog/focus/scroll/retained input, success close/error retry, no autoplay, manual speech/stop, explicit save, SRS, ${failCloudSave ? "cloud failure" : "cloud request"}, layout`);
  } finally {
    releaseRefinement();
    await context.close();
  }
}

async function savedPhrases(page) {
  return page.evaluate(() => {
    const phrases = JSON.parse(localStorage.getItem("poker-chinese-local-phrases-v1") ?? "[]");
    return phrases.filter((phrase) => phrase.sourceText === "静かにして");
  });
}
