import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  combineDrawAndStage,
  parseLiveDayHtml,
  parseLiveMatchDetailHtml,
  warsawDateTimeToIso,
} from "../src/live-parser.js";

const fixture = fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "live-day.html"), "utf8");

describe("live Flashscore parser", () => {
  it("keeps only ATP/WTA singles and maps finished, live and upcoming matches", () => {
    const rows = parseLiveDayHtml(
      fixture,
      "2026-07-26",
      new Map([
        ["HOME123", 12],
        ["AWAY456", 34],
      ]),
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.externalId)).not.toContain("flashscore:EXCLUDED");

    const finished = rows.find((row) => row.externalId === "flashscore:FINISHED1");
    expect(finished).toMatchObject({
      tour: "ATP",
      status: "finished",
      result: "7-6 6-3",
      winner: "A",
      surface: "clay",
      playerAPhoto: null,
      playerBPhoto: null,
      playerARank: 12,
      playerBRank: 34,
      voided: false,
    });

    const live = rows.find((row) => row.externalId === "flashscore:LIVEMAT1");
    expect(live).toMatchObject({ tour: "WTA", status: "live", result: null, winner: null, voided: false });

    const upcoming = rows.find((row) => row.externalId === "flashscore:UPCOMING");
    expect(upcoming).toMatchObject({
      status: "upcoming",
      startTime: "2026-07-26T16:30:00.000Z",
    });
  });

  it("reads real player photos and the tournament stage from match details", () => {
    const detail = parseLiveMatchDetailHtml(
      `<div class="detail__breadcrumbs">Tenis ATP - SINGIEL Estoril, ziemna - Finał</div>
       <img class="participant__image" alt="van Assche L." src="https://static.flashscore.com/res/image/data/real-home.png">
       <img class="participant__image" alt="Blockx A." src="https://static.flashscore.com/res/image/data/real-away.png">`,
      "van Assche L.",
      "Blockx A.",
    );

    expect(detail).toEqual({
      playerAPhoto: "https://static.flashscore.com/res/image/data/real-home.png",
      playerBPhoto: "https://static.flashscore.com/res/image/data/real-away.png",
      round: "Finał",
    });
  });

  it("keeps the draw type while adding the exact tournament stage", () => {
    expect(combineDrawAndStage("Kwalifikacje", "Finał")).toBe("Kwalifikacje (Finał)");
    expect(combineDrawAndStage("Turniej główny", "Ćwierćfinał")).toBe(
      "Turniej główny (Ćwierćfinał)",
    );
    expect(combineDrawAndStage("Kwalifikacje", null)).toBe("Kwalifikacje");
  });

  it("preserves the Warsaw local hour in winter and summer", () => {
    expect(warsawDateTimeToIso("2025-01-16", "06:25")).toBe("2025-01-16T05:25:00.000Z");
    expect(warsawDateTimeToIso("2026-07-26", "18:30")).toBe("2026-07-26T16:30:00.000Z");
  });
});
