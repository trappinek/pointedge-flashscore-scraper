import { describe, expect, it } from "vitest";
import { prepare, stats } from "../src/prepare.js";
import type { MatchRecord } from "../src/types.js";
const sample = (i: number): MatchRecord => ({ flashscoreId:`id${i}`,flashscoreUrl:`https://www.flashscore.com/match/tennis/a/b/id${i}`,date:`2025-${String(i%12+1).padStart(2,"0")}-01T12:00:00.000Z`,tour:i%2?"ATP":"WTA",tournament:`T${i%9}`,round:"Final",surface:["hard","clay","grass"][i%3] as MatchRecord["surface"],playerA:`A${i}`,playerB:`B${i}`,winner:i%2?"home":"away",resultSummary:"2 0",odds:{home:{bookmaker:"STS",value:1.8+(i%7)/100},away:{bookmaker:"Betclic",value:2.1+(i%5)/100}}});
describe("prepare", () => {
  it("deduplicates, creates exact count and labels retrospective picks", () => {
    const out = prepare(Array.from({length:20},(_,i)=>sample(i)), 10);
    expect(out).toHaveLength(10);
    expect(new Set(out.map(x=>x.flashscoreId)).size).toBe(10);
    expect(out.every(x=>x.reasoning.includes("[FLASHSCORE_HISTORY_TECH_V1]"))).toBe(true);
    expect(out.every(x=>x.createdAt === x.date && Date.parse(x.createdAt) - Date.parse(x.date) === 0)).toBe(true);
    expect(Number.isFinite(stats(out).yield)).toBe(true);
  });
  it("preserves the exact match timestamp as createdAt", () => {
    const row = sample(1);
    row.date = "2025-01-16T06:25:00Z";
    const [out] = prepare([row], 1);
    expect(out.date).toBe("2025-01-16T06:25:00Z");
    expect(out.createdAt).toBe("2025-01-16T06:25:00Z");
    expect((Date.parse(out.createdAt) - Date.parse(out.date)) / 1000).toBe(0);
  });
  it("aborts preparation when a match date is invalid", () => {
    const row = sample(1);
    row.date = "not-a-date";
    expect(() => prepare([row], 1)).toThrow(/Invalid match date.*Historical import aborted/);
  });
  it("supports a five-record trial", () => {
    const out = prepare(Array.from({length:8},(_,i)=>sample(i)), 5);
    expect(out).toHaveLength(5);
  });
  it("never selects odds outside 1.80-4.00", () => {
    const rows = Array.from({length:8},(_,i)=>sample(i));
    rows[0].odds.home.value = 1.2;
    rows[0].odds.away.value = 5.5;
    const out = prepare(rows, 5);
    expect(out.every(x => x.selectedOdds.value >= 1.8 && x.selectedOdds.value <= 4)).toBe(true);
    expect(out.some(x => x.flashscoreId === "id0")).toBe(false);
  });
});
