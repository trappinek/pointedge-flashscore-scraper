import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseOddsRows } from "../src/odds-parser.js";
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
