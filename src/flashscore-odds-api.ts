import type { LiveBookmakerOdds, LiveMatch } from "./live-types.js";

const ODDS_ENDPOINT = "https://global.ds.lsapp.eu/odds/pq_graphql";
const POLISH_PROJECT_ID = "3";
const POLISH_GEO_IP_CODE = "PL";
const POLISH_SUBDIVISION_CODE = "PL24";
const REQUEST_TIMEOUT_MS = 12_000;

interface MenuBookmaker {
  bookmaker?: {
    id?: number;
    name?: string;
  };
}

interface MenuResponse {
  data?: {
    getPrematchOddsBettingTypeMenu?: {
      settings?: {
        bookmakers?: MenuBookmaker[];
      };
    };
  };
}

interface HomeAwayResponse {
  data?: {
    findPrematchOddsForBookmaker?: {
      bookmakerId?: number;
      home?: { value?: string; active?: boolean } | null;
      away?: { value?: string; active?: boolean } | null;
    } | null;
  };
}

type FetchLike = typeof fetch;

function eventIdOf(match: Pick<LiveMatch, "externalId" | "sourceUrl">): string | null {
  const externalId = match.externalId.replace(/^flashscore:/i, "").trim();
  if (/^[A-Za-z0-9]+$/.test(externalId)) return externalId;

  if (!match.sourceUrl) return null;
  try {
    return new URL(match.sourceUrl).searchParams.get("mid");
  } catch {
    return match.sourceUrl.match(/[?&]mid=([A-Za-z0-9]+)/)?.[1] ?? null;
  }
}

function canonicalBookmakerName(name: string): string {
  const normalized = name.trim();
  const known = new Map([
    ["sts.pl", "STS"],
    ["efortuna.pl", "Fortuna"],
    ["superbet.pl", "Superbet"],
    ["betclic.pl", "Betclic"],
    ["betfan.pl", "BETFAN"],
    ["betters.pl", "betters"],
    ["lvbet.pl", "LV BET"],
    ["lv bet", "LV BET"],
  ]);
  return known.get(normalized.toLocaleLowerCase("pl")) ?? normalized.replace(/\.pl$/i, "");
}

function numericOdd(value: string | undefined, active: boolean | undefined): number | null {
  // `active: false` oznacza ofertę chwilowo niedostępną (przekreśloną),
  // ale Flashscore nadal publikuje jej ostatnią wartość.
  void active;
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 1.01 && parsed <= 100 ? parsed : null;
}

async function fetchJson<T>(fetcher: FetchLike, url: URL): Promise<T> {
  const response = await fetcher(url, {
    headers: {
      accept: "application/json",
      referer: "https://www.flashscore.pl/",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Flashscore odds API HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * Pobiera wyłącznie operatorów zwróconych przez katalog polskiego projektu
 * Flashscore. Dzięki temu nie zależymy od kraju runnera GitHub ani od Tora.
 */
export async function fetchPolishFlashscoreOdds(
  match: Pick<LiveMatch, "externalId" | "sourceUrl">,
  fetcher: FetchLike = fetch,
): Promise<LiveBookmakerOdds[]> {
  const eventId = eventIdOf(match);
  if (!eventId) return [];

  const menuUrl = new URL(ODDS_ENDPOINT);
  menuUrl.searchParams.set("_hash", "pobtm");
  menuUrl.searchParams.set("eventId", eventId);
  menuUrl.searchParams.set("projectId", POLISH_PROJECT_ID);
  menuUrl.searchParams.set("geoIpCode", POLISH_GEO_IP_CODE);
  menuUrl.searchParams.set("geoIpSubdivisionCode", POLISH_SUBDIVISION_CODE);
  const menu = await fetchJson<MenuResponse>(fetcher, menuUrl);
  const bookmakers = menu.data?.getPrematchOddsBettingTypeMenu?.settings?.bookmakers ?? [];

  const offers = await Promise.all(
    bookmakers.map(async (entry): Promise<LiveBookmakerOdds | null> => {
      const bookmakerId = entry.bookmaker?.id;
      const bookmakerName = entry.bookmaker?.name;
      if (!bookmakerId || !bookmakerName) return null;

      try {
        const oddsUrl = new URL(ODDS_ENDPOINT);
        oddsUrl.searchParams.set("_hash", "ope2");
        oddsUrl.searchParams.set("eventId", eventId);
        oddsUrl.searchParams.set("bookmakerId", String(bookmakerId));
        oddsUrl.searchParams.set("betType", "HOME_AWAY");
        oddsUrl.searchParams.set("betScope", "FULL_TIME");
        // Ten endpoint nie dziedziczy geolokalizacji z zapytania o menu.
        // Bez tych parametrów globalny backend rozpoznaje adres runnera
        // GitHub (zwykle USA) i pomija część operatorów dostępnych w Polsce.
        oddsUrl.searchParams.set("projectId", POLISH_PROJECT_ID);
        oddsUrl.searchParams.set("geoIpCode", POLISH_GEO_IP_CODE);
        oddsUrl.searchParams.set("geoIpSubdivisionCode", POLISH_SUBDIVISION_CODE);
        const response = await fetchJson<HomeAwayResponse>(fetcher, oddsUrl);
        const market = response.data?.findPrematchOddsForBookmaker;
        const playerA = numericOdd(market?.home?.value, market?.home?.active);
        const playerB = numericOdd(market?.away?.value, market?.away?.active);
        if (playerA === null || playerB === null) return null;
        return { bookmaker: canonicalBookmakerName(bookmakerName), playerA, playerB };
      } catch (error) {
        console.warn(
          `Pominięto kurs ${bookmakerName} dla ${eventId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    }),
  );

  return offers.filter((offer): offer is LiveBookmakerOdds => offer !== null);
}
