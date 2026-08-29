import { describe, it, expect } from "vitest";
import { TtlCache, cacheKey } from "../cache";

describe("TtlCache", () => {
  it("returns a stored value before it expires", () => {
    const cache = new TtlCache<string>(1000);
    cache.set("k", "v", 0);
    expect(cache.get("k", 500)).toBe("v");
  });

  it("drops a value once the ttl has passed", () => {
    const cache = new TtlCache<string>(1000);
    cache.set("k", "v", 0);
    expect(cache.get("k", 1001)).toBeUndefined();
  });

  it("returns undefined for an unknown key", () => {
    expect(new TtlCache<string>().get("missing")).toBeUndefined();
  });

  it("evicts the oldest entry once full", () => {
    const cache = new TtlCache<number>(10_000);
    for (let i = 0; i < 51; i++) cache.set(`k${i}`, i, 0);
    expect(cache.get("k0", 0)).toBeUndefined();
    expect(cache.get("k50", 0)).toBe(50);
  });
});

describe("cacheKey", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(cacheKey("  Plumbers in Austin ", 3)).toBe(cacheKey("plumbers in austin", 3));
  });

  it("separates searches that fetch different page counts", () => {
    expect(cacheKey("plumbers", 1)).not.toBe(cacheKey("plumbers", 3));
  });
});
