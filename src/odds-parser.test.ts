import { describe, expect, it } from "vitest";
import { parseAllOddsRows } from "./odds-parser.js";

describe("parseAllOddsRows", () => {
  it("odczytuje rowniez operatorow bez aktywnego linku afiliacyjnego", () => {
    const row = (brand: string, metadata: string, a: string, b: string) => `
      <div class="comparison-item" ${metadata}>
        <div class="logo" style="background-image:url('/logos/${brand}.svg')"></div>
        <div data-analytics-element="ODDS_COMPARISONS_ODD_CELL_1"><span>${a}</span></div>
        <div data-analytics-element="ODDS_COMPARISONS_ODD_CELL_2"><span>${b}</span></div>
      </div>`;
    const html = row("betfan", "", "1.98", "1.77")
      + row("betters", "aria-label='betters'", "2.00", "1.71")
      + row("lv-bet", "data-bookmaker='LV BET'", "2.07", "1.77");

    expect(parseAllOddsRows(html)).toEqual([
      { bookmaker: "BETFAN", playerA: 1.98, playerB: 1.77 },
      { bookmaker: "betters", playerA: 2, playerB: 1.71 },
      { bookmaker: "LV BET", playerA: 2.07, playerB: 1.77 },
    ]);
  });
});
