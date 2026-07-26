import type { Page } from "playwright";
import type { Candidate, Tour } from "./types.js";

export interface TournamentSource {
  tour: Tour;
  slug: string;
  name: string;
}

// Main-tour events only. No Challenger, ITF, WTA 125, doubles, team or exhibition pages.
export const TOURNAMENTS: TournamentSource[] = [
  { tour: "ATP", slug: "australian-open", name: "Australian Open" },
  { tour: "WTA", slug: "australian-open", name: "Australian Open" },
  { tour: "ATP", slug: "french-open", name: "French Open" },
  { tour: "WTA", slug: "french-open", name: "French Open" },
  { tour: "ATP", slug: "wimbledon", name: "Wimbledon" },
  { tour: "WTA", slug: "wimbledon", name: "Wimbledon" },
  { tour: "ATP", slug: "us-open", name: "US Open" },
  { tour: "WTA", slug: "us-open", name: "US Open" },
  { tour: "ATP", slug: "indian-wells", name: "Indian Wells" },
  { tour: "WTA", slug: "indian-wells", name: "Indian Wells" },
  { tour: "ATP", slug: "miami", name: "Miami" },
  { tour: "WTA", slug: "miami", name: "Miami" },
  { tour: "ATP", slug: "madrid", name: "Madrid" },
  { tour: "WTA", slug: "madrid", name: "Madrid" },
  { tour: "ATP", slug: "rome", name: "Rome" },
  { tour: "WTA", slug: "rome", name: "Rome" },
  { tour: "ATP", slug: "montreal", name: "Canada Masters" },
  { tour: "WTA", slug: "montreal", name: "Montreal" },
  { tour: "ATP", slug: "cincinnati", name: "Cincinnati" },
  { tour: "WTA", slug: "cincinnati", name: "Cincinnati" },
  { tour: "ATP", slug: "shanghai", name: "Shanghai" },
  { tour: "WTA", slug: "beijing", name: "Beijing" },
  { tour: "ATP", slug: "paris", name: "Paris" },
  { tour: "WTA", slug: "wuhan", name: "Wuhan" }
];

function yearsBetween(from: string, to: string): number[] {
  const years: number[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) years.push(y);
  return years;
}

export async function discoverTournamentResults(
  page: Page, source: TournamentSource, year: number, from: string, to: string
): Promise<Candidate[]> {
  const category = source.tour === "ATP" ? "atp-singles" : "wta-singles";
  const seasonSlug = `${source.slug}-${year}`;
  const url = `https://www.flashscore.com/tennis/${category}/${seasonSlug}/results/`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator("a[href*='/match/tennis/']").first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => undefined);
  const title = await page.title();
  const challengeCount = await page.locator("iframe[src*='captcha'], [id*='captcha'], [class*='captcha']").count();
  if (challengeCount || /captcha|access denied|verify you are human/i.test(`${title} ${page.url()}`)) throw new Error("BLOCKED: CAPTCHA or anti-bot page detected");
  return page.evaluate(({ tour, tournament, targetYear, dateFrom, dateTo }) => {
    const result: Candidate[] = [];
    const links = [...document.querySelectorAll<HTMLAnchorElement>("a[href*='/match/tennis/']")];
    for (const link of links) {
      const row = link.closest("[class*='event__match']");
      if (!row) continue; // excludes footer and promotional links
      const rowText = (row.textContent ?? "").replace(/\s+/g, " ").trim();
      if (/cancel|abandon|retired|walkover|awarded|interrupted|postponed/i.test(rowText)) continue;
      const dm = rowText.match(/\b(\d{2})\.(\d{2})\.(?:(\d{4}))?\b/);
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

export async function discoverHistorical(
  page: Page, from: string, to: string, wanted: number
): Promise<Candidate[]> {
  const all: Candidate[] = [];
  const configured = process.env.TRIAL_TOURNAMENT?.trim().toLowerCase();
  const configuredTour = process.env.TRIAL_TOUR?.trim().toUpperCase();
  const sources = TOURNAMENTS.filter(x =>
    (!configured || x.slug === configured) &&
    (!configuredTour || x.tour === configuredTour)
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
