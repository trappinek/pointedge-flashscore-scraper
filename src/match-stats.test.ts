import { describe, expect, it } from "vitest";
import { parseMatchStatsHtml } from "./match-stats.js";

const row = (label: string, home = "", away = "") => `
  <div class="stat__row">
    <div class="stat__homeValue">${home}</div>
    <div class="stat__category">${label}</div>
    <div class="stat__awayValue">${away}</div>
  </div>`;

describe("parseMatchStatsHtml", () => {
  it("preserves plain numbers, percentages with counts and x/y values", () => {
    const stats = parseMatchStatsHtml(`<section class="stat__section"><h3 class="stat__sectionTitle">Serwis</h3>${row("Asy", "18", "7")}${row("Pierwszy serwis", "66% (38/57)", "61% (34/56)")}${row("Obronione break pointy", "2/6", "4/7")}</section>`);
    expect(stats).toEqual([
      { key: "aces", label: "Asy", category: "Serwis", playerAValue: "18", playerBValue: "7" },
      { key: "first_serve_percentage", label: "Pierwszy serwis", category: "Serwis", playerAValue: "66% (38/57)", playerBValue: "61% (34/56)" },
      { key: "break_points_saved", label: "Obronione break pointy", category: "Serwis", playerAValue: "2/6", playerBValue: "4/7" },
    ]);
  });

  it("keeps a row when one player value is missing", () => {
    expect(parseMatchStatsHtml(row("Asy", "5"))).toEqual([
      { key: "aces", label: "Asy", category: null, playerAValue: "5", playerBValue: null },
    ]);
  });

  it("returns an empty array for an empty statistics tab", () => {
    expect(parseMatchStatsHtml("<div>Brak statystyk</div>")).toEqual([]);
  });
});
