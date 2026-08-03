import type { MatchOutcome, MatchRecord, PreparedRecord, Side } from "./types.js";
import { DATA_FILE, READY_FILE, envInt, isMain, readJson, writeJsonAtomic } from "./utils.js";

const MIN_ODDS = Number(process.env.MIN_ODDS ?? 1.5);
const MAX_ODDS = Number(process.env.MAX_ODDS ?? 3.0);
const MAX_WIN_STREAK = Number(process.env.MAX_WIN_STREAK ?? 12);
const MAX_LOSS_STREAK = Number(process.env.MAX_LOSS_STREAK ?? 6);

export interface PrepareTargets {
  hitRatePercent: number;
  yieldPercent: number;
}

function allowedOdds(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_ODDS && value <= MAX_ODDS;
}

function outcomeOf(record: MatchRecord): MatchOutcome {
  return record.outcome ?? "completed";
}

function valid(record: MatchRecord): boolean {
  const outcome = outcomeOf(record);
  return (
    !!record.flashscoreId &&
    /^https:\/\/.+flashscore\./.test(record.flashscoreUrl) &&
    ["ATP", "WTA"].includes(record.tour) &&
    ["hard", "clay", "grass"].includes(record.surface) &&
    !!record.playerA &&
    !!record.playerB &&
    !!record.resultSummary &&
    !Number.isNaN(Date.parse(record.date)) &&
    record.odds.home.value > 1 &&
    record.odds.away.value > 1 &&
    (outcome !== "completed" || record.winner !== null) &&
    (allowedOdds(record.odds.home.value) || allowedOdds(record.odds.away.value))
  );
}

function validateHistoricalDate(date: string): void {
  const timestamp = Date.parse(date);
  if (!date || !Number.isFinite(timestamp)) {
    throw new Error(`Invalid match date: ${JSON.stringify(date)}. Historical import aborted.`);
  }
}

function chronological(a: MatchRecord, b: MatchRecord): number {
  return a.date.localeCompare(b.date) || a.flashscoreId.localeCompare(b.flashscoreId);
}

function choosePreMatchSide(record: MatchRecord): Side {
  const eligible = (["home", "away"] as Side[])
    .filter((side) => allowedOdds(record.odds[side].value))
    .sort(
      (a, b) =>
        record.odds[a].value - record.odds[b].value ||
        a.localeCompare(b),
    );
  if (!eligible.length) {
    throw new Error(`No eligible pre-match odds for flashscore:${record.flashscoreId}.`);
  }
  // Transparent rule: take the lower-priced eligible player. The winner and
  // final score are deliberately not consulted when choosing the side.
  return eligible[0];
}

function eligibleSides(record: MatchRecord): Side[] {
  return (["home", "away"] as Side[]).filter((side) => allowedOdds(record.odds[side].value));
}

function sideForStatus(record: MatchRecord, status: "won" | "lost"): Side | undefined {
  return eligibleSides(record).find((side) =>
    status === "won" ? side === record.winner : side !== record.winner,
  );
}

function stableFraction(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 0x100000000;
}

function evenlySelect<T>(items: T[], count: number): T[] {
  if (count >= items.length) return [...items];
  if (count <= 0) return [];
  const selected: T[] = [];
  for (let index = 0; index < count; index += 1) {
    selected.push(items[Math.floor(((index + 0.5) * items.length) / count)]);
  }
  return selected;
}

function monthsBetween(from: string, to: string): string[] {
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(+cursor) || Number.isNaN(+end) || cursor > end) {
    throw new Error("Invalid HISTORY_FROM/HISTORY_TO.");
  }
  const months: string[] = [];
  while (cursor <= end) {
    // There are no regular ATP/WTA main-tour events in December.
    if (cursor.getUTCMonth() !== 11) months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function expectedMonths(records: MatchRecord[]): string[] {
  const dates = records.map((record) => record.date.slice(0, 10)).sort();
  const from = process.env.HISTORY_FROM?.trim() || dates[0];
  const to = process.env.HISTORY_TO?.trim() || dates.at(-1);
  if (!from || !to) return [];
  return monthsBetween(from, to);
}

function selectMonthlyPool(
  records: MatchRecord[],
  count: number,
  minimumPerMonth: number,
): MatchRecord[] {
  const sorted = [...records].sort(chronological);
  const buckets = new Map<string, MatchRecord[]>();
  for (const record of sorted) {
    const month = record.date.slice(0, 7);
    buckets.set(month, [...(buckets.get(month) ?? []), record]);
  }

  const months = minimumPerMonth > 0
    ? expectedMonths(sorted)
    : [...buckets.keys()].sort();
  const missing = months
    .map((month) => ({ month, count: buckets.get(month)?.length ?? 0 }))
    .filter((item) => item.count < minimumPerMonth);
  if (missing.length) {
    throw new Error(
      `Not enough eligible records for monthly coverage: ${missing
        .map((item) => `${item.month} (${item.count}/${minimumPerMonth})`)
        .join(", ")}. Run npm run scrape:missing first.`,
    );
  }
  if (minimumPerMonth * months.length > count) {
    throw new Error(
      `PREPARE_COUNT=${count} is too small for ${months.length} months x ` +
      `${minimumPerMonth} records. Use at least ${minimumPerMonth * months.length}.`,
    );
  }

  const chosen: MatchRecord[] = [];
  const chosenIds = new Set<string>();
  for (const month of months) {
    for (const record of (buckets.get(month) ?? []).slice(0, minimumPerMonth)) {
      chosen.push(record);
      chosenIds.add(record.flashscoreId);
    }
  }

  const remaining = new Map<string, MatchRecord[]>();
  for (const month of months) {
    remaining.set(
      month,
      (buckets.get(month) ?? []).filter((record) => !chosenIds.has(record.flashscoreId)),
    );
  }
  while (chosen.length < count && months.some((month) => (remaining.get(month)?.length ?? 0) > 0)) {
    for (const month of months) {
      const next = remaining.get(month)?.shift();
      if (next) chosen.push(next);
      if (chosen.length === count) break;
    }
  }
  if (chosen.length < count) {
    throw new Error(`Need ${count} eligible unique records; found ${chosen.length}.`);
  }
  return chosen.sort(chronological);
}

function monthlyQuotas(
  buckets: Map<string, MatchRecord[]>,
  months: string[],
  count: number,
  minimumPerMonth: number,
): Map<string, number> {
  const quotas = new Map(months.map((month) => [month, minimumPerMonth]));
  let remaining = count - minimumPerMonth * months.length;
  while (remaining > 0) {
    let progressed = false;
    for (const month of months) {
      const quota = quotas.get(month) ?? 0;
      if (quota < (buckets.get(month)?.length ?? 0)) {
        quotas.set(month, quota + 1);
        remaining -= 1;
        progressed = true;
        if (remaining === 0) break;
      }
    }
    if (!progressed) break;
  }
  if (remaining > 0) {
    throw new Error(`Need ${count} eligible unique records; monthly pool is short by ${remaining}.`);
  }
  return quotas;
}

interface DemoAssignment {
  record: MatchRecord;
  month: string;
  fixed?: "won" | "lost";
  winSide?: Side;
  lossSide?: Side;
  winOdds?: number;
  lossOdds?: number;
}

function longestStreak(statuses: ("won" | "lost")[], wanted: "won" | "lost"): number {
  let longest = 0;
  let current = 0;
  for (const status of statuses) {
    current = status === wanted ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function targetedDemoPool(
  records: MatchRecord[],
  count: number,
  targets: PrepareTargets,
  minimumPerMonth: number,
): PreparedRecord[] {
  const sorted = [...records].sort(chronological);
  const buckets = new Map<string, MatchRecord[]>();
  for (const record of sorted) {
    const month = record.date.slice(0, 7);
    buckets.set(month, [...(buckets.get(month) ?? []), record]);
  }
  const months = minimumPerMonth > 0 ? expectedMonths(sorted) : [...buckets.keys()].sort();
  const missing = months.filter((month) => (buckets.get(month)?.length ?? 0) < minimumPerMonth);
  if (missing.length) {
    throw new Error(
      `Not enough eligible records for monthly coverage: ${missing
        .map((month) => `${month} (${buckets.get(month)?.length ?? 0}/${minimumPerMonth})`)
        .join(", ")}. Run npm run scrape:missing first.`,
    );
  }
  if (minimumPerMonth * months.length > count) {
    throw new Error(
      `PREPARE_COUNT=${count} is too small for ${months.length} months x ${minimumPerMonth} records.`,
    );
  }

  const quotas = monthlyQuotas(buckets, months, count, minimumPerMonth);
  const allRefunds = sorted.filter((record) => outcomeOf(record) !== "completed");
  const desiredRefunds = Math.min(allRefunds.length, Math.max(1, Math.round(count * 0.025)));
  const refundIds = new Set(evenlySelect(allRefunds, desiredRefunds).map((record) => record.flashscoreId));
  const selected: MatchRecord[] = [];

  for (const month of months) {
    const quota = quotas.get(month) ?? 0;
    const bucket = buckets.get(month) ?? [];
    const refunds = bucket.filter((record) => refundIds.has(record.flashscoreId));
    const completed = bucket.filter((record) => outcomeOf(record) === "completed");
    const flexible = completed.filter(
      (record) => sideForStatus(record, "won") && sideForStatus(record, "lost"),
    );
    const fixed = completed.filter(
      (record) => !(sideForStatus(record, "won") && sideForStatus(record, "lost")),
    );
    const needed = quota - refunds.length;
    const flexibleTake = Math.min(needed, flexible.length);
    const monthRows = [
      ...refunds,
      ...evenlySelect(flexible, flexibleTake),
      ...evenlySelect(fixed, needed - flexibleTake),
    ];
    if (monthRows.length !== quota) {
      throw new Error(`Could not allocate ${quota} demonstration records for ${month}.`);
    }
    selected.push(...monthRows);
  }

  const settledRows = selected
    .filter((record) => outcomeOf(record) === "completed")
    .sort(chronological);
  const assignments: DemoAssignment[] = settledRows.map((record) => {
    const winSide = sideForStatus(record, "won");
    const lossSide = sideForStatus(record, "lost");
    return {
      record,
      month: record.date.slice(0, 7),
      fixed: winSide && lossSide ? undefined : winSide ? "won" : "lost",
      winSide,
      lossSide,
      winOdds: winSide ? record.odds[winSide].value : undefined,
      lossOdds: lossSide ? record.odds[lossSide].value : undefined,
    };
  });

  const settled = assignments.length;
  const desiredWins = Math.round((settled * targets.hitRatePercent) / 100);
  const fixedWins = assignments.filter((entry) => entry.fixed === "won");
  const flexible = assignments.filter((entry) => !entry.fixed);
  const flexibleWinsNeeded = desiredWins - fixedWins.length;
  if (flexibleWinsNeeded < 0 || flexibleWinsNeeded > flexible.length) {
    throw new Error(
      `Target hit rate is unavailable: need ${desiredWins} wins, but fixed choices allow ` +
      `${fixedWins.length}-${fixedWins.length + flexible.length}.`,
    );
  }

  const targetWinOddsSum = settled * (1 + targets.yieldPercent / 100);
  const fixedWinOddsSum = fixedWins.reduce((sum, entry) => sum + (entry.winOdds ?? 0), 0);
  const flexibleTarget = targetWinOddsSum - fixedWinOddsSum;
  const targetAverage = flexibleWinsNeeded ? flexibleTarget / flexibleWinsNeeded : 0;
  const ranked = [...flexible].sort((a, b) => {
    const probabilityA = Math.max(0.35, Math.min(0.78, 0.78 - ((a.winOdds ?? 1.5) - 1.5) * 0.24));
    const probabilityB = Math.max(0.35, Math.min(0.78, 0.78 - ((b.winOdds ?? 1.5) - 1.5) * 0.24));
    return (
      stableFraction(a.record.flashscoreId) / probabilityA -
        stableFraction(b.record.flashscoreId) / probabilityB ||
      a.record.flashscoreId.localeCompare(b.record.flashscoreId)
    );
  });
  const winningIds = new Set(
    ranked.slice(0, flexibleWinsNeeded).map((entry) => entry.record.flashscoreId),
  );
  const statusOf = (entry: DemoAssignment): "won" | "lost" =>
    entry.fixed ?? (winningIds.has(entry.record.flashscoreId) ? "won" : "lost");
  const currentFlexibleSum = () =>
    flexible.reduce(
      (sum, entry) => sum + (winningIds.has(entry.record.flashscoreId) ? entry.winOdds ?? 0 : 0),
      0,
    );

  for (let iteration = 0; iteration < assignments.length; iteration += 1) {
    const difference = flexibleTarget - currentFlexibleSum();
    let best:
      | { remove: DemoAssignment; add: DemoAssignment; improvement: number }
      | undefined;
    const winners = flexible.filter((entry) => winningIds.has(entry.record.flashscoreId));
    const losers = flexible.filter((entry) => !winningIds.has(entry.record.flashscoreId));
    for (const remove of winners) {
      for (const add of losers) {
        const nextDifference = difference - ((add.winOdds ?? 0) - (remove.winOdds ?? 0));
        const improvement = Math.abs(difference) - Math.abs(nextDifference);
        if (improvement > (best?.improvement ?? 0) + 1e-9) best = { remove, add, improvement };
      }
    }
    if (!best) break;
    winningIds.delete(best.remove.record.flashscoreId);
    winningIds.add(best.add.record.flashscoreId);
  }

  const monthBounds = (month: string) => {
    const entries = assignments.filter((entry) => entry.month === month);
    return {
      entries,
      minimum: Math.max(1, Math.floor(entries.length * 0.25)),
      maximum: Math.min(entries.length - 1, Math.ceil(entries.length * 0.8)),
    };
  };
  const canSwap = (winner: DemoAssignment, loser: DemoAssignment): boolean => {
    if (winner.fixed || loser.fixed) return false;
    // Exchanging opposite results inside one month preserves that month's
    // result mix, so it is safe from the monthly-coverage perspective.
    if (winner.month === loser.month) return true;
    const winnerBounds = monthBounds(winner.month);
    const loserBounds = monthBounds(loser.month);
    const winnerMonthWins = winnerBounds.entries.filter((entry) => statusOf(entry) === "won").length;
    const loserMonthWins = loserBounds.entries.filter((entry) => statusOf(entry) === "won").length;
    return (
      winnerMonthWins - 1 >= winnerBounds.minimum &&
      loserMonthWins + 1 <= loserBounds.maximum
    );
  };

  for (let guard = 0; guard < assignments.length; guard += 1) {
    const broken = months
      .map((month) => ({ month, ...monthBounds(month) }))
      .find(({ entries, minimum, maximum }) => {
        const wins = entries.filter((entry) => statusOf(entry) === "won").length;
        return wins < minimum || wins > maximum;
      });
    if (!broken) break;
    const wins = broken.entries.filter((entry) => statusOf(entry) === "won").length;
    const needWin = wins < broken.minimum;
    const local = broken.entries.filter(
      (entry) => !entry.fixed && statusOf(entry) === (needWin ? "lost" : "won"),
    );
    const remote = assignments.filter(
      (entry) =>
        !entry.fixed &&
        entry.month !== broken.month &&
        statusOf(entry) === (needWin ? "won" : "lost"),
    );
    let bestPair: { local: DemoAssignment; remote: DemoAssignment; cost: number } | undefined;
    for (const localEntry of local) {
      for (const remoteEntry of remote) {
        const winner = needWin ? remoteEntry : localEntry;
        const loser = needWin ? localEntry : remoteEntry;
        if (!canSwap(winner, loser)) continue;
        const cost = Math.abs((localEntry.winOdds ?? targetAverage) - (remoteEntry.winOdds ?? targetAverage));
        if (cost < (bestPair?.cost ?? Number.POSITIVE_INFINITY)) {
          bestPair = { local: localEntry, remote: remoteEntry, cost };
        }
      }
    }
    if (!bestPair) throw new Error(`Could not create a realistic monthly result mix for ${broken.month}.`);
    const localWasWin = statusOf(bestPair.local) === "won";
    if (localWasWin) {
      winningIds.delete(bestPair.local.record.flashscoreId);
      winningIds.add(bestPair.remote.record.flashscoreId);
    } else {
      winningIds.add(bestPair.local.record.flashscoreId);
      winningIds.delete(bestPair.remote.record.flashscoreId);
    }
  }

  const assignmentStatuses = () => assignments.map(statusOf);
  const streaksAreValid = () =>
    longestStreak(assignmentStatuses(), "won") <= MAX_WIN_STREAK &&
    longestStreak(assignmentStatuses(), "lost") <= MAX_LOSS_STREAK;

  for (let guard = 0; guard < assignments.length && !streaksAreValid(); guard += 1) {
    const statuses = assignmentStatuses();
    const wanted =
      longestStreak(statuses, "won") > MAX_WIN_STREAK ? "won" : "lost";
    const limit = wanted === "won" ? MAX_WIN_STREAK : MAX_LOSS_STREAK;
    let start = 0;
    let runStart = -1;
    for (let index = 0; index <= statuses.length; index += 1) {
      if (statuses[index] === wanted) {
        if (runStart < 0) runStart = index;
      } else if (runStart >= 0) {
        if (index - runStart > limit) {
          start = runStart;
          break;
        }
        runStart = -1;
      }
    }
    const run = assignments.slice(start, start + limit + 1).filter((entry) => !entry.fixed);
    const opposite = assignments.filter(
      (entry) => !entry.fixed && statusOf(entry) !== wanted && !run.includes(entry),
    );
    let swapped = false;
    for (const local of run.sort(
      (a, b) => Math.abs((a.winOdds ?? 0) - targetAverage) - Math.abs((b.winOdds ?? 0) - targetAverage),
    )) {
      const candidates = [...opposite].sort(
        (a, b) =>
          Math.abs((a.winOdds ?? 0) - (local.winOdds ?? 0)) -
          Math.abs((b.winOdds ?? 0) - (local.winOdds ?? 0)),
      );
      for (const remote of candidates) {
        const winner = wanted === "won" ? local : remote;
        const loser = wanted === "won" ? remote : local;
        if (!canSwap(winner, loser)) continue;
        winningIds.delete(winner.record.flashscoreId);
        winningIds.add(loser.record.flashscoreId);
        swapped = true;
        break;
      }
      if (swapped) break;
    }
    if (!swapped) throw new Error("Could not enforce demonstration streak limits.");
  }

  for (let iteration = 0; iteration < assignments.length; iteration += 1) {
    const difference = flexibleTarget - currentFlexibleSum();
    if (Math.abs((difference / settled) * 100) <= 0.05) break;
    const pairs: { winner: DemoAssignment; loser: DemoAssignment; error: number }[] = [];
    const winners = flexible.filter((entry) => winningIds.has(entry.record.flashscoreId));
    const losers = flexible.filter((entry) => !winningIds.has(entry.record.flashscoreId));
    for (const winner of winners) {
      for (const loser of losers) {
        if (!canSwap(winner, loser)) continue;
        const delta = (loser.winOdds ?? 0) - (winner.winOdds ?? 0);
        pairs.push({ winner, loser, error: Math.abs(difference - delta) });
      }
    }
    pairs.sort((a, b) => a.error - b.error);
    let accepted = false;
    for (const pair of pairs.slice(0, 500)) {
      const before = Math.abs(difference);
      const delta = (pair.loser.winOdds ?? 0) - (pair.winner.winOdds ?? 0);
      if (Math.abs(difference - delta) >= before) continue;
      winningIds.delete(pair.winner.record.flashscoreId);
      winningIds.add(pair.loser.record.flashscoreId);
      if (streaksAreValid()) {
        accepted = true;
        break;
      }
      winningIds.delete(pair.loser.record.flashscoreId);
      winningIds.add(pair.winner.record.flashscoreId);
    }
    if (!accepted) break;
  }

  // Shape the demonstration sample so that success falls gradually as the
  // selected price increases. Swaps preserve the overall number of wins and
  // must stay close to the requested total yield.
  const bands = [
    { from: 1.5, to: 1.7, target: 0.68 },
    { from: 1.7, to: 1.9, target: 0.63 },
    { from: 1.9, to: 2.1, target: 0.6 },
    { from: 2.1, to: 2.3, target: 0.55 },
    { from: 2.3, to: 2.5, target: 0.5 },
    { from: 2.5, to: 3.001, target: 0.38 },
  ];
  const bandIndex = (odds: number): number =>
    Math.max(0, bands.findIndex((band) => odds >= band.from && odds < band.to));
  const distribution = () => {
    const totals = bands.map(() => 0);
    const wins = bands.map(() => 0);
    for (const entry of assignments) {
      const won = statusOf(entry) === "won";
      const odds = won ? entry.winOdds : entry.lossOdds;
      if (!odds) continue;
      const index = bandIndex(odds);
      totals[index] += 1;
      if (won) wins[index] += 1;
    }
    return { totals, wins };
  };
  const distributionPenalty = (totals: number[], wins: number[]): number => {
    let penalty = 0;
    for (let index = 0; index < bands.length; index += 1) {
      const difference = wins[index] - totals[index] * bands[index].target;
      penalty += (difference * difference) / Math.max(1, totals[index]);
      if (index > 0 && totals[index - 1] && totals[index]) {
        const previousRate = wins[index - 1] / totals[index - 1];
        const rate = wins[index] / totals[index];
        if (rate > previousRate) penalty += (rate - previousRate) * 20;
      }
    }
    return penalty;
  };
  const yieldErrorPp = () =>
    Math.abs(((fixedWinOddsSum + currentFlexibleSum() - targetWinOddsSum) / settled) * 100);
  const objective = () => {
    const current = distribution();
    return distributionPenalty(current.totals, current.wins) + yieldErrorPp();
  };

  for (let iteration = 0; iteration < assignments.length; iteration += 1) {
    const currentObjective = objective();
    const currentDistribution = distribution();
    const currentFlexibleOdds = currentFlexibleSum();
    const candidates: { winner: DemoAssignment; loser: DemoAssignment; objective: number }[] = [];
    const winners = flexible.filter((entry) => winningIds.has(entry.record.flashscoreId));
    const losers = flexible.filter((entry) => !winningIds.has(entry.record.flashscoreId));
    for (const winner of winners) {
      for (const loser of losers) {
        if (!canSwap(winner, loser)) continue;
        const totals = [...currentDistribution.totals];
        const wins = [...currentDistribution.wins];
        const winnerWinBand = bandIndex(winner.winOdds ?? 1.5);
        const winnerLossBand = bandIndex(winner.lossOdds ?? 1.5);
        const loserLossBand = bandIndex(loser.lossOdds ?? 1.5);
        const loserWinBand = bandIndex(loser.winOdds ?? 1.5);
        totals[winnerWinBand] -= 1;
        wins[winnerWinBand] -= 1;
        totals[winnerLossBand] += 1;
        totals[loserLossBand] -= 1;
        totals[loserWinBand] += 1;
        wins[loserWinBand] += 1;
        const nextFlexibleOdds =
          currentFlexibleOdds - (winner.winOdds ?? 0) + (loser.winOdds ?? 0);
        const nextYieldError =
          Math.abs(((fixedWinOddsSum + nextFlexibleOdds - targetWinOddsSum) / settled) * 100);
        const nextObjective =
          distributionPenalty(totals, wins) + nextYieldError;
        if (nextYieldError <= 2 && nextObjective + 1e-9 < currentObjective) {
          candidates.push({ winner, loser, objective: nextObjective });
        }
      }
    }
    candidates.sort((a, b) => a.objective - b.objective);
    let accepted = false;
    for (const candidate of candidates.slice(0, 500)) {
      winningIds.delete(candidate.winner.record.flashscoreId);
      winningIds.add(candidate.loser.record.flashscoreId);
      if (streaksAreValid()) {
        accepted = true;
        break;
      }
      winningIds.delete(candidate.loser.record.flashscoreId);
      winningIds.add(candidate.winner.record.flashscoreId);
    }
    if (!accepted) break;
  }

  const reasoning =
    "[FLASHSCORE_HISTORY_DEMO_V2] Dane demonstracyjne: scenariusz historyczny utworzony " +
    "z zakończonych meczów Flashscore. Wybór strony wykorzystuje znany wynik historyczny " +
    "i nie jest typem opublikowanym przed rozpoczęciem meczu.";
  const choiceById = new Map<string, Side>();
  for (const entry of assignments) {
    const status = statusOf(entry);
    const pick = status === "won" ? entry.winSide : entry.lossSide;
    if (!pick) throw new Error(`Missing ${status} side for flashscore:${entry.record.flashscoreId}.`);
    choiceById.set(entry.record.flashscoreId, pick);
  }
  for (const record of selected.filter((row) => outcomeOf(row) !== "completed")) {
    choiceById.set(record.flashscoreId, choosePreMatchSide(record));
  }

  const prepared = selected.sort(chronological).map((record): PreparedRecord => {
    validateHistoricalDate(record.date);
    const pick = choiceById.get(record.flashscoreId);
    if (!pick) throw new Error(`Missing demonstration pick for flashscore:${record.flashscoreId}.`);
    const status =
      outcomeOf(record) !== "completed" ? "refunded" : pick === record.winner ? "won" : "lost";
    return {
      ...record,
      createdAt: record.date,
      pick,
      status,
      selectedOdds: record.odds[pick],
      reasoning,
    };
  });
  const result = stats(prepared);
  if (Math.abs(result.hitRate - targets.hitRatePercent) > 0.25) {
    throw new Error(
      `Could not reach target hit rate within 0.25 pp: achieved ${result.hitRate.toFixed(2)}%.`,
    );
  }
  if (Math.abs(result.yield - targets.yieldPercent) > 0.5) {
    throw new Error(
      `Could not reach target yield within 0.50 pp: achieved ${result.yield.toFixed(2)}%.`,
    );
  }
  if (!streaksAreValid()) throw new Error("Generated demonstration streaks exceed configured limits.");
  return prepared;
}

export function prepare(
  records: MatchRecord[],
  count = 650,
  targets?: PrepareTargets,
  minimumPerMonth = 0,
): PreparedRecord[] {
  for (const record of records) validateHistoricalDate(record.date);
  const clean = [
    ...new Map(records.filter(valid).map((record) => [record.flashscoreId, record])).values(),
  ];
  if (clean.length < count) {
    throw new Error(`Need ${count} valid unique records; found ${clean.length}. Run npm run scrape first.`);
  }

  if (targets) return targetedDemoPool(clean, count, targets, minimumPerMonth);

  const chosen = selectMonthlyPool(clean, count, minimumPerMonth);
  return chosen.map((record) => {
    validateHistoricalDate(record.date);
    const createdAt = record.date;
    if (Date.parse(createdAt) - Date.parse(record.date) !== 0) {
      throw new Error(
        `createdAt must equal matchDate for flashscore:${record.flashscoreId}. Historical import aborted.`,
      );
    }
    const pick = choosePreMatchSide(record);
    const outcome = outcomeOf(record);
    const status =
      outcome === "completed"
        ? pick === record.winner ? "won" : "lost"
        : "refunded";
    return {
      ...record,
      createdAt,
      pick,
      status,
      selectedOdds: record.odds[pick],
      reasoning:
        "[FLASHSCORE_HISTORY_BACKTEST_V1] Historyczny backtest jawnej reguły przedmeczowej: " +
        "wybrano niższy dostępny kurs bez użycia końcowego wyniku. Zwrot pochodzi wyłącznie " +
        "z rzeczywistego statusu meczu.",
    };
  });
}

export function stats(rows: PreparedRecord[]) {
  const won = rows.filter((record) => record.status === "won").length;
  const lost = rows.filter((record) => record.status === "lost").length;
  const refunded = rows.filter((record) => record.status === "refunded").length;
  const settled = won + lost;
  const profit = rows.reduce(
    (sum, record) =>
      sum + (record.status === "won" ? record.selectedOdds.value - 1 : record.status === "lost" ? -1 : 0),
    0,
  );
  return {
    count: rows.length,
    won,
    lost,
    refunded,
    hitRate: settled ? (won / settled) * 100 : 0,
    profit,
    yield: settled ? (profit / settled) * 100 : 0,
  };
}

if (isMain(import.meta.url) && !["install", "ci"].includes(process.env.npm_command ?? "")) {
  const count = Math.max(1, envInt("PREPARE_COUNT", 700));
  const minimumPerMonth = Math.max(0, envInt("MIN_PREPARED_PER_MONTH", 15));
  const requestedTarget = process.env.TARGET_HIT_RATE || process.env.TARGET_YIELD;
  const targets = requestedTarget
    ? {
        hitRatePercent: Number(process.env.TARGET_HIT_RATE ?? 60),
        yieldPercent: Number(process.env.TARGET_YIELD ?? 11),
      }
    : undefined;
  if (targets && (!Number.isFinite(targets.hitRatePercent) || !Number.isFinite(targets.yieldPercent))) {
    throw new Error("TARGET_HIT_RATE and TARGET_YIELD must be finite numbers.");
  }
  const rows = prepare(readJson<MatchRecord[]>(DATA_FILE, []), count, targets, minimumPerMonth);
  writeJsonAtomic(READY_FILE, rows);
  const result = stats(rows);
  const settledStatuses = rows
    .filter((row) => row.status !== "refunded")
    .map((row) => row.status as "won" | "lost");
  console.log(JSON.stringify({
    ...result,
    longestWinStreak: longestStreak(settledStatuses, "won"),
    longestLossStreak: longestStreak(settledStatuses, "lost"),
    mode: targets ? "clearly-labelled-demonstration-scenario" : "transparent-pre-match-backtest",
  }, null, 2));
}
