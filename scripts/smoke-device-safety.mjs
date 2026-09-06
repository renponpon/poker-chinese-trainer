import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const origin = "http://localhost:3010";
const phraseKey = "poker-chinese-local-phrases-v1";
const backupKey = "phrabit-before-sync-upgrade-20260906-v1";
const rawOriginal = ' [ { "id": "device-safety-test", "japanese": "元のフレーズ", "chinese": "原来的短语", "shouldDrill": false } ] ';
const shots = resolve("tmp/phrabit-responsive-shots/device-safety");
mkdirSync(shots, { recursive: true });
const executablePath = [chromium.executablePath(), "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });

async function setup(width, denyBackup = false) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const calls = [];
  const errors = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    calls.push(url.pathname);
    return route.fulfill({ json: { ok: true, phrases: [], srsItems: [] } });
  });
  await context.addInitScript(({ phraseKey, backupKey, rawOriginal, denyBackup }) => {
    if (location.origin !== "http://localhost:3010") return;
    if (!sessionStorage.getItem("safety-seeded")) {
      localStorage.setItem(phraseKey, rawOriginal);
      localStorage.setItem("auth-secret-test-only", "not-for-export");
      localStorage.setItem("phrabit:add-tutorial-seen", "1");
      sessionStorage.setItem("safety-seeded", "1");
    }
    if (denyBackup) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === backupKey) throw new DOMException("quota", "QuotaExceededError");
        return original.call(this, key, value);
      };
    }
  }, { phraseKey, backupKey, rawOriginal, denyBackup });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, calls, errors };
}

try {
  for (const width of [390, 430]) {
    const { context, page, calls, errors } = await setup(width);
    try {
      await page.goto(origin + "/data-safety");
      await page.getByRole("button", { name: "現在の端末データをダウンロード" }).waitFor();
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), backupKey), null);
      assert.deepEqual(calls, []);
      await page.getByRole("link", { name: "通常画面へ戻る" }).click();
      await page.getByPlaceholder("日本語を入力").waitFor();
      const original = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), backupKey);
      assert.equal(new Map(original.entries).get(phraseKey), rawOriginal);
      assert.equal(original.entries.some(([key]) => key === "auth-secret-test-only"), false);
      await page.evaluate((key) => localStorage.setItem(key, "[]"), phraseKey);
      await page.goto(origin + "/data-safety");
      await page.getByRole("button", { name: "更新前データをダウンロード" }).waitFor();
      calls.length = 0;
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", { name: "更新前データをダウンロード" }).click();
      const download = await downloaded;
      const data = JSON.parse(readFileSync(await download.path(), "utf8"));
      assert.deepEqual(data, original);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: resolve(shots, `backup-${width}.png`), fullPage: true });
      await page.getByText("問題が起きた場合だけ：端末を復元する", { exact: true }).click();
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "更新前データを端末へ復元（同期停止）" }).click();
      await page.getByRole("button", { name: "復元直前データをダウンロード" }).waitFor();
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), phraseKey), rawOriginal);
      assert.equal(await page.evaluate(() => localStorage.getItem("auth-secret-test-only")), "not-for-export");
      assert.deepEqual(calls, []);
      await page.goto(origin);
      await page.getByRole("heading", { name: "データを保護するため処理を停止しました" }).waitFor();
      await page.reload();
      await page.getByRole("heading", { name: "データを保護するため処理を停止しました" }).waitFor();
      assert.deepEqual(calls, []);
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: pre-update backup, private download, restore/rescue, persistent sync stop, no recovery API requests`);
    } finally { await context.close(); }
  }
  const { context, page, calls, errors } = await setup(390, true);
  try {
    await page.goto(origin);
    await page.getByRole("heading", { name: "データを保護するため処理を停止しました" }).waitFor();
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), phraseKey), rawOriginal);
    assert.deepEqual(calls, []);
    await page.getByRole("link", { name: "バックアップ・復旧を開く" }).click();
    await page.getByRole("button", { name: "現在の端末データをダウンロード" }).waitFor();
    assert.deepEqual(calls, []);
    assert.deepEqual(errors, []);
    console.log("PASS: quota failure blocks app before migration or API requests; recovery/download page remains accessible");
  } finally { await context.close(); }
} finally { await browser.close(); }
