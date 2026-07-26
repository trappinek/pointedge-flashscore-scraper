import * as cheerio from "cheerio";
import { BOOKMAKERS, type Bookmaker, type Price } from "./types.js";
import { normalizeText } from "./utils.js";

export interface OddsResult { home: Price; away: Price }
const alias = new Map<string, Bookmaker>(BOOKMAKERS.map(b => [normalizeText(b).toLowerCase(), b]));
const bookmakerIds = new Map<string, Bookmaker>([
  ["165", "STS"], ["163", "Fortuna"], ["539", "Betclic"], ["591", "Superbet"]
]);

export function parseOddsRows(html: string): OddsResult | null {
  const $ = cheerio.load(html);
  const candidates: Array<{ bookmaker: Bookmaker; home: number; away: number }> = [];
  $("tr, [class*='oddsRow'], [class*='bookmaker'], [data-testid*='bookmaker'], [data-analytics-element='ODDS_COMPARISONS_INTERACTIVE_ROW']").each((_, el) => {
    const tokens = $(el).find("*").map((__, child) => normalizeText($(child).clone().children().remove().end().text())).get().filter(Boolean);
    const text = normalizeText([normalizeText($(el).clone().children().remove().end().text()), ...tokens].join(" "));
    const attrId = $(el).attr("data-analytics-bookmaker-id") ??
      $(el).find("[data-analytics-bookmaker-id]").first().attr("data-analytics-bookmaker-id");
    const label = `${text} ${$(el).find("a[title], img[alt]").map((__, x) => `${$(x).attr("title") ?? ""} ${$(x).attr("alt") ?? ""}`).get().join(" ")}`;
    const name = (attrId ? bookmakerIds.get(attrId) : undefined) ??
      [...alias].find(([key]) => new RegExp(`(^|\\s)${key.replace(" ", "\\s+")}(?=\\s|\\.|\\d|$)`, "i").test(label))?.[1];
    if (!name) return;
    const oddsText = $(el).find("[data-testid='wcl-oddsValue']").map((__, x) => normalizeText($(x).text())).get().join(" ") || text;
    const nums = oddsText.match(/(?<![\d.])\d{1,2}[.,]\d{2}(?!\d)/g)?.map(x => Number(x.replace(",", "."))) ?? [];
    const plausible = nums.filter(n => n >= 1.01 && n <= 100);
    if (plausible.length === 2) candidates.push({ bookmaker: name, home: plausible[0], away: plausible[1] });
  });
  const unique = [...new Map(candidates.map(x => [x.bookmaker, x])).values()];
  if (!unique.length) return null;
  const home = unique.reduce((a, b) => b.home > a.home ? b : a);
  const away = unique.reduce((a, b) => b.away > a.away ? b : a);
  return { home: { bookmaker: home.bookmaker, value: home.home }, away: { bookmaker: away.bookmaker, value: away.away } };
}
