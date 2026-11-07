import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const origin = process.argv.includes("--production") ? "https://phrabit.com" : "http://127.0.0.1:3060";
const measureOnly = process.argv.includes("--measure-only");
const paths = ["/", "/drill", "/library", "/"];
const browser = await chromium.launch({ headless: true, executablePath: [chromium.executablePath(), "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync) });
try {
  for (const width of [320, 390, 430, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 850 }, serviceWorkers: "block" });
    try {
      await context.route("**/*", route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname.startsWith("/api/")) return route.fulfill({json:{ok:true, tracked:true, phrases:[], srsItems:[]}});
        if (!["GET","HEAD"].includes(request.method()) || request.headers().authorization) return route.abort();
        return route.continue();
      });
      await context.addInitScript(() => {
        localStorage.setItem("phrabit:add-tutorial-seen", "1");
        localStorage.setItem("phrabit-learning-language-v1", "zh");
        localStorage.setItem("poker-chinese-local-phrases-v1", JSON.stringify([{ id: "nav-test", source: "manual", direction: "ja-to-zh", japanese: "サッカー", chinese: "足球", sourceText: "サッカー", targetText: "足球", sourceLanguage: "ja", targetLanguage: "zh", reading: "zúqiú", readingType: "pinyin", explanation: "レイアウト確認。", shouldDrill: true, createdAt: "2026-01-01T00:00:00Z" }]));
      });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      assert.equal((await page.goto(origin, { waitUntil: "domcontentloaded" })).status(), 200);
      let baseline;
      for (const [index, path] of paths.entries()) {
        const selected = page.locator(`nav a[href="${path}"][data-tutorial^="nav-"]`);
        if (index) {
          await selected.click();
          await page.waitForURL(origin + path);
        }
        await page.waitForFunction(path => document.querySelector(`nav a[href="${path}"][data-tutorial^="nav-"]`)?.classList.contains("bg-emerald-500"), path);
        const links = page.locator("nav a[data-tutorial^='nav-']");
        const measure = () => links.evaluateAll(links => links.map(link => {
          const { x, y, width, height } = link.getBoundingClientRect();
          return { x, y, width, height };
        }));
        const rects = await measure();
        assert.equal(rects.length, 3);
        for (const rect of rects) assert.ok(rect.width > 0 && rect.x >= 0 && rect.x + rect.width <= width + 0.01);
        baseline ??= rects;
        const shift = Math.max(...rects.flatMap((rect, i) => ["x","width"].map(key => Math.abs(rect[key] - baseline[i][key]))));
        console.log(`${width}px ${path}: x=${rects[0].x} width=${rects[0].width} max horizontal delta=${shift}px`);
        if (!measureOnly) assert.deepEqual(rects, baseline, `tab buttons moved on ${path} at ${width}px`);
        if (path === "/drill") {
          await page.getByText("タップして確認", { exact: true }).click();
          const good = page.getByRole("button", { name: /^Good/ });
          await good.waitFor();
          const box = await good.boundingBox();
          assert.ok(box && box.y + box.height <= rects[0].y, "rating controls must be above the navigation");
          assert.deepEqual(await measure(), rects, "revealing the answer moved the navigation");
        }
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
