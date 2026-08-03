import { describe, expect, it } from "vitest";
import { mergeBookmakerOdds } from "./odds-merge.js";

describe("mergeBookmakerOdds", () => {
  it("uzupełnia aktywne kursy API o przekreślone oferty z tabeli", () => {
    expect(
      mergeBookmakerOdds(
        [
          { bookmaker: "STS", playerA: 1.8, playerB: 2.25 },
          { bookmaker: "Fortuna", playerA: 1.86, playerB: 2.18 },
          { bookmaker: "Superbet", playerA: 1.8, playerB: 2.3 },
          { bookmaker: "Betclic", playerA: 1.76, playerB: 2.31 },
        ],
        [
          { bookmaker: "STS", playerA: 1.79, playerB: 2.24 },
          { bookmaker: "BETFAN", playerA: 1.8, playerB: 2.25 },
          { bookmaker: "betters", playerA: 1.77, playerB: 2.23 },
          { bookmaker: "LV BET", playerA: 1.85, playerB: 2.27 },
        ],
      ),
    ).toEqual([
      { bookmaker: "STS", playerA: 1.8, playerB: 2.25 },
      { bookmaker: "BETFAN", playerA: 1.8, playerB: 2.25 },
      { bookmaker: "betters", playerA: 1.77, playerB: 2.23 },
      { bookmaker: "LV BET", playerA: 1.85, playerB: 2.27 },
      { bookmaker: "Fortuna", playerA: 1.86, playerB: 2.18 },
      { bookmaker: "Superbet", playerA: 1.8, playerB: 2.3 },
      { bookmaker: "Betclic", playerA: 1.76, playerB: 2.31 },
    ]);
  });
});
