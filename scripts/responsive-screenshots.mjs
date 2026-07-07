import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const eq = arg.indexOf("=");
      if (eq === -1) return [arg.slice(2), "true"];
      return [arg.slice(2, eq), arg.slice(eq + 1)];
    }),
);

const baseUrl = args.url || "http://localhost:3010";
const routes = (args.routes || "/,/add,/conversation,/drill,/library")
  .split(",")
  .map((route) => route.trim())
  .filter(Boolean);
const outputDir = path.resolve(
  process.cwd(),
  args.outdir || path.join(path.relative(process.cwd(), __dirname), "..", "tmp", "phrabit-responsive-shots"),
);

const presets = {
  mobile: [
    { name: "iPhone15", width: 393, height: 852 },
    { name: "iPhone15-Plus", width: 430, height: 932 },
    { name: "iPhoneSE", width: 375, height: 667 },
    { name: "GooglePixel7", width: 412, height: 915 },
  ],
  tablet: [
    { name: "iPad-mini", width: 768, height: 1024 },
    { name: "iPad-Pro-11", width: 834, height: 1194 },
  ],
  desktop: [
    { name: "Laptop-1366", width: 1366, height: 768 },
    { name: "Desktop-1920", width: 1920, height: 1080 },
  ],
};

const customViewports = args.viewports
  ? args.viewports.split(",").map((item) => {
      const [name, size] = item.split(":");
      const [width, height] = (size || "").split("x").map((v) => Number(v));
      if (!name || !width || !height || Number.isNaN(width) || Number.isNaN(height)) {
        throw new Error(`--viewports format error: ${item}`);
      }
      return { name, width, height };
    })
  : [...presets.mobile, ...presets.tablet, ...presets.desktop];

const preferredChannels = [
  { label: "bundled", options: {} },
  ...(args.channel ? [{ label: args.channel, options: { channel: args.channel } }] : []),
  { label: "chrome", options: { channel: "chrome" } },
  { label: "msedge", options: { channel: "msedge" } },
];

function safeName(input) {
  return input === "/" ? "home" : input.replace(/\//g, "-").replace(/^\-+|\-+$/g, "");
}

function toAbsoluteUrl(target) {
  const trimmedBase = baseUrl.replace(/\/$/, "");
  if (target.startsWith("http://") || target.startsWith("https://")) {
    return target;
  }
  return `${trimmedBase}${target.startsWith("/") ? target : `/${target}`}`;
}

async function loadPlaywright() {
  try {
    const playwright = await import("playwright");
    return playwright.chromium;
  } catch (error) {
    console.error("Playwright package not found.");
    console.error("  npm i -D playwright");
    throw error;
  }
}

async function capture() {
  const chromium = await loadPlaywright();
  let browser;
  for (const candidate of preferredChannels) {
    try {
      browser = await chromium.launch({ headless: true, ...candidate.options });
      if (candidate.label !== "bundled") {
        console.log(`Playwright browser not found; fallback to ${candidate.label}`);
      }
      break;
    } catch (error) {
      if (candidate.label === preferredChannels[preferredChannels.length - 1].label) {
        console.error("No usable browser found.");
        console.error(error.message);
        throw error;
      }
      if (
        !error.message.includes("Executable doesn't exist") &&
        !error.message.includes("Could not find browser")
      ) {
        console.error(error.message);
      }
    }
  }

  if (!browser) return;

  await fs.mkdir(outputDir, { recursive: true });

  console.log("Target URL:", baseUrl);
  console.log("Output:", outputDir);
  console.log("Routes:", routes.join(", "));
  console.log("Viewports:", `${customViewports.length} viewports`);

  let total = 0;
  for (const viewport of customViewports) {
    for (const route of routes) {
      const routeLabel = safeName(route);
      const fileName = `${viewport.name}--${routeLabel}.png`;
      const filePath = path.join(outputDir, fileName);
      const url = toAbsoluteUrl(route);

      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(600);
        await page.screenshot({ path: filePath, fullPage: true });
        total += 1;
        console.log(`PASS ${viewport.name} ${route} -> ${fileName}`);
      } catch (error) {
        console.log(`FAIL ${viewport.name} ${route} failed: ${error.message}`);
      } finally {
        await page.close();
      }
    }
  }

  await browser.close();
  console.log(`\nDone: ${total} screenshots`);
  console.log(`Saved to: ${outputDir}`);
}

capture().catch((error) => {
  console.error("capture failed:", error.message);
  process.exit(1);
});
