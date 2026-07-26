import * as cheerio from "cheerio";
import type { Candidate, MatchRecord, Side, Surface } from "./types.js";
import { normalizeText } from "./utils.js";

function firstText($: cheerio.CheerioAPI, selectors: string[]): string {
  for (const s of selectors) { const t = normalizeText($(s).first().text()); if (t) return t; }
  return "";
}
export function parseMatchHtml(html: string, candidate: Candidate): Omit<MatchRecord, "odds"> | null {
  const $ = cheerio.load(html);
  const playerA = firstText($, [".duelParticipant__home .participant__participantName", ".duelParticipant__home [class*='participantName']", "[class*='home'] [class*='participantName']"]);
  const playerB = firstText($, [".duelParticipant__away .participant__participantName", ".duelParticipant__away [class*='participantName']", "[class*='away'] [class*='participantName']"]);
  const resultSummary = firstText($, [".detailScore__wrapper", "[class*='detailScore']", "[class*='result']"]);
  const status = firstText($, [".detailScore__status", "[class*='status']"]);
  const dateRaw = firstText($, [".duelParticipant__startTime", "[class*='startTime']"]);
  const info = firstText($, [".tournamentHeader__country", "[class*='tournamentHeader']", "[class*='breadcrumb']"]);
  const body = normalizeText($.root().text());
  if (!playerA || !playerB || !/\d/.test(resultSummary) || /cancel|abandon|walkover|awarded|interrupted/i.test(`${status} ${resultSummary}`)) return null;
  const homeWinner = $(".duelParticipant__home [class*='winner'], .duelParticipant__home--winner").length > 0;
  const awayWinner = $(".duelParticipant__away [class*='winner'], .duelParticipant__away--winner").length > 0;
  let winner: Side;
  if (homeWinner !== awayWinner) winner = homeWinner ? "home" : "away";
  else {
    const scores = resultSummary.match(/\d+/g)?.map(Number) ?? [];
    if (scores.length < 2 || scores[0] === scores[1]) return null;
    winner = scores[0] > scores[1] ? "home" : "away";
  }
  const surfaceText = `${info} ${body.match(/(Hard|Clay|Grass)(?:court)?/i)?.[0] ?? ""}`;
  const surface: Surface | null = /clay/i.test(surfaceText) ? "clay" : /grass/i.test(surfaceText) ? "grass" : /hard/i.test(surfaceText) ? "hard" : null;
  if (!surface) return null;
  const round = body.match(/(Final|Semi-finals?|Quarter-finals?|Round of \d+|1\/\d+-finals?)/i)?.[0] ?? "Unknown round";
  const parsedDate = new Date(dateRaw.replace(/(\d{2})\.(\d{2})\.(\d{4})/, "$3-$2-$1"));
  if (Number.isNaN(+parsedDate)) return null;
  return { ...candidate, date: parsedDate.toISOString(), tour: candidate.tourHint, tournament: candidate.tournamentHint || info, round, surface, playerA, playerB, winner, resultSummary };
}
