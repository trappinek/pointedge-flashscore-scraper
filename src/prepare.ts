import type { MatchRecord, PreparedRecord, Side } from "./types.js";
import { DATA_FILE, READY_FILE, envInt, isMain, readJson, writeJsonAtomic } from "./utils.js";

const MIN_ODDS = Number(process.env.MIN_ODDS ?? 1.8);
const MAX_ODDS = Number(process.env.MAX_ODDS ?? 4.0);
export interface PrepareTargets {
  hitRatePercent: number;
  yieldPercent: number;
}
function allowedOdds(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_ODDS && value <= MAX_ODDS;
}
function valid(r: MatchRecord): boolean {
  return !!r.flashscoreId && /^https:\/\/.+flashscore\./.test(r.flashscoreUrl) &&
    ["ATP", "WTA"].includes(r.tour) && ["hard", "clay", "grass"].includes(r.surface) &&
    !!r.playerA && !!r.playerB && !!r.resultSummary && !Number.isNaN(Date.parse(r.date)) &&
    r.odds.home.value > 1 && r.odds.away.value > 1 &&
    (allowedOdds(r.odds.home.value) || allowedOdds(r.odds.away.value));
}
function validateHistoricalDate(date: string): void {
  const timestamp = Date.parse(date);
  if (!date || !Number.isFinite(timestamp)) {
    throw new Error(`Invalid match date: ${JSON.stringify(date)}. Historical import aborted.`);
  }
}
function balancedPool(records: MatchRecord[], count: number): MatchRecord[] {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date) || a.flashscoreId.localeCompare(b.flashscoreId));
  const buckets = new Map<string, MatchRecord[]>();
  for (const r of sorted) {
    const key = `${r.tour}:${r.date.slice(0, 7)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), r]);
  }
  const output: MatchRecord[] = [];
  const keys = [...buckets.keys()].sort();
  while (output.length < count && keys.some(k => (buckets.get(k)?.length ?? 0) > 0)) {
    for (const key of keys) {
      const next = buckets.get(key)?.shift();
      if (next) output.push(next);
      if (output.length === count) break;
    }
  }
  return output;
}
function choosePicks(records: MatchRecord[], target = 0.07): { picks: Side[]; profit: number } {
  const desired = target * records.length;
  const choices = records.map(r => (["home", "away"] as Side[])
    .filter(side => allowedOdds(r.odds[side].value))
    .map(side => ({ side, profit: side === r.winner ? r.odds[side].value - 1 : -1 }))
    .sort((a, b) => a.profit - b.profit));
  const picks = choices.map(x => x[0].side);
  let profit = choices.reduce((sum, x) => sum + x[0].profit, 0);
  const improvements = choices
    .map((x, i) => ({ i, delta: x.length > 1 ? x[x.length - 1].profit - x[0].profit : 0 }))
    .filter(x => x.delta > 0)
    .sort((a, b) => b.delta - a.delta);
  for (const x of improvements) {
    if (Math.abs(profit + x.delta - desired) <= Math.abs(profit - desired)) {
      profit += x.delta; picks[x.i] = choices[x.i][choices[x.i].length - 1].side;
    }
  }
  for (const x of improvements) {
    const isHigh = picks[x.i] === choices[x.i][choices[x.i].length - 1].side;
    const candidate = profit + (isHigh ? -x.delta : x.delta);
    if (Math.abs(candidate - desired) < Math.abs(profit - desired)) {
      profit = candidate;
      picks[x.i] = isHigh ? choices[x.i][0].side : choices[x.i][choices[x.i].length - 1].side;
    }
  }
  return { picks, profit };
}

function opposite(side: Side): Side {
  return side === "home" ? "away" : "home";
}

function targetedPool(
  records: MatchRecord[],
  count: number,
  targets: PrepareTargets,
): { records: MatchRecord[]; picks: Side[] } {
  const hitRate = targets.hitRatePercent / 100;
  const targetYield = targets.yieldPercent / 100;
  if (!(hitRate > 0 && hitRate < 1) || !Number.isFinite(targetYield)) {
    throw new Error("TARGET_HIT_RATE and TARGET_YIELD must be valid percentages.");
  }

  const winCount = Math.round(count * hitRate);
  const lossCount = count - winCount;
  const targetWinningOddsSum = count * (1 + targetYield);
  const requiredAverageWinningOdds = targetWinningOddsSum / winCount;
  if (requiredAverageWinningOdds < MIN_ODDS || requiredAverageWinningOdds > MAX_ODDS) {
    throw new Error(
      `Targets are mathematically impossible with odds ${MIN_ODDS}-${MAX_ODDS}: ` +
        `${targets.hitRatePercent}% hit rate and ${targets.yieldPercent}% yield require ` +
        `average winning odds ${requiredAverageWinningOdds.toFixed(3)}.`,
    );
  }

  const balanced = balancedPool(records, records.length);
  const order = new Map(balanced.map((record, index) => [record.flashscoreId, index]));
  const winners = records
    .filter((record) => allowedOdds(record.odds[record.winner].value))
    .sort(
      (a, b) =>
        Math.abs(a.odds[a.winner].value - requiredAverageWinningOdds) -
          Math.abs(b.odds[b.winner].value - requiredAverageWinningOdds) ||
        (order.get(a.flashscoreId) ?? 0) - (order.get(b.flashscoreId) ?? 0),
    );
  if (winners.length < winCount) {
    throw new Error(`Need ${winCount} eligible winning picks; found ${winners.length}. Increase HISTORY_POOL.`);
  }

  const selectedWinners = winners.slice(0, winCount);
  const remainingWinners = winners.slice(winCount);
  let winningOddsSum = selectedWinners.reduce(
    (sum, record) => sum + record.odds[record.winner].value,
    0,
  );

  // Zamiany pojedynczych rekordów dopasowują sumę kursów zwycięskich, a więc
  // yield, bez zmiany dokładnej liczby wygranych.
  for (let iteration = 0; iteration < winCount; iteration++) {
    const currentDistance = Math.abs(winningOddsSum - targetWinningOddsSum);
    let best: { selectedIndex: number; remainingIndex: number; sum: number } | null = null;
    let bestDistance = currentDistance;
    for (let selectedIndex = 0; selectedIndex < selectedWinners.length; selectedIndex++) {
      const removed = selectedWinners[selectedIndex].odds[selectedWinners[selectedIndex].winner].value;
      for (let remainingIndex = 0; remainingIndex < remainingWinners.length; remainingIndex++) {
        const added = remainingWinners[remainingIndex].odds[remainingWinners[remainingIndex].winner].value;
        const candidateSum = winningOddsSum - removed + added;
        const distance = Math.abs(candidateSum - targetWinningOddsSum);
        if (distance + 1e-9 < bestDistance) {
          bestDistance = distance;
          best = { selectedIndex, remainingIndex, sum: candidateSum };
        }
      }
    }
    if (!best) break;
    const removed = selectedWinners[best.selectedIndex];
    selectedWinners[best.selectedIndex] = remainingWinners[best.remainingIndex];
    remainingWinners[best.remainingIndex] = removed;
    winningOddsSum = best.sum;
  }

  const winnerIds = new Set(selectedWinners.map((record) => record.flashscoreId));
  const lossCandidates = balanced.filter(
    (record) => !winnerIds.has(record.flashscoreId) && allowedOdds(record.odds[opposite(record.winner)].value),
  );
  if (lossCandidates.length < lossCount) {
    throw new Error(`Need ${lossCount} eligible losing picks; found ${lossCandidates.length}. Increase HISTORY_POOL.`);
  }
  const selectedLosses = balancedPool(lossCandidates, lossCount);
  const pickById = new Map<string, Side>([
    ...selectedWinners.map((record) => [record.flashscoreId, record.winner] as const),
    ...selectedLosses.map((record) => [record.flashscoreId, opposite(record.winner)] as const),
  ]);
  const chosen = balancedPool([...selectedWinners, ...selectedLosses], count);
  const picks = chosen.map((record) => pickById.get(record.flashscoreId)!);
  const achievedProfit = winningOddsSum - count;
  const achievedYield = (achievedProfit / count) * 100;
  if (Math.abs(achievedYield - targets.yieldPercent) > 0.25) {
    throw new Error(
      `Could not reach target yield within 0.25 pp: achieved ${achievedYield.toFixed(2)}%. ` +
        "Increase HISTORY_POOL or widen the odds range.",
    );
  }
  return { records: chosen, picks };
}
function exactSmallSample(records: MatchRecord[], count: number, target = 0.07): { records: MatchRecord[]; picks: Side[] } {
  const desired = target * count;
  let bestDistance = Infinity;
  let bestRecords: MatchRecord[] = [];
  let bestPicks: Side[] = [];
  const chosenRecords: MatchRecord[] = [];
  const chosenPicks: Side[] = [];
  const search = (index: number, profit: number): void => {
    if (chosenRecords.length === count) {
      const distance = Math.abs(profit - desired);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestRecords = [...chosenRecords];
        bestPicks = [...chosenPicks];
      }
      return;
    }
    if (index >= records.length || records.length - index < count - chosenRecords.length) return;
    search(index + 1, profit);
    const record = records[index];
    for (const side of ["home", "away"] as Side[]) {
      if (!allowedOdds(record.odds[side].value)) continue;
      chosenRecords.push(record);
      chosenPicks.push(side);
      search(index + 1, profit + (side === record.winner ? record.odds[side].value - 1 : -1));
      chosenRecords.pop();
      chosenPicks.pop();
    }
  };
  search(0, 0);
  if (bestRecords.length !== count) throw new Error(`Could not build a ${count}-record sample within odds ${MIN_ODDS}-${MAX_ODDS}.`);
  return { records: bestRecords, picks: bestPicks };
}
export function prepare(
  records: MatchRecord[],
  count = 650,
  targets?: PrepareTargets,
): PreparedRecord[] {
  for (const record of records) validateHistoricalDate(record.date);
  const clean = [...new Map(records.filter(valid).map(r => [r.flashscoreId, r])).values()];
  if (clean.length < count) throw new Error(`Need ${count} valid unique records; found ${clean.length}. Run npm run scrape first.`);
  const targeted = targets ? targetedPool(clean, count, targets) : null;
  const exact = !targeted && count <= 7 && clean.length <= 40 ? exactSmallSample(clean, count) : null;
  const chosen = targeted?.records ?? exact?.records ?? balancedPool(clean, count);
  const picks = targeted?.picks ?? exact?.picks ?? choosePicks(chosen).picks;
  return chosen.map((r, i) => {
    validateHistoricalDate(r.date);
    const createdAt = r.date;
    if (Date.parse(createdAt) - Date.parse(r.date) !== 0) {
      throw new Error(`createdAt must equal matchDate for flashscore:${r.flashscoreId}. Historical import aborted.`);
    }
    const pick = picks[i], status = pick === r.winner ? "won" : "lost";
    return { ...r, createdAt, pick, status, selectedOdds: r.odds[pick], reasoning: "[FLASHSCORE_HISTORY_TECH_V1] Techniczny rekord historyczny utworzony retrospektywnie; nie był typem opublikowanym przed meczem." };
  });
}
export function stats(rows: PreparedRecord[]) {
  const won = rows.filter(r => r.status === "won").length, profit = rows.reduce((s, r) => s + (r.status === "won" ? r.selectedOdds.value - 1 : -1), 0);
  return { count: rows.length, won, lost: rows.length - won, hitRate: won / rows.length * 100, profit, yield: profit / rows.length * 100 };
}
if (
  isMain(import.meta.url) &&
  !["install", "ci"].includes(process.env.npm_command ?? "")
) {
  const count = Math.max(1, envInt("PREPARE_COUNT", 650));
  const hitRate = Number(process.env.TARGET_HIT_RATE);
  const targetYield = Number(process.env.TARGET_YIELD);
  const targets =
    Number.isFinite(hitRate) && Number.isFinite(targetYield)
      ? { hitRatePercent: hitRate, yieldPercent: targetYield }
      : undefined;
  const rows = prepare(readJson<MatchRecord[]>(DATA_FILE, []), count, targets);
  writeJsonAtomic(READY_FILE, rows);
  console.log(JSON.stringify(stats(rows), null, 2));
}
