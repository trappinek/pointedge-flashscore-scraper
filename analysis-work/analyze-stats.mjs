import fs from "node:fs/promises";
import { Workbook } from "@oai/artifact-tool";

const sourcePath = "C:/Users/dcxml/Downloads/pointedge-statystyki(6).csv";
const csvText = await fs.readFile(sourcePath, "utf8");
const workbook = await Workbook.fromCSV(csvText, { sheetName: "Statystyki" });
const sheet = workbook.worksheets.getItem("Statystyki");
const rows = sheet.getUsedRange(true).values.slice(1).map((row, sourceIndex) => ({
  sourceIndex,
  date: String(row[0] ?? ""),
  match: String(row[1] ?? ""),
  tournament: String(row[2] ?? ""),
  pick: String(row[3] ?? ""),
  odds: Number(row[4]),
  result: String(row[5] ?? "").toLowerCase(),
})).filter((row) => row.date && Number.isFinite(row.odds));

rows.sort((a, b) => a.date.localeCompare(b.date) || a.sourceIndex - b.sourceIndex);

const won = rows.filter((r) => r.result === "wygrany");
const lost = rows.filter((r) => r.result === "przegrany");
const refunded = rows.filter((r) => r.result === "zwrot");
const settled = [...won, ...lost];
const profit = rows.reduce((sum, r) => {
  if (r.result === "wygrany") return sum + r.odds - 1;
  if (r.result === "przegrany") return sum - 1;
  return sum;
}, 0);

function summarize(group) {
  const gWon = group.filter((r) => r.result === "wygrany").length;
  const gLost = group.filter((r) => r.result === "przegrany").length;
  const gRefund = group.filter((r) => r.result === "zwrot").length;
  const gSettled = gWon + gLost;
  const gProfit = group.reduce((sum, r) => r.result === "wygrany"
    ? sum + r.odds - 1
    : r.result === "przegrany" ? sum - 1 : sum, 0);
  return {
    count: group.length,
    won: gWon,
    lost: gLost,
    refunded: gRefund,
    hitRate: gSettled ? 100 * gWon / gSettled : 0,
    avgOdds: group.length ? group.reduce((s, r) => s + r.odds, 0) / group.length : 0,
    profit: gProfit,
    yield: group.length ? 100 * gProfit / group.length : 0,
  };
}

const bins = [
  ["1.80–1.99", 1.8, 2],
  ["2.00–2.19", 2, 2.2],
  ["2.20–2.39", 2.2, 2.4],
  ["2.40–2.59", 2.4, 2.6],
  ["2.60–2.79", 2.6, 2.8],
  ["2.80–3.00", 2.8, 3.001],
].map(([label, min, max]) => ({
  label,
  ...summarize(rows.filter((r) => r.odds >= min && r.odds < max)),
}));

const exactOdds = [...new Set(rows.map((r) => r.odds))].sort((a, b) => a - b).map((odds) => ({
  odds,
  ...summarize(rows.filter((r) => r.odds === odds)),
}));

const runs = [];
let current = null;
for (const row of rows) {
  if (row.result !== "wygrany" && row.result !== "przegrany") continue;
  if (!current || current.result !== row.result) {
    current = { result: row.result, length: 1, start: row.date, end: row.date, rows: [row] };
    runs.push(current);
  } else {
    current.length += 1;
    current.end = row.date;
    current.rows.push(row);
  }
}
const winRuns = runs.filter((r) => r.result === "wygrany");
const lossRuns = runs.filter((r) => r.result === "przegrany");
const maxWin = winRuns.reduce((best, run) => run.length > (best?.length ?? 0) ? run : best, null);
const maxLoss = lossRuns.reduce((best, run) => run.length > (best?.length ?? 0) ? run : best, null);

function runCounts(runList) {
  const counts = {};
  for (const run of runList) counts[run.length] = (counts[run.length] ?? 0) + 1;
  return counts;
}

const months = new Map();
for (const row of rows) {
  const key = row.date.slice(0, 7);
  if (!months.has(key)) months.set(key, []);
  months.get(key).push(row);
}

const tournaments = new Map();
for (const row of rows) {
  if (!tournaments.has(row.tournament)) tournaments.set(row.tournament, []);
  tournaments.get(row.tournament).push(row);
}

console.log(JSON.stringify({
  period: { from: rows[0]?.date, to: rows.at(-1)?.date },
  overall: summarize(rows),
  flatStakeProfit: profit,
  bins,
  exactOdds,
  streaks: {
    longestWin: maxWin && { length: maxWin.length, start: maxWin.start, end: maxWin.end, matches: maxWin.rows.map((r) => `${r.date} | ${r.odds.toFixed(2)} | ${r.match}`) },
    longestLoss: maxLoss && { length: maxLoss.length, start: maxLoss.start, end: maxLoss.end, matches: maxLoss.rows.map((r) => `${r.date} | ${r.odds.toFixed(2)} | ${r.match}`) },
    winRunCounts: runCounts(winRuns),
    lossRunCounts: runCounts(lossRuns),
    totalRuns: runs.length,
    resultTransitions: Math.max(0, runs.length - 1),
  },
  months: [...months].map(([month, group]) => ({ month, ...summarize(group) })),
  tournaments: [...tournaments].map(([tournament, group]) => ({ tournament, ...summarize(group) })).sort((a, b) => b.count - a.count),
}, null, 2));
