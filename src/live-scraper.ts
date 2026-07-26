import { chromium, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { parseLiveDayHtml } from "./live-parser.js";
import type { LiveDaySnapshot } from "./live-types.js";
import { ROOT, isMain, writeJsonAtomic } from "./utils.js";

const FLASHSCORE_URL = "https://www.flashscore.pl/tenis/";
const OUTPUT_FILE = path.join(ROOT, "data", "flashscore-live-cache.json");

function dateInWarsaw(offset: number): string {
  const instant = new Date(Date.now() + offset * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function dismissConsent(page: Page): Promise<void> {
  const buttons = page.getByRole("button", { name: /Odrzucenie wszystkich|Reject all/i });
  if (await buttons.count()) await buttons.first().click().catch(() => undefined);
}

async function selectOffset(page: Page, offset: number): Promise<void> {
  if (offset === 0) return;
  const label = offset < 0 ? /Poprzedni dzień|Previous day/i : /Następny dzień|Next day/i;
  const button = page.getByRole("button", { name: label });
  await button.first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
  if ((await button.count()) !== 1) throw new Error(`Nie znaleziono nawigacji dnia dla offsetu ${offset}.`);
  await button.click();
  await page.waitForTimeout(900);
}

async function assertSelectedDate(page: Page, expected: string): Promise<void> {
  const picker = page.getByTestId("wcl-dayPickerButton");
  if ((await picker.count()) !== 1) throw new Error("Flashscore nie pokazał selektora daty.");
  const visibleDate = (await picker.innerText()).replace(/\s+/g, " ").trim();
  const expectedDayMonth = `${expected.slice(8, 10)}/${expected.slice(5, 7)}`;
  if (!visibleDate.includes(expectedDayMonth)) {
    throw new Error(
      `Flashscore wyświetlił dzień ${JSON.stringify(visibleDate)}, oczekiwano ${expectedDayMonth}.`,
    );
  }
}

async function scrapeDay(context: BrowserContext, offset: number): Promise<LiveDaySnapshot> {
  const dateStr = dateInWarsaw(offset);
  const page = await context.newPage();
  try {
    await page.goto(FLASHSCORE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await dismissConsent(page);
    await page.getByTestId("wcl-dayPickerButton").waitFor({ state: "visible", timeout: 20_000 });
    await selectOffset(page, offset);
    await assertSelectedDate(page, dateStr);
    await page.waitForTimeout(1_200);

    const title = await page.title();
    const challenge = await page.locator("iframe[src*='captcha'], [id*='captcha'], [class*='captcha']").count();
    if (challenge || /captcha|access denied|verify you are human/i.test(`${title} ${page.url()}`)) {
      throw new Error("BLOCKED: Flashscore wyświetlił CAPTCHA lub blokadę antybotową.");
    }

    const html = await page.content();
    if (!/sportName tennis|headerLeague__wrapper/.test(html)) {
      const debugFile = path.join(ROOT, "screenshots", `live-${dateStr}.html`);
      fs.mkdirSync(path.dirname(debugFile), { recursive: true });
      fs.writeFileSync(debugFile, html, "utf8");
      throw new Error(`Nie znaleziono listy turniejów dla ${dateStr}. Zapisano ${debugFile}.`);
    }

    const matches = parseLiveDayHtml(html, dateStr);
    console.log(`${dateStr}: ${matches.length} meczów ATP/WTA`);
    return { dateStr, matches };
  } finally {
    await page.close();
  }
}

async function upload(days: LiveDaySnapshot[]): Promise<void> {
  const endpoint = process.env.POINTEDGE_INGEST_URL?.trim();
  const secret = process.env.CRON_SECRET?.trim();
  if (!endpoint || !secret) {
    if (process.env.LIVE_REQUIRE_UPLOAD === "1") {
      throw new Error("Brak POINTEDGE_INGEST_URL lub CRON_SECRET — upload do PointEdge jest wymagany.");
    }
    console.log(`Brak konfiguracji uploadu. Dane zapisano lokalnie w ${OUTPUT_FILE}.`);
    return;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ source: "flashscore", days }),
  });
  if (!response.ok) {
    throw new Error(`PointEdge odrzucił dane: HTTP ${response.status} ${await response.text()}`);
  }
  console.log(`Neon zaktualizowany: ${await response.text()}`);
}

export async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== "0" });
  const context = await browser.newContext({ locale: "pl-PL", timezoneId: "Europe/Warsaw" });
  try {
    const days: LiveDaySnapshot[] = [];
    for (const offset of [-1, 0, 1]) days.push(await scrapeDay(context, offset));
    if (!days.some((day) => day.matches.length > 0)) {
      throw new Error("Scraper nie znalazł żadnego meczu w całym trzydniowym oknie. Cache nie został zmieniony.");
    }
    writeJsonAtomic(OUTPUT_FILE, { generatedAt: new Date().toISOString(), days });
    await upload(days);
  } finally {
    await context.close();
    await browser.close();
  }
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
