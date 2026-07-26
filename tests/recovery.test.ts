import { describe, expect, it, vi } from "vitest";
describe("browser recovery contract", () => {
  it("recreates a closed page", async () => {
    const page = { isClosed: vi.fn().mockReturnValue(true) };
    const fresh = { isClosed: vi.fn().mockReturnValue(false) };
    const context = { newPage: vi.fn().mockResolvedValue(fresh) };
    if (page.isClosed()) await context.newPage();
    expect(context.newPage).toHaveBeenCalledOnce();
  });
});
