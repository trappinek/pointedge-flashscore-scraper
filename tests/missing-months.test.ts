import { describe, expect, it } from "vitest";
import {
  countRecordsByMonth,
  daysInMonth,
  findMonthGaps,
  monthsBetween,
} from "../src/missing-months.js";
import type { MatchRecord } from "../src/types.js";

function record(id: string, date: string): MatchRecord {
  return {
    flashscoreId: id,
    flashscoreUrl: `https://www.flashscore.com/match/tennis/${id}`,
    date,
    tour: "ATP",
    tournament: "Test",
    round: "Final",
    surface: "hard",
    playerA: "A",
    playerB: "B",
    winner: "home",
    resultSummary: "2-0",
    odds: {
      home: { bookmaker: "STS", value: 1.9 },
      away: { bookmaker: "STS", value: 2.1 },
    },
  };
}

describe("uzupełnianie brakujących miesięcy", () => {
  it("wykrywa miesiące nieobecne i zbyt słabo obsadzone", () => {
    const rows = [
      record("a", "2023-01-10T12:00:00.000Z"),
      record("b", "2023-03-10T12:00:00.000Z"),
      record("c", "2023-03-11T12:00:00.000Z"),
    ];

    expect(findMonthGaps(rows, "2023-01-01", "2023-03-31", 2)).toEqual([
      { month: "2023-01", current: 1, target: 2 },
      { month: "2023-02", current: 0, target: 2 },
    ]);
  });

  it("tworzy pełną listę miesięcy i respektuje częściowy zakres dni", () => {
    expect(monthsBetween("2023-11-15", "2024-02-02")).toEqual([
      "2023-11",
      "2023-12",
      "2024-01",
      "2024-02",
    ]);
    expect(daysInMonth("2024-02", "2024-02-27", "2024-03-02")).toEqual([
      "2024-02-27",
      "2024-02-28",
      "2024-02-29",
    ]);
  });

  it("liczy rekordy według rzeczywistej daty ISO", () => {
    const counts = countRecordsByMonth([
      record("a", "2025-06-30T23:59:59.000Z"),
      record("b", "2025-07-01T00:00:00.000Z"),
    ]);
    expect(Object.fromEntries(counts)).toEqual({ "2025-06": 1, "2025-07": 1 });
  });
  it("pomija grudzień bez regularnych turniejów ATP/WTA", () => {
    expect(findMonthGaps([], "2024-12-01", "2024-12-31", 15)).toEqual([]);
  });

  it("liczy do minimum tylko rekordy z kursem możliwym do przygotowania", () => {
    const outside = record("outside", "2025-04-10T12:00:00.000Z");
    outside.odds.home.value = 1.2;
    outside.odds.away.value = 4.5;
    expect(findMonthGaps([outside], "2025-04-01", "2025-04-30", 1)).toEqual([
      { month: "2025-04", current: 0, target: 1 },
    ]);
  });
});
