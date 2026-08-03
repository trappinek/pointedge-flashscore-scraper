import { describe, expect, it } from "vitest";
import { resolveScheduledStartTime } from "./live-parser.js";

describe("resolveScheduledStartTime", () => {
  it("uses the current visible date and time after a match is rescheduled", () => {
    expect(resolveScheduledStartTime("2026-08-03", "18:30", "2026-08-02T14:30:00.000Z")).toBe(
      "2026-08-03T16:30:00.000Z",
    );
  });

  it("keeps the embedded timestamp when a finished row has no visible time", () => {
    expect(resolveScheduledStartTime("2026-08-03", "Koniec", "2026-08-03T16:30:00.000Z")).toBe(
      "2026-08-03T16:30:00.000Z",
    );
  });
});
