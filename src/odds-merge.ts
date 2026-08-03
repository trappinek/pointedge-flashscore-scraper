import type { LiveBookmakerOdds } from "./live-types.js";

function bookmakerKey(name: string): string {
  return name.toLocaleLowerCase("pl").replace(/[^a-z0-9ąćęłńóśźż]+/gi, "");
}

/**
 * API Flashscore zwraca przede wszystkim aktywne oferty. Tabela HTML zawiera
 * dodatkowo ostatnie, przekreślone kursy pozostałych polskich operatorów.
 * Scalamy oba źródła, zachowując świeższą wartość z API przy duplikacie.
 */
export function mergeBookmakerOdds(
  apiOdds: LiveBookmakerOdds[],
  tableOdds: LiveBookmakerOdds[],
): LiveBookmakerOdds[] {
  const merged = new Map<string, LiveBookmakerOdds>();
  for (const offer of tableOdds) merged.set(bookmakerKey(offer.bookmaker), offer);
  for (const offer of apiOdds) merged.set(bookmakerKey(offer.bookmaker), offer);
  return [...merged.values()];
}
