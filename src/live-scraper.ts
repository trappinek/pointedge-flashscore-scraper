import { chromium, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import {
  combineDrawAndStage,
  parseLiveDayHtml,
  parseLiveMatchDetailHtml,
  parseLiveH2hHtml,
  parseRankingHtml,
} from "./live-parser.js";
import type { LiveDaySnapshot, LiveMatch } from "./live-types.js";
import { parseAllOddsRows } from "./odds-parser.js";
import { ROOT, isMain, writeJsonAtomic } from "./utils.js";
import { resolveBrowserProxy } from "./proxy.js";

const FLASHSCORE_URL = "https://www.flashscore.pl/tenis/";
const OUTPUT_FILE = path.join(ROOT, "data", "flashscore-live-cache.json");
const DEFAULT_INGEST_URL = "https://www.pointedge.pl/api/cron/ingest-flashscore";

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

async function scrapeRankings(context: BrowserContext): Promise<Map<string, number>> {
  const rankings = new Map<string, number>();
  for (const tour of ["atp", "wta"] as const) {
    const page = await context.newPage();
    try {
      const rankingRows = page.locator(".rankingTable__row");
      let rankingVisible = false;
      for (let attempt = 1; attempt <= 3 && !rankingVisible; attempt++) {
        try {
          await page.goto(`https://www.flashscore.pl/tenis/rankingi/${tour}/`, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
          });
          await dismissConsent(page);
          rankingVisible = await rankingRows
            .first()
            .waitFor({ state: "visible", timeout: 15_000 })
            .then(() => true)
            .catch(() => false);
        } catch (error) {
          console.warn(
            `Próba ${attempt}/3 rankingu ${tour.toUpperCase()} nie powiodła się: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        if (!rankingVisible && attempt < 3) await page.waitForTimeout(1_000 * attempt);
      }

      // Ranking jest informacją pomocniczą. Flashscore potrafi nie wyrenderować
      // tabeli przez wolne wyjście Tor albo chwilową blokadę, ale nie może to
      // zatrzymywać pobierania meczów, wyników i kursów.
      if (!rankingVisible) {
        console.warn(`Ranking ${tour.toUpperCase()} niedostępny w tym przebiegu — kontynuuję bez niego.`);
        continue;
      }

      for (let attempt = 0; attempt < 5; attempt++) {
        const more = page.getByRole("button", { name: "Więcej", exact: true });
        if (!(await more.count()) || !(await more.first().isVisible())) break;
        const previousCount = await page.locator(".rankingTable__row").count();
        await more.first().click();
        await page
          .waitForFunction(
            (count) => document.querySelectorAll(".rankingTable__row").length > count,
            previousCount,
            { timeout: 10_000 },
          )
          .catch(() => undefined);
      }

      for (const [playerId, rank] of parseRankingHtml(await page.content())) {
        rankings.set(playerId, rank);
      }
    } catch (error) {
      console.warn(
        `Nie udało się pobrać rankingu ${tour.toUpperCase()}: ${
          error instanceof Error ? error.message : String(error)
        }. Kontynuuję bez tego rankingu.`,
      );
    } finally {
      await page.close();
    }
  }
  console.log(`Rankingi ATP/WTA: ${rankings.size} zawodników`);
  return rankings;
}

async function scrapeDay(
  context: BrowserContext,
  offset: number,
  rankings: ReadonlyMap<string, number>,
): Promise<LiveDaySnapshot> {
  const dateStr = dateInWarsaw(offset);
  const page = await context.newPage();
  const feedBodies: string[] = [];
  const pendingFeedReads: Promise<void>[] = [];
  page.on("response", (response) => {
    if (!/\/x\/feed\/(?:f_2_|r_2_1)/.test(response.url())) return;
    pendingFeedReads.push(
      response
        .text()
        .then((body) => {
          feedBodies.push(body);
        })
        .catch(() => undefined),
    );
  });
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

    await Promise.allSettled(pendingFeedReads);
    const html = await page.content();
    const parserSource = `${html}\n${feedBodies.join("\n")}`;
    if (process.env.LIVE_SAVE_HTML === "1") {
      const debugFile = path.join(ROOT, "screenshots", `live-${dateStr}.html`);
      fs.mkdirSync(path.dirname(debugFile), { recursive: true });
      fs.writeFileSync(debugFile, parserSource, "utf8");
    }
    if (!/sportName tennis|headerLeague__wrapper/.test(html)) {
      const debugFile = path.join(ROOT, "screenshots", `live-${dateStr}.html`);
      fs.mkdirSync(path.dirname(debugFile), { recursive: true });
      fs.writeFileSync(debugFile, html, "utf8");
      throw new Error(`Nie znaleziono listy turniejów dla ${dateStr}. Zapisano ${debugFile}.`);
    }

    const matches = parseLiveDayHtml(parserSource, dateStr, rankings);
    console.log(`${dateStr}: ${matches.length} meczów ATP/WTA`);
    return { dateStr, matches };
  } finally {
    await page.close();
  }
}

async function enrichMatch(context: BrowserContext, match: LiveMatch): Promise<LiveMatch> {
  if (!match.sourceUrl) return match;
  const page = await context.newPage();
  try {
    await page.goto(match.sourceUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator(".detail__breadcrumbs").waitFor({ state: "visible", timeout: 12_000 });
    await page.locator(".participant__image").first().waitFor({ state: "visible", timeout: 8_000 }).catch(() => undefined);
    const detail = parseLiveMatchDetailHtml(await page.content(), match.playerA, match.playerB);

    const h2hTab = page.getByText("H2H", { exact: true });
    if (await h2hTab.count()) {
      await h2hTab.first().click().catch(() => undefined);
      await page.locator("[class*='h2h']").first().waitFor({ state: "visible", timeout: 8_000 }).catch(() => undefined);
      await page.waitForTimeout(500);
    }
    const h2h = parseLiveH2hHtml(await page.content(), match.playerA, match.playerB);
    return {
      ...match,
      playerAPhoto: detail.playerAPhoto,
      playerBPhoto: detail.playerBPhoto,
      round: combineDrawAndStage(match.round, detail.round),
      playerALastMatches: h2h.playerALastMatches,
      playerBLastMatches: h2h.playerBLastMatches,
      headToHead: h2h.headToHead,
    };
  } catch (error) {
    console.warn(
      `Nie udało się pobrać zdjęć/rundy dla ${match.playerA} - ${match.playerB}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return match;
  } finally {
    await page.close();
  }
}

async function scrapeMatchOdds(context: BrowserContext, match: LiveMatch): Promise<LiveMatch["odds"]> {
  if (!match.sourceUrl) return match.odds;
  const page = await context.newPage();
  try {
    await page.goto(match.sourceUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await dismissConsent(page);
    const oddsRows = page.locator(
      "[data-analytics-element='ODDS_COMPARISONS_INTERACTIVE_ROW'], main a[href*='/bookmaker/'][href*='from=odds-comparison'], [data-testid*='bookmaker'], [class*='oddsRow']",
    );
    const oddsCandidates = page
      .locator(
        "a[href*='/kursy/'], a[href*='odds-comparison'], a[href*='zestawienie-kurs'], [role='tab'], [role='button']",
      )
      .filter({ hasText: /Kursy|Odds/i });
    for (let index = 0; index < (await oddsCandidates.count()); index++) {
      const candidate = oddsCandidates.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click().catch(() => undefined);
        break;
      }
    }
    await oddsRows.first().waitFor({ state: "visible", timeout: 12_000 }).catch(() => undefined);
    if (!(await oddsRows.count())) {
      const oddsUrl = new URL(page.url());
      oddsUrl.hash = "";
      oddsUrl.pathname = `${oddsUrl.pathname
        .replace(/\/(?:kursy|h2h|drabinka)\/?$/i, "/")
        .replace(/\/?$/, "/")}kursy/`;
      await page.goto(oddsUrl.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
      await oddsRows.first().waitFor({ state: "visible", timeout: 12_000 }).catch(() => undefined);
    }
    return await collectAllBookmakerOdds(page);
  } catch (error) {
    console.warn(
      `Nie udało się pobrać polskich kursów dla ${match.playerA} - ${match.playerB}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return match.odds;
  } finally {
    await page.close();
  }
}

/**
 * Flashscore lazy-loaduje tabele kursow i na runnerze GitHub potrafi najpierw
 * wyrenderowac tylko jeden wiersz. Zbieramy oferty z kilku stanow strony,
 * rozwijamy przyciski "wiecej" i scalamy wiersze po nazwie bukmachera.
 */
async function collectAllBookmakerOdds(page: Page): Promise<LiveMatch["odds"]> {
  const collected = new Map<string, LiveMatch["odds"][number]>();
  const capture = async () => {
    for (const row of parseAllOddsRows(await page.content())) {
      collected.set(row.bookmaker.toLocaleLowerCase("pl"), row);
    }
  };

  await capture();
  let unchangedRounds = 0;
  let previousSize = collected.size;

  for (let attempt = 0; attempt < 4 && unchangedRounds < 2; attempt++) {
    const expanders = page
      .locator("button, [role='button']")
      .filter({ hasText: /(?:Poka[zż]|Wy[sś]wietl|Zobacz)?\s*(?:wi[eę]cej|more)|pozosta(?:łe|le)\s+ofert/i });
    const expanderCount = await expanders.count();
    for (let index = 0; index < expanderCount; index++) {
      const expander = expanders.nth(index);
      if (await expander.isVisible().catch(() => false)) {
        await expander.click().catch(() => undefined);
      }
    }

    const bookmakerLinks = page.locator("main a[href*='/bookmaker/'][href*='odds-comparison']");
    const linkCount = await bookmakerLinks.count();
    if (linkCount > 0) {
      await bookmakerLinks.nth(linkCount - 1).scrollIntoViewIfNeeded().catch(() => undefined);
    }

    await page.waitForTimeout(300);
    await capture();

    if (collected.size === previousSize) unchangedRounds++;
    else unchangedRounds = 0;
    previousSize = collected.size;
  }

  return [...collected.values()];
}

async function enrichDays(
  directContext: BrowserContext,
  oddsContext: BrowserContext,
  days: LiveDaySnapshot[],
): Promise<LiveDaySnapshot[]> {
  const queue = days.flatMap((day, dayIndex) =>
    day.matches.map((match, matchIndex) => ({ dayIndex, matchIndex, match })),
  );
  const enriched = days.map((day) => ({ ...day, matches: [...day.matches] }));
  let cursor = 0;
  const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
    while (cursor < queue.length) {
      const item = queue[cursor++];
      const detailedMatch = await enrichMatch(directContext, item.match);
      const odds = await scrapeMatchOdds(oddsContext, detailedMatch);
      enriched[item.dayIndex].matches[item.matchIndex] = {
        ...detailedMatch,
        odds: odds.length ? odds : detailedMatch.odds,
      };
    }
  });
  await Promise.all(workers);
  const withPhotos = enriched.flatMap((day) => day.matches).filter(
    (match) => match.playerAPhoto || match.playerBPhoto,
  ).length;
  const withSpecificRound = enriched.flatMap((day) => day.matches).filter(
    (match) => /\(.+\)$/.test(match.round),
  ).length;
  const withOdds = enriched.flatMap((day) => day.matches).filter(
    (match) => match.odds.length > 0,
  ).length;
  const oddsMatches = enriched.flatMap((day) => day.matches).filter((match) => match.odds.length > 0);
  const withMultipleBookmakers = oddsMatches.filter((match) => match.odds.length > 1).length;
  const totalBookmakerOffers = oddsMatches.reduce((sum, match) => sum + match.odds.length, 0);
  console.log(`Szczegóły meczów: zdjęcia ${withPhotos}/${queue.length}, dokładna runda ${withSpecificRound}/${queue.length}`);
  console.log(`Kursy bukmacherow: ${withOdds}/${queue.length} meczow`);
  console.log(
    `Porownanie bukmacherow: ${withMultipleBookmakers}/${withOdds} meczow ma co najmniej 2 oferty, lacznie ${totalBookmakerOffers} ofert`,
  );
  return enriched;
}

async function upload(days: LiveDaySnapshot[]): Promise<void> {
  const endpoint = process.env.POINTEDGE_INGEST_URL?.trim() || DEFAULT_INGEST_URL;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (process.env.LIVE_REQUIRE_UPLOAD === "1") {
      throw new Error("Brak CRON_SECRET — upload do PointEdge jest wymagany.");
    }
    console.log(`Brak konfiguracji uploadu. Dane zapisano lokalnie w ${OUTPUT_FILE}.`);
    return;
  }

  const endpointUrl = new URL(endpoint);
  if (endpointUrl.pathname !== "/api/cron/ingest-flashscore") {
    throw new Error(
      `Niepoprawny POINTEDGE_INGEST_URL: ${endpointUrl.origin}${endpointUrl.pathname}. ` +
        "Adres musi kończyć się na /api/cron/ingest-flashscore.",
    );
  }
  console.log(`Wysyłanie snapshotu do ${endpointUrl.origin}${endpointUrl.pathname}`);

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

  const responseText = await response.text();
  let result: unknown;
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(
      `PointEdge zwrócił HTTP ${response.status}, ale odpowiedź nie jest JSON-em. ` +
        `Sprawdź POINTEDGE_INGEST_URL. Odpowiedź: ${responseText.slice(0, 200)}`,
    );
  }

  const expectedCounts = Object.fromEntries(days.map((day) => [day.dateStr, day.matches.length]));
  const updated =
    result && typeof result === "object" && "updated" in result
      ? (result.updated as Record<string, unknown>)
      : null;
  const confirmed = Object.entries(expectedCounts).every(
    ([dateStr, count]) => Number(updated?.[dateStr]) === count,
  );
  if (!confirmed) {
    throw new Error(
      `PointEdge nie potwierdził zapisu pełnego snapshotu. Oczekiwano ${JSON.stringify(
        expectedCounts,
      )}, otrzymano ${responseText.slice(0, 500)}`,
    );
  }

  console.log(`Neon zaktualizowany: ${JSON.stringify(updated)}`);
}

export async function main(): Promise<void> {
  const proxy = await resolveBrowserProxy();
  const directBrowser = await chromium.launch({
    headless: process.env.HEADLESS !== "0",
  });
  const oddsBrowser = await chromium.launch({
    headless: process.env.HEADLESS !== "0",
    proxy,
  });
  const directContext = await directBrowser.newContext({ locale: "pl-PL", timezoneId: "Europe/Warsaw" });
  const oddsContext = await oddsBrowser.newContext({ locale: "pl-PL", timezoneId: "Europe/Warsaw" });
  try {
    const rankings = await scrapeRankings(directContext);
    let days: LiveDaySnapshot[] = [];
    for (const offset of [-1, 0, 1]) days.push(await scrapeDay(directContext, offset, rankings));
    if (!days.some((day) => day.matches.length > 0)) {
      throw new Error("Scraper nie znalazł żadnego meczu w całym trzydniowym oknie. Cache nie został zmieniony.");
    }
    days = await enrichDays(directContext, oddsContext, days);
    writeJsonAtomic(OUTPUT_FILE, { generatedAt: new Date().toISOString(), days });
    await upload(days);
  } finally {
    await directContext.close();
    await oddsContext.close();
    await directBrowser.close();
    await oddsBrowser.close();
  }
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
