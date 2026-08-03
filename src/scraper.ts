import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { discoverHistorical } from "./discover.js";
import { parseMatchHtml } from "./match-parser.js";
import { parseOddsRows } from "./odds-parser.js";
import type { Candidate, MatchRecord } from "./types.js";
import { DATA_FILE, ROOT, envInt, isMain, logError, readJson, slugId, writeJsonAtomic } from "./utils.js";

export class ResilientBrowser {
  browser?: Browser; context?: BrowserContext; page?: Page;
  async getPage(): Promise<Page> {
    if (!this.browser?.isConnected()) this.browser = await chromium.launch({ headless: process.env.HEADLESS === "1" });
    if (!this.context) this.context = await this.browser.newContext({ locale: "en-GB", timezoneId: "Europe/Warsaw" });
    if (!this.page || this.page.isClosed()) this.page = await this.context.newPage();
    return this.page;
  }
  async reset(): Promise<void> {
    await this.context?.close().catch(() => undefined); this.context = undefined; this.page = undefined;
    if (!this.browser?.isConnected()) this.browser = undefined;
  }
  async close(): Promise<void> { await this.browser?.close().catch(() => undefined); }
}
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function scrapeCandidate(manager: ResilientBrowser, candidate: Candidate, retries: number): Promise<MatchRecord | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const page = await manager.getPage();
      await page.goto(candidate.flashscoreUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(1200);
      let html = await page.content();
      const title = await page.title();
      const challengeCount = await page.locator("iframe[src*='captcha'], [id*='captcha'], [class*='captcha']").count();
      if (challengeCount || /captcha|access denied|verify you are human/i.test(`${title} ${page.url()}`)) throw new Error("BLOCKED: CAPTCHA or anti-bot page detected");
      const base = parseMatchHtml(html, candidate);
      if (!base) return null;
      let odds = parseOddsRows(html);
      if (!odds) {
        const oddsUrl = new URL(candidate.flashscoreUrl);
        oddsUrl.pathname = `${oddsUrl.pathname.replace(/\/$/, "")}/odds/`;
        await page.goto(oddsUrl.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForTimeout(800);
        html = await page.content();
        odds = parseOddsRows(html);
      }
      return odds ? { ...base, odds } : null;
    } catch (error) {
      const message = `${candidate.flashscoreId} attempt ${attempt}: ${String(error)}`;
      logError(message);
      if (/BLOCKED/.test(message)) throw error;
      try {
        const page = await manager.getPage();
        const stem = path.join(ROOT, "screenshots", slugId(candidate.flashscoreId));
        fs.mkdirSync(path.dirname(stem), { recursive: true });
        await page.screenshot({ path: `${stem}.png`, fullPage: true }).catch(() => undefined);
        fs.writeFileSync(`${stem}.html`, await page.content().catch(() => ""), "utf8");
      } catch {}
      await manager.reset();
    }
  }
  return null;
}

export async function main(): Promise<void> {
  const from = process.env.HISTORY_FROM ?? "2023-01-01", to = process.env.HISTORY_TO ?? "2026-07-25";
  const pool = envInt("HISTORY_POOL", 900), retries = Math.max(1, envInt("MAX_RETRIES", 3)), wait = envInt("SCRAPE_DELAY_MS", 2000);
  const records = readJson<MatchRecord[]>(DATA_FILE, []), seen = new Set(records.map(x => x.flashscoreId));
  const manager = new ResilientBrowser();
  try {
    let candidates: Candidate[] = [];
    for (let attempt = 1; attempt <= retries; attempt++) {
      try { candidates = await discoverHistorical(await manager.getPage(), from, to, pool); break; }
      catch (e) { logError(`archive discovery attempt ${attempt}: ${String(e)}`); if (/BLOCKED/.test(String(e))) throw e; await manager.reset(); }
    }
    console.log(`Archive discovery: ${candidates.length} unique eligible links`);
    for (const candidate of candidates) {
      if (seen.has(candidate.flashscoreId) || records.length >= pool) continue;
      const record = await scrapeCandidate(manager, candidate, retries);
      if (record) { records.push(record); seen.add(record.flashscoreId); writeJsonAtomic(DATA_FILE, records); console.log(`saved ${records.length}/${pool}: ${record.playerA} - ${record.playerB}`); }
      await delay(wait);
    }
  } finally { await manager.close(); }
  console.log(`Done. ${records.length} records in ${DATA_FILE}`);
}
if (isMain(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
