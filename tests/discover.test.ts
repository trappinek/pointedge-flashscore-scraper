import { describe, expect, it } from "vitest";
import {
  seasonFromTexts,
  tournamentResultUrls,
  type TournamentSource,
} from "../src/discover.js";

const delray: TournamentSource = {
  tour: "ATP",
  slug: "delray-beach",
  name: "Delray Beach",
  months: [2],
};

describe("tournament result URLs", () => {
  it("checks the no-year alias first for the current season", () => {
    expect(tournamentResultUrls(delray, 2026, 2026)).toEqual([
      {
        url: "https://www.flashscore.com/tennis/atp-singles/delray-beach/results/",
        latestEdition: true,
      },
      {
        url: "https://www.flashscore.com/tennis/atp-singles/delray-beach-2026/results/",
        latestEdition: false,
      },
    ]);
  });

  it("checks the archived URL first and can fall back to the latest edition", () => {
    expect(tournamentResultUrls(delray, 2025, 2026)).toEqual([
      {
        url: "https://www.flashscore.com/tennis/atp-singles/delray-beach-2025/results/",
        latestEdition: false,
      },
      {
        url: "https://www.flashscore.com/tennis/atp-singles/delray-beach/results/",
        latestEdition: true,
      },
    ]);
  });
});

describe("season detection", () => {
  it("reads the displayed tournament season", () => {
    expect(seasonFromTexts(["ATP Delray Beach", "2026", "Results"])).toBe(2026);
  });

  it("does not invent a season when the page does not show one", () => {
    expect(seasonFromTexts(["ATP Delray Beach", "Latest Scores"])).toBeNull();
  });
});
