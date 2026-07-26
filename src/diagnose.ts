import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./utils.js";
import { discoverDay } from "./discover.js";

const url = process.env.DIAGNOSE_URL ?? "https://www.flashscore.com/tennis/";
const browser = await chromium.launch({ headless: process.env.HEADLESS === "1" });
try {
  const page = await browser.newPage({ locale: "en-GB" });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2000);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-"), base = path.join(ROOT, "screenshots", `diagnose-${stamp}`);
  fs.mkdirSync(path.dirname(base), { recursive: true });
  await page.screenshot({ path: `${base}.png`, fullPage: true });
  fs.writeFileSync(`${base}.html`, await page.content(), "utf8");
  const date = new URL(page.url()).searchParams.get("d");
  const candidates = date?.match(/^\d{8}$/) ? await discoverDay(page, `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6)}`) : [];
  console.log(JSON.stringify({ url: page.url(), title: await page.title(), matchLinks: await page.locator("a[href*='/match/tennis/']").count(), eligibleCandidates: candidates.length, candidateSample: candidates.slice(0, 3), html: `${base}.html`, screenshot: `${base}.png` }, null, 2));
} finally { await browser.close(); }
