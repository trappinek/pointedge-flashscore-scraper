import type { Candidate, MatchRecord } from "./types.js";
import { discoverHistorical } from "./discover.js";
import { ResilientBrowser, scrapeCandidate } from "./scraper.js";
import {
  DATA_FILE,
  envInt,
  isMain,
  logError,
  readJson,
  writeJsonAtomic,
} from "./utils.js";

export interface MonthGap {
  month: string;
  current: number;
  target: number;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const minOdds = Number(process.env.MIN_ODDS ?? 1.5);
const maxOdds = Number(process.env.MAX_ODDS ?? 3.0);

function validDate(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(+new Date(`${value}T00:00:00Z`));
}

export function monthOf(date: string): string | null {
  const match = date.match(/^(\d{4}-\d{2})-\d{2}T/);
  return match?.[1] ?? null;
}

export function monthsBetween(from: string, to: string): string[] {
  if (!validDate(from) || !validDate(to) || from > to) throw new Error("Niepoprawny zakres HISTORY_FROM/HISTORY_TO.");
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = `${to.slice(0, 7)}`;
  const months: string[] = [];
  while (cursor.toISOString().slice(0, 7) <= end) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export function daysInMonth(month: string, from: string, to: string): string[] {
  const first = `${month}-01`;
  const cursor = new Date(`${first}T00:00:00Z`);
  if (Number.isNaN(+cursor)) throw new Error(`Niepoprawny miesiąc: ${month}`);
  const days: string[] = [];
  while (cursor.toISOString().slice(0, 7) === month) {
    const day = cursor.toISOString().slice(0, 10);
    if (day >= from && day <= to) days.push(day);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function countRecordsByMonth(records: MatchRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    const month = monthOf(record.date);
    if (month) counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return counts;
}

export function eligibleForPreparation(record: MatchRecord): boolean {
  return (["home", "away"] as const).some((side) => {
    const value = record.odds[side].value;
    return Number.isFinite(value) && value >= minOdds && value <= maxOdds;
  });
}

export function countEligibleRecordsByMonth(records: MatchRecord[]): Map<string, number> {
  return countRecordsByMonth(records.filter(eligibleForPreparation));
}

export function findMonthGaps(
  records: MatchRecord[],
  from: string,
  to: string,
  target: number,
): MonthGap[] {
  const counts = countEligibleRecordsByMonth(records);
  return monthsBetween(from, to)
    // Regular ATP/WTA main-tour calendars have no December events.
    .filter((month) => !month.endsWith("-12"))
    .map((month) => ({ month, current: counts.get(month) ?? 0, target }))
    .filter((gap) => gap.current < target);
}

function inferRange(records: MatchRecord[]): { from: string; to: string } {
  const dates = records
    .map((record) => record.date.slice(0, 10))
    .filter(validDate)
    .sort();
  const from = process.env.HISTORY_FROM?.trim() || dates[0];
  const to = process.env.HISTORY_TO?.trim() || "2026-07-25";
  if (!validDate(from) || !validDate(to) || from > to) {
    throw new Error(
      "Nie można ustalić zakresu. Ustaw HISTORY_FROM i HISTORY_TO w formacie YYYY-MM-DD.",
    );
  }
  return { from, to };
}

export async function main(): Promise<void> {
  const records = readJson<MatchRecord[]>(DATA_FILE, []);
  if (!records.length) {
    throw new Error(`Brak rekordów w ${DATA_FILE}. Najpierw uruchom npm run scrape.`);
  }

  const { from, to } = inferRange(records);
  const target = Math.max(1, envInt("MIN_RECORDS_PER_MONTH", 15));
  const retries = Math.max(1, envInt("MAX_RETRIES", 3));
  const wait = envInt("SCRAPE_DELAY_MS", 2000);
  const seen = new Set(records.map((record) => record.flashscoreId));
  const manager = new ResilientBrowser();

  const initialGaps = findMonthGaps(records, from, to, target);
  if (!initialGaps.length) {
    console.log(`Każdy miesiąc w zakresie ${from} – ${to} ma co najmniej ${target} rekordów.`);
    return;
  }

  console.log(`Zakres: ${from} – ${to}`);
  console.log(
    `Do uzupełnienia: ${initialGaps.map((gap) => `${gap.month} (${gap.current}/${gap.target})`).join(", ")}`,
  );

  try {
    for (const gap of initialGaps) {
      let current = countEligibleRecordsByMonth(records).get(gap.month) ?? 0;
      console.log(`\n${gap.month}: start ${current}/${target}`);

      const monthDays = daysInMonth(gap.month, from, to);
      const monthFrom = monthDays[0];
      const monthTo = monthDays.at(-1);
      if (!monthFrom || !monthTo) continue;
      let candidates: Candidate[] = [];
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const wanted = Math.max(20, (target - current) * 5);
          candidates = await discoverHistorical(await manager.getPage(), monthFrom, monthTo, wanted);
          break;
        } catch (error) {
          logError(`missing-month ${gap.month} discovery attempt ${attempt}: ${String(error)}`);
          if (/BLOCKED/.test(String(error))) throw error;
          await manager.reset();
        }
      }

      console.log(`${gap.month}: ${candidates.length} kandydatów z archiwów turniejów`);
      for (const candidate of candidates) {
        if (current >= target) break;
        if (seen.has(candidate.flashscoreId)) continue;
        const record = await scrapeCandidate(manager, candidate, retries);
        if (record) {
          records.push(record);
          seen.add(record.flashscoreId);
          writeJsonAtomic(DATA_FILE, records);
          const recordMonth = monthOf(record.date);
          if (recordMonth === gap.month && eligibleForPreparation(record)) current++;
          console.log(
            `saved ${gap.month} ${current}/${target}: ${record.playerA} - ${record.playerB}`,
          );
        }
        await delay(wait);
      }

      if (current < target) {
        console.warn(
          `${gap.month}: znaleziono ${current}/${target}. Sprawdzono dostępne archiwa ATP/WTA.`,
        );
      }
    }
  } finally {
    await manager.close();
  }

  const remaining = findMonthGaps(records, from, to, target);
  console.log(`\nGotowe. Łącznie ${records.length} rekordów w ${DATA_FILE}.`);
  if (remaining.length) {
    console.log(
      `Nadal poniżej celu: ${remaining.map((gap) => `${gap.month} (${gap.current}/${gap.target})`).join(", ")}`,
    );
  } else {
    console.log(`Wszystkie miesiące mają co najmniej ${target} rekordów.`);
  }
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
