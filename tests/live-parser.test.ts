import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLiveDayHtml, warsawDateTimeToIso } from "../src/live-parser.js";

const fixture = fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "live-day.html"), "utf8");

describe("live Flashscore parser", () => {
  it("keeps only ATP/WTA singles and maps finished, live and upcoming matches", () => {
    const rows = parseLiveDayHtml(fixture, "2026-07-26");
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.externalId)).not.toContain("flashscore:EXCLUDED");

    const finished = rows.find((row) => row.externalId === "flashscore:FINISHED1");
    expect(finished).toMatchObject({
      tour: "ATP",
      status: "finished",
      result: "7-6 6-3",
      winner: "A",
      surface: "clay",
      playerAPhoto: "https://static.flashscore.com/res/image/data/home-player.png",
      playerBPhoto: "https://static.flashscore.com/res/image/data/away-player.png",
    });

    const live = rows.find((row) => row.externalId === "flashscore:LIVEMAT1");
    expect(live).toMatchObject({ tour: "WTA", status: "live", result: null, winner: null });

    const upcoming = rows.find((row) => row.externalId === "flashscore:UPCOMING");
    expect(upcoming).toMatchObject({
      status: "upcoming",
      startTime: "2026-07-26T16:30:00.000Z",
    });
  });

  it("preserves the Warsaw local hour in winter and summer", () => {
    expect(warsawDateTimeToIso("2025-01-16", "06:25")).toBe("2025-01-16T05:25:00.000Z");
    expect(warsawDateTimeToIso("2026-07-26", "18:30")).toBe("2026-07-26T16:30:00.000Z");
  });
});
