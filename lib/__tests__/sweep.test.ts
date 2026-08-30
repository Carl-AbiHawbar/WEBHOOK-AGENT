import { describe, it, expect, vi } from "vitest";
import { sweepTrades } from "../sweep";
import type { PlaceResult } from "../types";

function place(id: string, overrides: Partial<PlaceResult> = {}): PlaceResult {
  return {
    id,
    displayName: { text: `Business ${id}` },
    formattedAddress: "1 Main St",
    userRatingCount: 50,
    rating: 4.5,
    businessStatus: "OPERATIONAL",
    ...overrides,
  };
}

describe("sweepTrades", () => {
  it("searches every trade it is given", async () => {
    const search = vi.fn().mockResolvedValue({ places: [], requestsUsed: 1 });
    await sweepTrades(["barber", "plumber", "roofer"], search);

    expect(search).toHaveBeenCalledTimes(3);
    expect(search.mock.calls.map((c) => c[0])).toEqual(["barber", "plumber", "roofer"]);
  });

  it("counts one business once when several trades return it", async () => {
    const search = vi.fn(async (trade: string) =>
      trade === "barber"
        ? { places: [place("shared"), place("only-barber")], requestsUsed: 1 }
        : { places: [place("shared")], requestsUsed: 1 },
    );

    const result = await sweepTrades(["barber", "hair salon"], search);

    expect(result.leads).toHaveLength(2);
    expect(result.leads.map((l) => l.id).sort()).toEqual(["only-barber", "shared"]);
  });

  it("sums billed requests across every trade", async () => {
    const search = vi.fn().mockResolvedValue({ places: [], requestsUsed: 3 });
    const result = await sweepTrades(["a", "b", "c", "d"], search);

    expect(result.requestsUsed).toBe(12);
  });

  it("keeps the leads from working trades when one trade fails", async () => {
    const search = vi.fn(async (trade: string) => {
      if (trade === "plumber") throw new Error("quota exhausted");
      return { places: [place("kept")], requestsUsed: 1 };
    });

    const result = await sweepTrades(["barber", "plumber"], search);

    expect(result.leads.map((l) => l.id)).toEqual(["kept"]);
    expect(result.byTrade.find((t) => t.trade === "plumber")?.error).toBe("quota exhausted");
    expect(result.byTrade.find((t) => t.trade === "barber")?.error).toBeUndefined();
  });

  it("reports every trade in the breakdown", async () => {
    const search = vi.fn().mockResolvedValue({ places: [place("x")], requestsUsed: 1 });
    const result = await sweepTrades(["a", "b"], search);

    expect(result.byTrade).toHaveLength(2);
    expect(result.byTrade[0]).toMatchObject({ trade: "a", leads: 1, scanned: 1 });
  });

  it("excludes businesses that already have a website", async () => {
    const search = vi.fn().mockResolvedValue({
      places: [place("no-site"), place("has-site", { websiteUri: "https://example.com" })],
      requestsUsed: 1,
    });

    const result = await sweepTrades(["barber"], search);

    expect(result.leads.map((l) => l.id)).toEqual(["no-site"]);
    expect(result.withWebsite).toBe(1);
    expect(result.totalScanned).toBe(2);
  });

  it("ranks the strongest lead first across all trades", async () => {
    const search = vi.fn(async (trade: string) =>
      trade === "barber"
        ? { places: [place("weak", { userRatingCount: 2, rating: 3 })], requestsUsed: 1 }
        : { places: [place("strong", { userRatingCount: 400, rating: 4.9 })], requestsUsed: 1 },
    );

    const result = await sweepTrades(["barber", "plumber"], search);

    expect(result.leads[0].id).toBe("strong");
  });

  it("returns an empty result rather than throwing when every trade fails", async () => {
    const search = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await sweepTrades(["a", "b"], search);

    expect(result.leads).toEqual([]);
    expect(result.byTrade.every((t) => t.error === "network down")).toBe(true);
  });

  it("handles an empty trade list", async () => {
    const search = vi.fn();
    const result = await sweepTrades([], search);

    expect(search).not.toHaveBeenCalled();
    expect(result).toMatchObject({ leads: [], requestsUsed: 0, byTrade: [] });
  });
});
