import { describe, it, expect } from "vitest";
import { extractLeads, hasRealWebsite, scoreLead, toLead } from "../leads";
import type { PlaceResult } from "../types";

function place(overrides: Partial<PlaceResult> = {}): PlaceResult {
  return {
    id: "p1",
    displayName: { text: "Acme Plumbing" },
    formattedAddress: "1 Main St, Austin, TX",
    userRatingCount: 10,
    rating: 4.0,
    businessStatus: "OPERATIONAL",
    ...overrides,
  };
}

describe("hasRealWebsite", () => {
  it("treats a missing websiteUri as no website", () => {
    expect(hasRealWebsite(place())).toBe(false);
  });

  it("treats an empty websiteUri as no website", () => {
    expect(hasRealWebsite(place({ websiteUri: "   " }))).toBe(false);
  });

  it("recognises a genuine website", () => {
    expect(hasRealWebsite(place({ websiteUri: "https://acmeplumbing.com" }))).toBe(true);
  });

  it("counts a Facebook page as no real website", () => {
    expect(hasRealWebsite(place({ websiteUri: "https://www.facebook.com/acme" }))).toBe(false);
  });

  it("counts a retired business.site page as no real website", () => {
    expect(hasRealWebsite(place({ websiteUri: "https://acme.business.site" }))).toBe(false);
  });

  it("does not mistake a lookalike domain for a social host", () => {
    expect(hasRealWebsite(place({ websiteUri: "https://notfacebook.com" }))).toBe(true);
  });

  it("treats an unparseable URL as no website", () => {
    expect(hasRealWebsite(place({ websiteUri: "not a url" }))).toBe(false);
  });
});

describe("scoreLead", () => {
  it("ranks a busy business above a quiet one", () => {
    const busy = scoreLead(place({ userRatingCount: 300, rating: 4.6 }));
    const quiet = scoreLead(place({ userRatingCount: 2, rating: 4.6 }));
    expect(busy).toBeGreaterThan(quiet);
  });

  it("stays within 0-100", () => {
    expect(scoreLead(place({ userRatingCount: 100000, rating: 5 }))).toBeLessThanOrEqual(100);
    expect(scoreLead(place({ userRatingCount: 0, rating: undefined }))).toBeGreaterThanOrEqual(0);
  });

  it("scores a business with no reviews or rating at zero", () => {
    expect(scoreLead(place({ userRatingCount: undefined, rating: undefined }))).toBe(0);
  });
});

describe("toLead", () => {
  it("falls back gracefully when optional fields are absent", () => {
    const lead = toLead({ id: "x" });
    expect(lead.name).toBe("(unnamed business)");
    expect(lead.phone).toBeNull();
    expect(lead.reviewCount).toBe(0);
  });
});

describe("extractLeads", () => {
  it("keeps only website-less businesses and counts the rest", () => {
    const result = extractLeads([
      place({ id: "a" }),
      place({ id: "b", websiteUri: "https://b.com" }),
      place({ id: "c", websiteUri: "https://facebook.com/c" }),
    ]);

    expect(result.leads.map((l) => l.id)).toEqual(["a", "c"]);
    expect(result.totalFound).toBe(3);
    expect(result.withWebsite).toBe(1);
  });

  it("drops permanently closed businesses entirely", () => {
    const result = extractLeads([
      place({ id: "open" }),
      place({ id: "gone", businessStatus: "CLOSED_PERMANENTLY" }),
    ]);

    expect(result.leads.map((l) => l.id)).toEqual(["open"]);
    expect(result.totalFound).toBe(1);
  });

  it("sorts the strongest lead first", () => {
    const result = extractLeads([
      place({ id: "small", userRatingCount: 3 }),
      place({ id: "big", userRatingCount: 400, rating: 4.8 }),
    ]);

    expect(result.leads[0].id).toBe("big");
  });

  it("returns empty results for an empty input", () => {
    expect(extractLeads([])).toEqual({ leads: [], totalFound: 0, withWebsite: 0 });
  });
});
