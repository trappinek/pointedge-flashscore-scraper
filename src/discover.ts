import type { Page } from "playwright";
import type { Candidate, Tour } from "./types.js";

export interface TournamentSource {
  tour: Tour;
  slug: string;
  name: string;
  months: number[];
}

// Main-tour events only. No Challenger, ITF, WTA 125, doubles, team or exhibition pages.
export const TOURNAMENTS: TournamentSource[] = [
  { tour: "ATP", slug: "australian-open", name: "Australian Open", months: [1] },
  { tour: "WTA", slug: "australian-open", name: "Australian Open", months: [1] },
  { tour: "ATP", slug: "adelaide", name: "Adelaide", months: [1] },
  { tour: "WTA", slug: "adelaide", name: "Adelaide", months: [1] },
  { tour: "ATP", slug: "auckland", name: "Auckland", months: [1] },
  { tour: "WTA", slug: "hobart", name: "Hobart", months: [1] },

  { tour: "ATP", slug: "dallas", name: "Dallas", months: [2] },
  { tour: "ATP", slug: "rotterdam", name: "Rotterdam", months: [2] },
  { tour: "ATP", slug: "buenos-aires", name: "Buenos Aires", months: [2] },
  { tour: "ATP", slug: "delray-beach", name: "Delray Beach", months: [2] },
  { tour: "ATP", slug: "doha", name: "Doha", months: [2] },
  { tour: "ATP", slug: "dubai", name: "Dubai", months: [2, 3] },
  { tour: "ATP", slug: "rio-de-janeiro", name: "Rio de Janeiro", months: [2] },
  { tour: "WTA", slug: "abu-dhabi", name: "Abu Dhabi", months: [2] },
  { tour: "WTA", slug: "doha", name: "Doha", months: [2] },
  { tour: "WTA", slug: "dubai", name: "Dubai", months: [2] },
  { tour: "WTA", slug: "linz", name: "Linz", months: [2] },

  { tour: "ATP", slug: "indian-wells", name: "Indian Wells", months: [3] },
  { tour: "WTA", slug: "indian-wells", name: "Indian Wells", months: [3] },
  { tour: "ATP", slug: "miami", name: "Miami", months: [3] },
  { tour: "WTA", slug: "miami", name: "Miami", months: [3] },

  { tour: "ATP", slug: "monte-carlo", name: "Monte Carlo", months: [4] },
  { tour: "ATP", slug: "barcelona", name: "Barcelona", months: [4] },
  { tour: "ATP", slug: "munich", name: "Munich", months: [4] },
  { tour: "ATP", slug: "estoril", name: "Estoril", months: [4] },
  { tour: "WTA", slug: "charleston", name: "Charleston", months: [4] },
  { tour: "WTA", slug: "stuttgart", name: "Stuttgart", months: [4] },
  { tour: "WTA", slug: "bogota", name: "Bogota", months: [4] },

  { tour: "ATP", slug: "madrid", name: "Madrid", months: [4, 5] },
  { tour: "WTA", slug: "madrid", name: "Madrid", months: [4, 5] },
  { tour: "ATP", slug: "rome", name: "Rome", months: [5] },
  { tour: "WTA", slug: "rome", name: "Rome", months: [5] },
  { tour: "ATP", slug: "french-open", name: "French Open", months: [5, 6] },
  { tour: "WTA", slug: "french-open", name: "French Open", months: [5, 6] },
  { tour: "ATP", slug: "geneva", name: "Geneva", months: [5] },
  { tour: "WTA", slug: "strasbourg", name: "Strasbourg", months: [5] },

  { tour: "ATP", slug: "halle", name: "Halle", months: [6] },
  { tour: "ATP", slug: "london", name: "London", months: [6] },
  { tour: "ATP", slug: "eastbourne", name: "Eastbourne", months: [6] },
  { tour: "WTA", slug: "berlin", name: "Berlin", months: [6] },
  { tour: "WTA", slug: "bad-homburg", name: "Bad Homburg", months: [6] },
  { tour: "WTA", slug: "eastbourne", name: "Eastbourne", months: [6] },

  { tour: "ATP", slug: "wimbledon", name: "Wimbledon", months: [6, 7] },
  { tour: "WTA", slug: "wimbledon", name: "Wimbledon", months: [6, 7] },
  { tour: "ATP", slug: "hamburg", name: "Hamburg", months: [7] },
  { tour: "ATP", slug: "bastad", name: "Bastad", months: [7] },
  { tour: "ATP", slug: "gstaad", name: "Gstaad", months: [7] },
  { tour: "ATP", slug: "washington", name: "Washington", months: [7, 8] },
  { tour: "WTA", slug: "washington", name: "Washington", months: [7, 8] },
  { tour: "WTA", slug: "prague", name: "Prague", months: [7] },

  { tour: "ATP", slug: "us-open", name: "US Open", months: [8, 9] },
  { tour: "WTA", slug: "us-open", name: "US Open", months: [8, 9] },
  { tour: "ATP", slug: "montreal", name: "Canada Masters", months: [8] },
  { tour: "WTA", slug: "montreal", name: "Montreal", months: [8] },
  { tour: "ATP", slug: "cincinnati", name: "Cincinnati", months: [8] },
  { tour: "WTA", slug: "cincinnati", name: "Cincinnati", months: [8] },
  { tour: "ATP", slug: "winston-salem", name: "Winston-Salem", months: [8] },
  { tour: "WTA", slug: "cleveland", name: "Cleveland", months: [8] },

  { tour: "ATP", slug: "chengdu", name: "Chengdu", months: [9] },
  { tour: "ATP", slug: "tokyo", name: "Tokyo", months: [9, 10] },
  { tour: "WTA", slug: "guadalajara", name: "Guadalajara", months: [9] },
  { tour: "WTA", slug: "seoul", name: "Seoul", months: [9] },

  { tour: "ATP", slug: "shanghai", name: "Shanghai", months: [10] },
  { tour: "WTA", slug: "beijing", name: "Beijing", months: [9, 10] },
  { tour: "ATP", slug: "vienna", name: "Vienna", months: [10] },
  { tour: "ATP", slug: "basel", name: "Basel", months: [10] },
  { tour: "ATP", slug: "stockholm", name: "Stockholm", months: [10] },
  { tour: "WTA", slug: "wuhan", name: "Wuhan", months: [10] },
  { tour: "WTA", slug: "ningbo", name: "Ningbo", months: [10] },

  { tour: "ATP", slug: "paris", name: "Paris", months: [10, 11] },
  { tour: "ATP", slug: "metz", name: "Metz", months: [11] },
  { tour: "ATP", slug: "atp-finals-turin", name: "ATP Finals", months: [11] },
  { tour: "WTA", slug: "wta-finals", name: "WTA Finals", months: [11] }
];

function yearsBetween(from: string, to: string): number[] {
  const years: number[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) years.push(y);
  return years;
}

function monthsBetween(from: string, to: string): Set<number> {
  const months = new Set<number>();
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  while (cursor <= end) {
    months.add(cursor.getUTCMonth() + 1);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export function tournamentResultUrls(
  source: TournamentSource,
  year: number,
  currentYear = new Date().getUTCFullYear(),
): Array<{ url: string; latestEdition: boolean }> {
  const category = source.tour === "ATP" ? "atp-singles" : "wta-singles";
  const base = `https://www.flashscore.com/tennis/${category}`;
  const latest = { url: `${base}/${source.slug}/results/`, latestEdition: true };
  const archived = { url: `${base}/${source.slug}-${year}/results/`, latestEdition: false };

  // Flashscore keeps the latest available edition under the slug without a
  // year. Usually that is the current year, but before a tournament starts it
  // can still be last year's edition.
  return year === currentYear ? [latest, archived] : [archived, latest];
}

export function seasonFromTexts(texts: string[]): number | null {
  for (const text of texts) {
    const match = text.match(/\b(20\d{2})\b/);
    if (match) return Number(match[1]);
  }
  return null;
}

async function displayedSeason(page: Page): Promise<number | null> {
  const texts = await page.evaluate(() => {
    const selectors = [
      "[class*='heading__info']",
      "[class*='heading__name']",
      "[class*='tournamentHeader']",
      "main h1",
      "h1",
    ];
    const headings = selectors.flatMap((selector) =>
      [...document.querySelectorAll<HTMLElement>(selector)]
        .slice(0, 8)
        .map((element) => (element.innerText || element.textContent || "").trim()),
    );
    const bodyStart = (document.body?.innerText ?? "").slice(0, 1_500);
    return [...headings, bodyStart];
  });
  return seasonFromTexts(texts);
}

async function expandAllResults(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const more = page.locator(
      "[class*='event__more'], a:has-text('Show more matches'), button:has-text('Show more matches')",
    ).filter({ visible: true }).first();
    if (!(await more.count()) || !(await more.isVisible().catch(() => false))) return;
    await more.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(350);
  }
}

async function discoverTournamentUrl(
  page: Page,
  source: TournamentSource,
  year: number,
  from: string,
  to: string,
  url: string,
  latestEdition: boolean,
): Promise<Candidate[]> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator("a[href*='/match/tennis/']").first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => undefined);
  const title = await page.title();
  const challengeCount = await page.locator("iframe[src*='captcha'], [id*='captcha'], [class*='captcha']").count();
  if (challengeCount || /captcha|access denied|verify you are human/i.test(`${title} ${page.url()}`)) {
    throw new Error("BLOCKED: CAPTCHA or anti-bot page detected");
  }

  const season = await displayedSeason(page);
  // The no-year URL is an alias for the latest available edition. Never use
  // its rows unless Flashscore confirms that it is the requested season.
  if ((latestEdition && season !== year) || (!latestEdition && season !== null && season !== year)) {
    return [];
  }

  await expandAllResults(page);
  return page.evaluate(({ tour, tournament, targetYear, dateFrom, dateTo }) => {
    const result: Candidate[] = [];
    const links = [...document.querySelectorAll<HTMLAnchorElement>("a[href*='/match/tennis/']")];
    for (const link of links) {
      const row = link.closest("[class*='event__match']");
      if (!row) continue; // excludes footer and promotional links
      const rowText = (row.textContent ?? "").replace(/\s+/g, " ").trim();
      // Current/latest pages use "22.02. 22:05", while archived pages can
      // include the year. A word boundary after the trailing dot does not
      // match, because both the dot and following space are non-word chars.
      const dm = rowText.match(/\b(\d{2})\.(\d{2})\.(\d{4})?/);
      if (!dm) continue;
      const iso = `${dm[3] ?? targetYear}-${dm[2]}-${dm[1]}`;
      if (iso < dateFrom || iso > dateTo) continue;
      const href = link.href.split("#")[0];
      const id = new URL(href).searchParams.get("mid") ?? link.id.match(/([A-Za-z0-9]{8})$/)?.[1];
      if (!id) continue;
      result.push({ flashscoreId: id, flashscoreUrl: href, tourHint: tour, tournamentHint: tournament });
    }
    return [...new Map(result.map(x => [x.flashscoreId, x])).values()];
  }, { tour: source.tour, tournament: source.name, targetYear: year, dateFrom: from, dateTo: to });
}

export async function discoverTournamentResults(
  page: Page, source: TournamentSource, year: number, from: string, to: string
): Promise<Candidate[]> {
  for (const candidate of tournamentResultUrls(source, year)) {
    const found = await discoverTournamentUrl(
      page,
      source,
      year,
      from,
      to,
      candidate.url,
      candidate.latestEdition,
    );
    if (found.length > 0) {
      return found;
    }
  }
  return [];
}

export async function discoverHistorical(
  page: Page, from: string, to: string, wanted: number
): Promise<Candidate[]> {
  const all: Candidate[] = [];
  const configured = process.env.TRIAL_TOURNAMENT?.trim().toLowerCase();
  const configuredTour = process.env.TRIAL_TOUR?.trim().toUpperCase();
  const targetMonths = monthsBetween(from, to);
  const sources = TOURNAMENTS.filter(x =>
    (!configured || x.slug === configured) &&
    (!configuredTour || x.tour === configuredTour) &&
    x.months.some((month) => targetMonths.has(month))
  );
  for (const year of yearsBetween(from, to)) {
    for (const source of sources) {
      try {
        const found = await discoverTournamentResults(page, source, year, from, to);
        all.push(...found);
        console.log(`archive ${source.tour} ${source.name} ${year}: ${found.length} links`);
        if (all.length >= Math.max(wanted * 3, wanted + 20)) return [...new Map(all.map(x => [x.flashscoreId, x])).values()];
      } catch (error) {
        if (/BLOCKED/.test(String(error))) throw error;
        console.warn(`archive skipped ${source.tour} ${source.name} ${year}: ${String(error)}`);
      }
    }
  }
  return [...new Map(all.map(x => [x.flashscoreId, x])).values()];
}

export async function discoverDay(page: Page, day: string): Promise<Candidate[]> {
  const ymd = day.replaceAll("-", "");
  await page.goto(`https://www.flashscore.com/tennis/?d=${ymd}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator("a[href*='/match/tennis/']").first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => undefined);
  const title = await page.title();
  const challengeCount = await page.locator("iframe[src*='captcha'], [id*='captcha'], [class*='captcha']").count();
  if (challengeCount || /captcha|access denied|verify you are human/i.test(`${title} ${page.url()}`)) throw new Error("BLOCKED: CAPTCHA or anti-bot page detected");
  return page.evaluate(() => {
    const out: Array<{ flashscoreId: string; flashscoreUrl: string; tourHint: Tour; tournamentHint: string }> = [];
    const headers = [...document.querySelectorAll("[class*='header'], [class*='Header']")];
    for (const link of [...document.querySelectorAll<HTMLAnchorElement>("a[href*='/match/tennis/']")]) {
      const href = link.href.split("#")[0];
      const id = new URL(href).searchParams.get("mid") ??
        link.id.match(/(?:g_\d_)?([A-Za-z0-9]{8})$/)?.[1] ??
        link.closest("[id^='g_']")?.id.split("_").pop();
      if (!id) continue;
      const event = link.closest("[class*='event__match'], [id^='g_']");
      const section = event?.closest(".sportName, [class*='sportName']");
      let prev = event?.previousElementSibling ?? null;
      while (prev && !/ATP|WTA/i.test(prev.textContent ?? "")) prev = prev.previousElementSibling;
      if (!prev && section) {
        const ordered = [...section.querySelectorAll("[class*='event__header'], [class*='event__match']")];
        const index = ordered.indexOf(event as Element);
        for (let i = index - 1; i >= 0; i--) {
          if (/ATP|WTA/i.test(ordered[i].textContent ?? "")) { prev = ordered[i]; break; }
        }
      }
      const heading = (prev?.textContent ?? headers.find(h => /ATP|WTA/i.test(h.textContent ?? ""))?.textContent ?? "").replace(/\s+/g, " ").trim();
      const tour = /\bWTA\b/i.test(heading) ? "WTA" : /\bATP\b/i.test(heading) ? "ATP" : null;
      if (!tour || /challenger|itf|125|doubles|mixed|team|exhibition/i.test(heading)) continue;
      out.push({ flashscoreId: id, flashscoreUrl: href, tourHint: tour, tournamentHint: heading.replace(/^.*?(ATP|WTA)\s*[-–:]?\s*/i, "") });
    }
    return [...new Map(out.map(x => [x.flashscoreId, x])).values()];
  });
}
