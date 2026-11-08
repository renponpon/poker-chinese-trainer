import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const origin = "http://127.0.0.1:3058";
const account = "layout-test-account-with-a-long-name";
const browser = await chromium.launch({ headless: true, executablePath: [chromium.executablePath(), "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync) });
try {
  for (const [width, signedIn] of [[320, true], [390, false], [430, true], [1280, true]]) {
    const context = await browser.newContext({ viewport: { width, height: 820 }, serviceWorkers: "block" });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      let fail = false;
      const gate = Promise.withResolvers(), started = Promise.withResolvers();
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith("/api/")) return route.continue();
        if (url.pathname === "/api/phrases") {
          started.resolve();
          await gate.promise;
          if (fail) return route.fulfill({ status: 503, json: { error: "simulated offline" } });
        }
        return route.fulfill({ json: { ok: true, tracked: true, phrases: [], srsItems: [] } });
      });
      await context.addInitScript(({ signedIn, account }) => {
        localStorage.setItem("phrabit:add-tutorial-seen", "1");
        if (!signedIn) return;
        const user = { id: "10000000-0000-4000-8000-000000000001", aud: "authenticated", email: account + "@example.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
        const expires = Math.floor(Date.now() / 1000) + 3600;
        const token = [btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })), btoa(JSON.stringify({ sub: user.id, exp: expires, iat: expires - 3600 })), "fixture"].join(".");
        localStorage.setItem("sb-127-auth-token", JSON.stringify({ user, access_token: token, refresh_token: "fixture", token_type: "bearer", expires_in: 3600, expires_at: expires }));
      }, { signedIn, account });

      await page.goto(origin, { waitUntil: "domcontentloaded" });
      const login = page.locator("header [data-tutorial='login']");
      await login.getByText(signedIn ? account : "ログイン", { exact: true }).waitFor();
      if (signedIn) await Promise.race([started.promise, page.waitForTimeout(8000).then(() => { throw Error("mock sync never started"); })]);
      const header = await page.locator("header").elementHandle();
      const measure = () => page.evaluate(header => {
        if (header !== document.querySelector("header")) throw Error("header was remounted");
        if (document.querySelectorAll("header").length !== 1) throw Error("duplicate headers");
        return [header.firstElementChild.firstElementChild, header.querySelector("[data-tutorial='login']"), header.querySelector("[aria-label='メニュー']"), document.querySelector("main")].map((element, index) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return index === 3 ? [y] : [x, y, width, height];
        });
      }, header);
      const baseline = await measure();
      assert.ok(baseline[0][0] + baseline[0][2] < baseline[1][0]);
      assert.ok(baseline[1][0] + baseline[1][2] < baseline[2][0]);
      assert.ok(baseline[2][0] + baseline[2][2] <= width);
      await page.setViewportSize({ width, height: 420 });
      await page.locator("main").evaluate(element => { element.scrollTop = element.scrollHeight; });
      assert.deepEqual(await measure(), baseline);
      await page.setViewportSize({ width, height: 820 });
      for (const path of ["/drill", "/library", "/"]) {
        await page.locator(`nav a[href="${path}"]`).last().click();
        await page.waitForURL(origin + path);
        if (path === "/library") await page.getByRole("heading", { name: "保存フレーズ" }).waitFor();
        if (path === "/") await page.locator('[data-tutorial="input-card"]').waitFor();
        assert.deepEqual(await measure(), baseline, `${path} at ${width}px`);
        assert.equal(await page.locator("header").evaluate(el => /端末に保存済み・(?:変更を)?同期中|同期済み/.test(el.parentElement.innerText)), false);
      }
      if (signedIn) {
        await page.evaluate(() => {
          window.fixtureSynced = false;
          window.addEventListener("phrabit-account-phrase-data-synced", () => { window.fixtureSynced = true; }, { once: true });
        });
        const finished = page.waitForResponse(response => response.url() === origin + "/api/phrases");
        gate.resolve();
        await finished;
        await page.waitForFunction(() => window.fixtureSynced);
        assert.equal(await page.getByText("同期済み", { exact: true }).count(), 0);
        await page.getByRole("button", { name: "メニュー" }).click();
        await page.keyboard.press("Escape");
        assert.deepEqual(await measure(), baseline);
        fail = true;
        await page.evaluate(() => window.dispatchEvent(new Event("online")));
        await page.getByRole("status").filter({ hasText: "未同期の変更があります" }).waitFor();
        assert.deepEqual((await measure()).slice(0, 3), baseline.slice(0, 3));
      } else gate.resolve();
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px ${signedIn ? "mock signed-in" : "guest"}: header instance, logo, account, menu and content top stable across tabs`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
