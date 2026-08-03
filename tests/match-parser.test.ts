import { describe, expect, it } from "vitest";
import { parseMatchHtml } from "../src/match-parser.js";

const candidate = {
  flashscoreId: "retired1",
  flashscoreUrl: "https://www.flashscore.com/match/tennis/a/b/retired1",
  tourHint: "ATP" as const,
  tournamentHint: "Test Open",
};

describe("historical match status", () => {
  it("keeps a real retirement as a refundable event", () => {
    const html = `
      <div class="duelParticipant__home duelParticipant__home--winner">
        <span class="participant__participantName">Player A</span>
      </div>
      <div class="duelParticipant__away">
        <span class="participant__participantName">Player B</span>
      </div>
      <div class="detailScore__wrapper">6 4 2 1</div>
      <div class="detailScore__status">Retired</div>
      <div class="duelParticipant__startTime">25.07.2026 14:30</div>
      <div class="tournamentHeader__country">ATP Test - Hard</div>
    `;
    expect(parseMatchHtml(html, candidate)).toMatchObject({
      outcome: "retirement",
      winner: null,
      playerA: "Player A",
      playerB: "Player B",
    });
  });
});
