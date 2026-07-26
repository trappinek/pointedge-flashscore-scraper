export const BOOKMAKERS = ["STS", "Fortuna", "Betclic", "LV BET", "Superbet"] as const;
export type Bookmaker = (typeof BOOKMAKERS)[number];
export type Tour = "ATP" | "WTA";
export type Surface = "hard" | "clay" | "grass";
export type Side = "home" | "away";

export interface Price { bookmaker: Bookmaker; value: number }
export interface MatchRecord {
  flashscoreId: string;
  flashscoreUrl: string;
  date: string;
  tour: Tour;
  tournament: string;
  round: string;
  surface: Surface;
  playerA: string;
  playerB: string;
  winner: Side;
  resultSummary: string;
  odds: { home: Price; away: Price };
}
export interface PreparedRecord extends MatchRecord {
  createdAt: string;
  pick: Side;
  status: "won" | "lost";
  selectedOdds: Price;
  reasoning: string;
}
export interface Candidate {
  flashscoreId: string;
  flashscoreUrl: string;
  tourHint: Tour;
  tournamentHint: string;
}
