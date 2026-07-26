import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  combineDrawAndStage,
  parseLiveDayHtml,
  parseLiveH2hHtml,
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
      voidReason: null,
      retiredPlayer: null,
    });

    const live = rows.find((row) => row.externalId === "flashscore:LIVEMAT1");
    expect(live).toMatchObject({
      tour: "WTA",
      status: "live",
      result: null,
      winner: null,
      voided: false,
      voidReason: null,
      retiredPlayer: null,
    });

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

  it("reads both players' recent matches and direct H2H rows", () => {
    const detail = parseLiveH2hHtml(
      `<section class="h2h__section">
         <h3 class="h2h__sectionTitle">Last matches: Player A</h3>
         <a class="h2h__row">25.07 Player A - Rival One 2-0 Win</a>
         <a class="h2h__row">23.07 Rival Two - Player A 1-2 Win</a>
       </section>
       <section class="h2h__section">
         <h3 class="h2h__sectionTitle">Last matches: Player B</h3>
         <a class="h2h__row">25.07 Player B - Rival Three 0-2 Loss</a>
       </section>
       <section class="h2h__section">
         <h3 class="h2h__sectionTitle">Bezpośrednie mecze</h3>
         <a class="h2h__row">2025 Player A - Player B 2-1</a>
       </section>`,
      "Player A",
      "Player B",
    );

    expect(detail).toEqual({
      playerALastMatches: [
        "25.07 Player A - Rival One 2-0 Win",
        "23.07 Rival Two - Player A 1-2 Win",
      ],
      playerBLastMatches: ["25.07 Player B - Rival Three 0-2 Loss"],
      headToHead: ["2025 Player A - Player B 2-1"],
    });
  });

  it("records a retirement reason and identifies the player who retired", () => {
    const retired = parseLiveDayHtml(
      `<div class="sportName tennis">
        <div class="headerLeague__wrapper">
          <span class="headerLeague__category-text">ATP - SINGIEL</span>
          <a class="headerLeague__title" title="Los Cabos (Meksyk), twarda"></a>
        </div>
        <div id="g_2_RETIRE01" data-event-row="true">
          <div class="event__time">Po kreczu</div>
          <div class="event__participant event__participant--home fontExtraBold">Gracz A.</div>
          <div class="event__participant event__participant--away">Gracz B.</div>
          <div class="event__score event__score--home">1</div>
          <div class="event__score event__score--away">0</div>
        </div>
      </div>`,
      "2026-07-26",
    )[0];

    expect(retired).toMatchObject({
      status: "finished",
      winner: null,
      voided: true,
      voidReason: "retirement",
      retiredPlayer: "B",
    });
  });

  it("preserves the Warsaw local hour in winter and summer", () => {
    expect(warsawDateTimeToIso("2025-01-16", "06:25")).toBe("2025-01-16T05:25:00.000Z");
    expect(warsawDateTimeToIso("2026-07-26", "18:30")).toBe("2026-07-26T16:30:00.000Z");
  });
});
