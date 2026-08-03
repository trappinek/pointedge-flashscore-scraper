import { describe, expect, it } from "vitest";
import { generateSql } from "../src/export-sql.js";
import { prepare } from "../src/prepare.js";
import type { MatchRecord } from "../src/types.js";
it("escapes SQL and is transactional/idempotent", () => {
  const r: MatchRecord = {flashscoreId:"abc12345",flashscoreUrl:"https://www.flashscore.com/match/tennis/a/b/abc12345",date:"2025-01-01T12:00:00Z",tour:"ATP",tournament:"O'Brien Open",round:"Final",surface:"hard",playerA:"O'Brien",playerB:"Test",winner:"home",resultSummary:"6-4 6-4",odds:{home:{bookmaker:"STS",value:1.8},away:{bookmaker:"Betclic",value:2.1}}};
  const sql=generateSql(prepare([r],1));
  expect(sql).toContain("BEGIN;"); expect(sql).toContain("COMMIT;"); expect(sql).toContain("ON CONFLICT"); expect(sql).toContain("O''Brien");
  expect(sql).toContain('"updatedAt"');
  expect(sql).toContain('INSERT INTO "Match"');
  expect(sql).toContain('INSERT INTO "Tip"');
  expect(sql).toContain('INSERT INTO "TipOdds"');
  expect(sql).not.toMatch(/CREATE\s+TABLE/i);
  expect(sql).not.toContain("NOW()");
  expect(sql.match(/'2025-01-01T12:00:00Z'::timestamptz/g)).toHaveLength(4);
});
