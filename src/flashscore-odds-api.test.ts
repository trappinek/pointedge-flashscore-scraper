import { describe, expect, it, vi } from "vitest";
import { fetchPolishFlashscoreOdds } from "./flashscore-odds-api.js";

describe("fetchPolishFlashscoreOdds", () => {
  it("pobiera tylko bukmacherów z katalogu polskiego Flashscore", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      const bookmakerId = url.searchParams.get("bookmakerId");
      const body = bookmakerId
        ? {
            data: {
              findPrematchOddsForBookmaker: {
                bookmakerId: Number(bookmakerId),
                home: { value: bookmakerId === "165" ? "1.91" : "1.95", active: true },
                away: { value: "2.10", active: true },
              },
            },
          }
        : {
            data: {
              getPrematchOddsBettingTypeMenu: {
                settings: {
                  bookmakers: [
                    { bookmaker: { id: 165, name: "STS.pl" } },
                    { bookmaker: { id: 539, name: "Betclic.pl" } },
                  ],
                },
              },
            },
          };
      return new Response(JSON.stringify(body), { status: 200 });
    });

    await expect(
      fetchPolishFlashscoreOdds({ externalId: "flashscore:QVj3D4Zo" }, fetcher as typeof fetch),
    ).resolves.toEqual([
      { bookmaker: "STS", playerA: 1.91, playerB: 2.1 },
      { bookmaker: "Betclic", playerA: 1.95, playerB: 2.1 },
    ]);

    expect(fetcher).toHaveBeenCalledTimes(3);
    const menuUrl = new URL(String(fetcher.mock.calls[0][0]));
    expect(menuUrl.searchParams.get("geoIpCode")).toBe("PL");
    expect(menuUrl.searchParams.get("geoIpSubdivisionCode")).toBe("PL24");
  });

  it("pomija nieaktywne albo niepełne oferty", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      const body = url.searchParams.has("bookmakerId")
        ? {
            data: {
              findPrematchOddsForBookmaker: {
                home: { value: "1.80", active: false },
                away: { value: "2.00", active: true },
              },
            },
          }
        : {
            data: {
              getPrematchOddsBettingTypeMenu: {
                settings: { bookmakers: [{ bookmaker: { id: 163, name: "eFortuna.pl" } }] },
              },
            },
          };
      return new Response(JSON.stringify(body), { status: 200 });
    });

    await expect(
      fetchPolishFlashscoreOdds({ externalId: "flashscore:test123" }, fetcher as typeof fetch),
    ).resolves.toEqual([{ bookmaker: "Fortuna", playerA: 1.8, playerB: 2 }]);
  });
});
