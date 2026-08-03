import type { Surface, Tour } from "./types.js";

export interface LiveMatch {
  externalId: string;
  sourceUrl?: string;
  playerA: string;
  playerAPhoto: string | null;
  playerARank: number | null;
  playerALastMatches: string[];
  playerB: string;
  playerBPhoto: string | null;
  playerBRank: number | null;
  playerBLastMatches: string[];
  headToHead: string[];
  tournament: string;
  tour: Tour;
  round: string;
  surface: Surface;
  startTime: string;
  status: "upcoming" | "live" | "finished";
  result: string | null;
  winner: "A" | "B" | null;
  voided: boolean;
  voidReason: "retirement" | "walkover" | "cancelled" | "postponed" | "abandoned" | null;
  retiredPlayer: "A" | "B" | null;
  odds: LiveBookmakerOdds[];
}

export interface LiveBookmakerOdds {
  bookmaker: string;
  playerA: number;
  playerB: number;
}

export interface LiveDaySnapshot {
  dateStr: string;
  matches: LiveMatch[];
}
