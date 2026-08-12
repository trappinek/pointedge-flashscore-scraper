import { load, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type { MatchStat } from "./live-types.js";

const STAT_KEYS: Array<[RegExp, string]> = [
  [/^(asy|aces)$/i, "aces"],
  [/^(podw[oó]jne b[łl][ęe]dy|double faults)$/i, "double_faults"],
  [/^(pierwszy serwis|1st serve percentage|first serve percentage)$/i, "first_serve_percentage"],
  [/^(punkty wygrane po pierwszym serwisie|1st serve points won)$/i, "first_serve_points_won"],
  [/^(punkty wygrane po drugim serwisie|2nd serve points won)$/i, "second_serve_points_won"],
  [/^(obronione break pointy|prze[łl]amania obronione|break points saved)$/i, "break_points_saved"],
  [/^(punkty wygrane przy returnie po pierwszym serwisie|1st return points won)$/i, "first_return_points_won"],
  [/^(punkty wygrane przy returnie po drugim serwisie|2nd return points won)$/i, "second_return_points_won"],
  [/^(wykorzystane break pointy|prze[łl]amania zdobyte|break points converted)$/i, "break_points_converted"],
  [/^(zagrania ko[ńn]cz[ąa]ce|winners)$/i, "winners"],
  [/^(b[łl][ęe]dy niewymuszone|unforced errors)$/i, "unforced_errors"],
  [/^(punkty wygrane przy siatce|net points won)$/i, "net_points_won"],
  [/^(punkty wygrane po serwisie|service points won)$/i, "service_points_won"],
  [/^(punkty wygrane po returnie|return points won)$/i, "return_points_won"],
  [/^(wszystkie punkty wygrane|total points won)$/i, "total_points_won"],
  [/^(ostatnie 10 punkt[oó]w|last 10 points)$/i, "last_10_points"],
  [/^(obronione pi[łl]ki meczowe|match points saved)$/i, "match_points_saved"],
  [/^(wygrane gemy serwisowe|service games won)$/i, "service_games_won"],
  [/^(wygrane gemy returnowe|return games won)$/i, "return_games_won"],
  [/^(wszystkie wygrane gemy|total games won)$/i, "total_games_won"],
];

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function slug(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80) || "stat";
}

export function statKey(label: string): string {
  return STAT_KEYS.find(([pattern]) => pattern.test(label.trim()))?.[1] ?? slug(label);
}

function rowValue($: CheerioAPI, row: AnyNode, side: "home" | "away"): string | null {
  const element = $(row);
  const selectors = side === "home"
    ? ".stat__homeValue, [class*='homeValue'], [data-testid*='home-value']"
    : ".stat__awayValue, [class*='awayValue'], [data-testid*='away-value']";
  const value = compact(element.find(selectors).first().text());
  return value || null;
}

function rowCategory($: CheerioAPI, row: AnyNode): string | null {
  const section = $(row).closest("[class*='section'], [class*='group'], [data-testid*='section']");
  const value = compact(section.find(".section__title, .stat__sectionTitle, [class*='sectionTitle'], [class*='headerSection'], [data-testid*='section-title']").first().text());
  return value || null;
}

export function parseMatchStatsHtml(source: string): MatchStat[] {
  const $ = load(source);
  const stats: MatchStat[] = [];
  const rows = $(".stat__row, [class*='statistics__row'], [class*='wcl-row'], [data-testid*='statistics-row'], [data-testid*='wcl-statistics-row']");

  rows.each((_, row) => {
    const element = $(row);
    const label = compact(element.find(".stat__category, [class*='statCategory'], [data-testid*='category'], [class*='category']").first().text());
    if (!label) return;
    const playerAValue = rowValue($, row, "home");
    const playerBValue = rowValue($, row, "away");
    if (playerAValue === null && playerBValue === null) return;
    stats.push({
      key: statKey(label),
      label,
      category: rowCategory($, row),
      playerAValue,
      playerBValue,
    });
  });

  return [...new Map(stats.map((stat) => [`${stat.category ?? ""}:${stat.key}`, stat])).values()];
}
