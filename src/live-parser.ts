import { load, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { LiveMatch } from "./live-types.js";
import type { Surface, Tour } from "./types.js";

interface EmbeddedMatchDetails {
  startTime: string | null;
  playerAId: string | null;
  playerBId: string | null;
}

function textNodeValue(element: Cheerio<AnyNode>): string {
  const directText = element
    .contents()
    .toArray()
    .find((node) => node.type === "text");
  return directText && "data" in directText ? directText.data.trim() : element.text().trim();
}

function parseEmbeddedMatchDetails(source: string): Map<string, EmbeddedMatchDetails> {
  const details = new Map<string, EmbeddedMatchDetails>();

  for (const chunk of source.split("¬~AA÷").slice(1)) {
    const eventId = chunk.split("¬", 1)[0]?.trim();
    if (!eventId) continue;

    const fields = new Map<string, string>();
    for (const match of chunk.matchAll(/(?:^|¬)([A-Z]{2,3})÷([^¬]*)/g)) {
      fields.set(match[1], match[2]);
    }

    const unixSeconds = Number(fields.get("AD"));
    details.set(eventId, {
      startTime:
        Number.isInteger(unixSeconds) && unixSeconds > 0
          ? new Date(unixSeconds * 1_000).toISOString()
          : null,
      playerAId: fields.get("PX")?.trim() || null,
      playerBId: fields.get("PY")?.trim() || null,
    });
  }

  return details;
}

export interface LiveMatchDetail {
  playerAPhoto: string | null;
  playerBPhoto: string | null;
  round: string | null;
}

export interface LiveH2hDetail {
  playerALastMatches: string[];
  playerBLastMatches: string[];
  headToHead: string[];
}

export function combineDrawAndStage(draw: string, stage: string | null): string {
  const exactStage = stage?.trim();
  if (!exactStage || exactStage.toLocaleLowerCase("pl-PL") === draw.toLocaleLowerCase("pl-PL")) {
    return draw;
  }
  return `${draw} (${exactStage})`;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]/gu, "")
    .toLowerCase();
}

export function parseLiveMatchDetailHtml(
  source: string,
  playerA: string,
  playerB: string,
): LiveMatchDetail {
  const $ = load(source);
  const photos = $(".participant__image")
    .toArray()
    .map((image) => ({
      alt: $(image).attr("alt")?.trim() ?? "",
      src: $(image).attr("src")?.trim() ?? "",
    }))
    .filter(({ src }) => /^https:\/\/static\.flashscore\.com\/res\/image\/data\/.+\.png$/i.test(src));

  const findPhoto = (name: string): string | null => {
    const normalized = normalizeName(name);
    return photos.find(({ alt }) => {
      const normalizedAlt = normalizeName(alt);
      return normalizedAlt === normalized || normalizedAlt.startsWith(normalized) || normalized.startsWith(normalizedAlt);
    })?.src ?? null;
  };

  const breadcrumbs = $(".detail__breadcrumbs").text().replace(/\s+/g, " ").trim();
  const roundMatch = breadcrumbs.match(
    /\s-\s(Finał|Półfinał(?:y)?|Ćwierćfinał(?:y)?|1\/8 finału|1\/16 finału|Runda \d+|Kwalifikacje(?:\s*-\s*runda \d+)?)(?:Nowe okno)?$/i,
  );

  return {
    playerAPhoto: findPhoto(playerA),
    playerBPhoto: findPhoto(playerB),
    round: roundMatch?.[1] ?? null,
  };
}

function compactH2hRow(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\b(Szczegóły|Details)\b/gi, "").trim();
}

function formatH2hRow($: ReturnType<typeof load>, row: AnyNode): string {
  const element = $(row);
  const date = element.find("[data-testid='wcl-stageTime']").first().text().trim();
  const event =
    element.find(".h2h__event").attr("title")?.trim() ??
    element.find(".h2h__event").text().trim();
  const players = element
    .find(".h2h__participant")
    .toArray()
    .map((participant) => compactH2hRow($(participant).text()))
    .filter(Boolean);
  const rawScore = element.find(".h2h__result").text().replace(/\s+/g, "").trim();
  const score = /^\d{2}$/.test(rawScore) ? `${rawScore[0]}–${rawScore[1]}` : rawScore;
  const marker = element.find(".h2h__icon").text().trim().toUpperCase();
  const outcome = marker === "Z" ? "Wygrana" : marker === "P" ? "Przegrana" : "";

  if (players.length < 2) return compactH2hRow(element.text());
  return [date, event, players.join(" vs "), score, outcome].filter(Boolean).join(" · ");
}

export function parseLiveH2hHtml(
  source: string,
  playerA: string,
  playerB: string,
): LiveH2hDetail {
  const $ = load(source);
  const result: LiveH2hDetail = {
    playerALastMatches: [],
    playerBLastMatches: [],
    headToHead: [],
  };
  const normalizedA = normalizeName(playerA);
  const normalizedB = normalizeName(playerB);

  $("[class*='h2h__section'], [class*='h2hSection']").each((_, section) => {
    const container = $(section);
    const heading = compactH2hRow(
      container
        .find("[data-testid='wcl-headerSection-text'], [class*='sectionTitle'], [class*='header']")
        .first()
        .text(),
    );
    const normalizedHeading = normalizeName(heading);
    const rows = container
      .find("[class*='h2h__row'], [class*='h2hRow']")
      .toArray()
      .map((row) => formatH2hRow($, row))
      .filter((row) => row.length > 3)
      .slice(0, 5);

    if (!rows.length) return;
    if (/bezposred|pojedynki|headtohead|h2h/i.test(normalizedHeading)) {
      result.headToHead = rows;
    } else if (normalizedHeading.includes(normalizedA)) {
      result.playerALastMatches = rows;
    } else if (normalizedHeading.includes(normalizedB)) {
      result.playerBLastMatches = rows;
    }
  });

  return result;
}

export function parseRankingHtml(source: string): Map<string, number> {
  const $ = load(source);
  const rankings = new Map<string, number>();

  $(".rankingTable__row").each((_, row) => {
    const link = $(row).find(".rankingTable__href");
    const playerId = link.attr("href")?.match(/\/zawodnik\/[^/]+\/([^/]+)\//)?.[1];
    const rankText = $(row).find(".rankingTable__cell--rank").text().trim();
    const rank = Number(rankText.replace(/\D/g, ""));
    if (playerId && Number.isInteger(rank) && rank > 0) rankings.set(playerId, rank);
  });

  return rankings;
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

function parseVoidReason(
  value: string,
): LiveMatch["voidReason"] {
  if (/po krecz|krecz|retired/i.test(value)) return "retirement";
  if (/walkower/i.test(value)) return "walkover";
  if (/odwołan/i.test(value)) return "cancelled";
  if (/przełożon/i.test(value)) return "postponed";
  if (/anulowan|przerwan|abandoned/i.test(value)) return "abandoned";
  return null;
}

export function parseLiveDayHtml(
  source: string,
  dateStr: string,
  rankings: ReadonlyMap<string, number> = new Map(),
): LiveMatch[] {
  const $ = load(source);
  const matches: LiveMatch[] = [];
  const embeddedDetails = parseEmbeddedMatchDetails(source);

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

        const id = element.attr("id")?.split("_").pop();
        const sourceUrl = element.find(".eventRowLink").attr("href");
        const playerA = element.find(".event__participant--home").text().trim();
        const playerB = element.find(".event__participant--away").text().trim();
        if (!id || !playerA || !playerB || !tournament) return;

        const timeLabel = element.find(".event__time").text().replace(/\s+/g, " ").trim();
        const stageLabel = element.find(".event__stage").text().replace(/\s+/g, " ").trim();
        const isLive = element.hasClass("event__match--live");
        const statusLabel = `${stageLabel} ${timeLabel}`;
        const voidReason = parseVoidReason(`${statusLabel} ${rowText}`);
        const voided = voidReason !== null;
        const isFinished = /Koniec/i.test(statusLabel) || voided;
        const status: LiveMatch["status"] = isFinished ? "finished" : isLive ? "live" : "upcoming";
        const scheduledTime = /^\d{2}:\d{2}$/.test(timeLabel) ? timeLabel : "12:00";
        const result = status === "finished" ? parseResult(element) : null;
        const details = embeddedDetails.get(id);
        const displayedWinner = status === "finished" ? scoreWinner(element) : null;
        const retiredPlayer =
          voidReason === "retirement" && displayedWinner
            ? displayedWinner === "A"
              ? "B"
              : "A"
            : null;

        matches.push({
          externalId: `flashscore:${id}`,
          sourceUrl: sourceUrl ? new URL(sourceUrl, "https://www.flashscore.pl").toString() : undefined,
          playerA,
          playerAPhoto: null,
          playerARank: details?.playerAId ? rankings.get(details.playerAId) ?? null : null,
          playerALastMatches: [],
          playerB,
          playerBPhoto: null,
          playerBRank: details?.playerBId ? rankings.get(details.playerBId) ?? null : null,
          playerBLastMatches: [],
          headToHead: [],
          tournament,
          tour,
          round,
          surface,
          startTime: details?.startTime ?? warsawDateTimeToIso(dateStr, scheduledTime),
          status,
          result,
          winner: status === "finished" && !voided ? displayedWinner : null,
          voided,
          voidReason,
          retiredPlayer,
        });
      });
  });

  return [...new Map(matches.map((match) => [match.externalId, match])).values()].sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.externalId.localeCompare(b.externalId),
  );
}
