import type { Surface, Tour } from "./types.js";

export interface LiveMatch {
  externalId: string;
  playerA: string;
  playerAPhoto: string | null;
  playerARank: number | null;
  playerB: string;
  playerBPhoto: string | null;
  playerBRank: number | null;
  tournament: string;
  tour: Tour;
  round: string;
  surface: Surface;
  startTime: string;
  status: "upcoming" | "live" | "finished";
  result: string | null;
  winner: "A" | "B" | null;
}

export interface LiveDaySnapshot {
  dateStr: string;
  matches: LiveMatch[];
}
