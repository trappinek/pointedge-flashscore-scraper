import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAllOddsRows, parseOddsRows } from "../src/odds-parser.js";
describe("parseOddsRows", () => {
  it("selects the highest allowed price independently for both sides", () => {
    const html = fs.readFileSync(new URL("./fixtures/odds.html", import.meta.url), "utf8");
    expect(parseOddsRows(html)).toEqual({ home: { bookmaker: "Fortuna", value: 1.9 }, away: { bookmaker: "Betclic", value: 2.15 } });
  });
  it("ignores bookmakers outside the allow-list", () => {
    expect(parseOddsRows(`<div class="oddsRow">Other 9.00 9.00</div>`)).toBeNull();
  });
  it("parses the current Flashscore bookmaker-id row structure", () => {
    const html = fs.readFileSync(new URL("./fixtures/flashscore-odds-current.html", import.meta.url), "utf8");
    expect(parseOddsRows(html)).toEqual({
      home: { bookmaker: "STS", value: 1.36 },
      away: { bookmaker: "Fortuna", value: 3.4 }
    });
  });
});

describe("parseAllOddsRows", () => {
  it("returns every Polish bookmaker offer instead of only the maximum", () => {
    const html = fs.readFileSync(new URL("./fixtures/odds.html", import.meta.url), "utf8");
    expect(parseAllOddsRows(html)).toEqual([
      { bookmaker: "STS", playerA: 1.85, playerB: 2.1 },
      { bookmaker: "Fortuna", playerA: 1.9, playerB: 2.05 },
      { bookmaker: "Betclic", playerA: 1.88, playerB: 2.15 },
    ]);
  });

  it("accepts a new Polish operator explicitly labelled with a .pl domain", () => {
    const html = `<div class="oddsRow"><a title="NowyBuk.pl"></a><span data-testid="wcl-oddsValue">1.91</span><span data-testid="wcl-oddsValue">2.02</span></div>`;
    expect(parseAllOddsRows(html)).toEqual([
      { bookmaker: "NowyBuk", playerA: 1.91, playerB: 2.02 },
    ]);
  });
});
