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
  it("parses modern Flashscore bookmaker links without stable row classes", () => {
    const html = `
      <main>
        <div class="ui-table__row">
          <div data-analytics-element="ODDS_COMPARISONS_BOOKMAKER_CELL">
            <a href="/bookmaker/165/?from=odds-comparison&amp;gicc=PL&amp;gisc=PL24#" title="STS.pl"><img alt="STS.pl" /></a>
          </div>
          <a class="oddsCell__odd" data-analytics-element="ODDS_COMPARISONS_ODD_CELL_2">3.00</a>
          <a class="oddsCell__odd" data-analytics-element="ODDS_COMPARISONS_ODD_CELL_2">1.37</a>
        </div>
        <div class="ui-table__row">
          <div data-analytics-element="ODDS_COMPARISONS_BOOKMAKER_CELL">
            <a href="/bookmaker/539/?from=odds-comparison&amp;gicc=PL&amp;gisc=PL24#" title="Betclic.pl"></a>
          </div>
          <a class="oddsCell__odd">2.83</a><a class="oddsCell__odd">1.42</a>
        </div>
      </main>`;

    expect(parseAllOddsRows(html)).toEqual([
      { bookmaker: "STS", playerA: 3, playerB: 1.37 },
      { bookmaker: "Betclic", playerA: 2.83, playerB: 1.42 },
    ]);
  });
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

  it("rejects offers from a non-Polish Flashscore catalogue", () => {
    const html = `<div class="ui-table__row" data-analytics-element="ODDS_COMPARISONS_INTERACTIVE_ROW">
      <div data-analytics-element="ODDS_COMPARISONS_BOOKMAKER_CELL">
        <a href="/bookmaker/999/?from=odds-comparison&amp;gicc=US&amp;gisc=US#" title="DraftKings"></a>
      </div>
      <a class="oddsCell__odd">1.91</a><a class="oddsCell__odd">2.02</a>
    </div>`;
    expect(parseAllOddsRows(html)).toEqual([]);
  });

  it("accepts a known Polish operator when GitHub strips geo parameters", () => {
    const html = `<div class="ui-table__row">
      <div data-analytics-element="ODDS_COMPARISONS_BOOKMAKER_CELL">
        <a href="/bookmaker/165/?from=odds-comparison#" title="STS"></a>
      </div>
      <a class="oddsCell__odd">2.42</a><a class="oddsCell__odd">1.55</a>
    </div>`;
    expect(parseAllOddsRows(html)).toEqual([
      { bookmaker: "STS", playerA: 2.42, playerB: 1.55 },
    ]);
  });
});
