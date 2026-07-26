import fs from "node:fs";
import type { PreparedRecord } from "./types.js";
import { READY_FILE, SQL_FILE, isMain, readJson, sqlString, stableId } from "./utils.js";

export function generateSql(rows: PreparedRecord[]): string {
  const statements = rows.map(r => {
    const matchTimestamp = Date.parse(r.date);
    const createdTimestamp = Date.parse(r.createdAt);
    if (!r.date || !r.createdAt || !Number.isFinite(matchTimestamp) || !Number.isFinite(createdTimestamp)) {
      throw new Error(`Invalid historical date for flashscore:${r.flashscoreId}. SQL export aborted.`);
    }
    if (createdTimestamp - matchTimestamp !== 0 || r.createdAt !== r.date) {
      throw new Error(`createdAt must exactly equal matchDate for flashscore:${r.flashscoreId}. SQL export aborted.`);
    }
    const ext = `flashscore:${r.flashscoreId}`, matchId = stableId("match", ext), tipId = stableId("tip", ext), oddsId = stableId("odds", ext);
    const player = r.pick === "home" ? r.playerA : r.playerB;
    return `WITH inserted_match AS (
  INSERT INTO "Match" ("id","tour","tournament","round","surface","playerA","playerB","matchDate","status","resultSummary","externalMatchId","createdAt","updatedAt")
  VALUES (${sqlString(matchId)},${sqlString(r.tour)},${sqlString(r.tournament)},${sqlString(r.round)},${sqlString(r.surface)},${sqlString(r.playerA)},${sqlString(r.playerB)},${sqlString(r.date)}::timestamptz,'finished',${sqlString(r.resultSummary)},${sqlString(ext)},${sqlString(r.createdAt)}::timestamptz,${sqlString(r.createdAt)}::timestamptz)
  ON CONFLICT ("externalMatchId") DO NOTHING RETURNING "id"
), match_row AS (
  SELECT "id" FROM inserted_match UNION ALL SELECT "id" FROM "Match" WHERE "externalMatchId"=${sqlString(ext)} LIMIT 1
), inserted_tip AS (
  INSERT INTO "Tip" ("id","matchId","recommendedBet","reasoning","valuePercent","status","isFeatured","affiliateLink","createdAt")
  SELECT ${sqlString(tipId)},"id",${sqlString(`${player} wygra mecz.`)},${sqlString(r.reasoning)},NULL,${sqlString(r.status)},false,NULL,${sqlString(r.createdAt)}::timestamptz FROM match_row
  WHERE NOT EXISTS (SELECT 1 FROM "Tip" WHERE "matchId"=(SELECT "id" FROM match_row))
  RETURNING "id"
), tip_row AS (
  SELECT "id" FROM inserted_tip UNION ALL SELECT t."id" FROM "Tip" t JOIN match_row m ON t."matchId"=m."id" LIMIT 1
)
INSERT INTO "TipOdds" ("id","tipId","bookmaker","value")
SELECT ${sqlString(oddsId)},"id",${sqlString(r.selectedOdds.bookmaker)},${r.selectedOdds.value} FROM tip_row
WHERE NOT EXISTS (SELECT 1 FROM "TipOdds" WHERE "tipId"=(SELECT "id" FROM tip_row));`;
  });
  return `BEGIN;\n\n${statements.join("\n\n")}\n\nCOMMIT;\n\nSELECT COUNT(*) AS records,\n  COUNT(*) FILTER (WHERE t.\"status\"='won') AS won,\n  COUNT(*) FILTER (WHERE t.\"status\"='lost') AS lost,\n  ROUND(100.0*COUNT(*) FILTER (WHERE t.\"status\"='won')/NULLIF(COUNT(*),0),2) AS hit_rate_percent,\n  ROUND((100.0*SUM(CASE WHEN t.\"status\"='won' THEN o.\"value\"-1 ELSE -1 END)/NULLIF(COUNT(*),0))::numeric,2) AS yield_percent\nFROM \"Match\" m JOIN \"Tip\" t ON t.\"matchId\"=m.\"id\" JOIN \"TipOdds\" o ON o.\"tipId\"=t.\"id\"\nWHERE m.\"externalMatchId\" LIKE 'flashscore:%' AND t.\"reasoning\" LIKE '%[FLASHSCORE_HISTORY_TECH_V1]%';\n`;
}
if (isMain(import.meta.url)) {
  const rows = readJson<PreparedRecord[]>(READY_FILE, []);
  if (!rows.length) throw new Error(`No prepared records in ${READY_FILE}`);
  fs.writeFileSync(SQL_FILE, generateSql(rows), "utf8");
  console.log(`Wrote ${rows.length} records to ${SQL_FILE}`);
}
