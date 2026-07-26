import { load, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { LiveMatch } from "./live-types.js";
import type { Surface, Tour } from "./types.js";

function textNodeValue(element: Cheerio<AnyNode>): string {
  const directText = element
    .contents()
    .toArray()
    .find((node) => node.type === "text");
  return directText && "data" in directText ? directText.data.trim() : element.text().trim();
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return representedAsUtc - date.getTime();
}

export function warsawDateTimeToIso(dateStr: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error(`Niepoprawna data lub godzina meczu: ${dateStr} ${time}`);
  }
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const firstOffset = timeZoneOffsetMs(utcGuess, "Europe/Warsaw");
  const candidate = new Date(utcGuess.getTime() - firstOffset);
  const correctedOffset = timeZoneOffsetMs(candidate, "Europe/Warsaw");
  return new Date(utcGuess.getTime() - correctedOffset).toISOString();
}

function parseSurface(title: string): Surface {
  if (/ziemn/i.test(title)) return "clay";
  if (/traw/i.test(title)) return "grass";
  return "hard";
}

function parseTournament(title: string): string {
  return title
    .replace(/\s*-\s*kwalifikacje.*$/i, "")
    .replace(/,\s*(ziemna|twarda|trawiasta).*$/i, "")
    .trim();
}

function parseResult(
  row: Cheerio<AnyNode>,
): string | null {
  const sets: string[] = [];
  for (let set = 1; set <= 5; set++) {
    const home = textNodeValue(row.find(`.event__part--home.event__part--${set}`));
    const away = textNodeValue(row.find(`.event__part--away.event__part--${set}`));
    if (!/^\d+$/.test(home) || !/^\d+$/.test(away)) continue;
    sets.push(`${home}-${away}`);
  }
  return sets.length ? sets.join(" ") : null;
}

function scoreWinner(
  row: Cheerio<AnyNode>,
): "A" | "B" | null {
  if (row.find(".event__participant--home").hasClass("fontExtraBold")) return "A";
  if (row.find(".event__participant--away").hasClass("fontExtraBold")) return "B";
  const home = Number(row.find(".event__score--home").text().trim());
  const away = Number(row.find(".event__score--away").text().trim());
  if (Number.isFinite(home) && Number.isFinite(away) && home !== away) return home > away ? "A" : "B";
  return null;
}

export function parseLiveDayHtml(source: string, dateStr: string): LiveMatch[] {
  const $ = load(source);
  const matches: LiveMatch[] = [];

  $(".sportName.tennis").each((_, section) => {
    let tour: Tour | null = null;
    let tournament = "";
    let round = "";
    let surface: Surface = "hard";

    $(section)
      .children()
      .each((__, child) => {
        const element = $(child);
        if (element.hasClass("headerLeague__wrapper")) {
          const category = element.find(".headerLeague__category-text").text().replace(/\s+/g, " ").trim();
          tour = category === "ATP - SINGIEL" ? "ATP" : category === "WTA - SINGIEL" ? "WTA" : null;
          const title =
            element.find(".headerLeague__title").attr("title") ??
            element.find(".headerLeague__title-text").text().trim();
          tournament = parseTournament(title);
          round = /kwalifikacje/i.test(title) ? "Kwalifikacje" : "Turniej główny";
          surface = parseSurface(title);
          return;
        }

        if (!tour || element.attr("data-event-row") !== "true") return;
        const rowText = element.text().replace(/\s+/g, " ").trim();
        if (/odwołan|przełożon|anulowan/i.test(rowText)) return;

        const id = element.attr("id")?.split("_").pop();
        const playerA = element.find(".event__participant--home").text().trim();
        const playerB = element.find(".event__participant--away").text().trim();
        if (!id || !playerA || !playerB || !tournament) return;

        const timeLabel = element.find(".event__time").text().replace(/\s+/g, " ").trim();
        const isLive = element.hasClass("event__match--live");
        const isFinished = /^Koniec/i.test(timeLabel) || /walkower/i.test(timeLabel);
        const status: LiveMatch["status"] = isLive ? "live" : isFinished ? "finished" : "upcoming";
        const scheduledTime = /^\d{2}:\d{2}$/.test(timeLabel) ? timeLabel : "12:00";
        const result = status === "finished" ? parseResult(element) : null;

        matches.push({
          externalId: `flashscore:${id}`,
          playerA,
          playerAPhoto: null,
          playerARank: null,
          playerB,
          playerBPhoto: null,
          playerBRank: null,
          tournament,
          tour,
          round,
          surface,
          startTime: warsawDateTimeToIso(dateStr, scheduledTime),
          status,
          result,
          winner: status === "finished" ? scoreWinner(element) : null,
        });
      });
  });

  return [...new Map(matches.map((match) => [match.externalId, match])).values()].sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.externalId.localeCompare(b.externalId),
  );
}
