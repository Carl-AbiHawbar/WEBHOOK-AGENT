import { describe, it, expect } from "vitest";
import { leadsToCsv, csvFilename } from "../csv";
import type { Lead } from "../types";

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "1",
    name: "Acme Plumbing",
    address: "1 Main St, Austin, TX",
    phone: "(512) 555-0100",
    rating: 4.5,
    reviewCount: 88,
    category: "Plumber",
    mapsUrl: "https://maps.google.com/?cid=1",
    score: 62,
    ...overrides,
  };
}

describe("leadsToCsv", () => {
  it("writes a header row even with no leads", () => {
    expect(leadsToCsv([])).toBe(
      "Business,Phone,Address,Category,Rating,Reviews,Lead score,Google Maps",
    );
  });

  it("quotes fields containing commas", () => {
    const csv = leadsToCsv([lead()]);
    expect(csv).toContain('"1 Main St, Austin, TX"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    const csv = leadsToCsv([lead({ name: 'Bob "The Wrench" Ltd' })]);
    expect(csv).toContain('"Bob ""The Wrench"" Ltd"');
  });

  it("neutralises a formula so it cannot execute in Excel", () => {
    const csv = leadsToCsv([lead({ name: "=cmd|'/c calc'!A1" })]);
    expect(csv).toContain("'=cmd");
  });

  it("renders missing values as empty cells", () => {
    const csv = leadsToCsv([lead({ phone: null, rating: null, mapsUrl: null })]);
    const row = csv.split("\r\n")[1];
    expect(row.startsWith("Acme Plumbing,,")).toBe(true);
  });
});

describe("csvFilename", () => {
  it("slugifies the query and stamps the date", () => {
    expect(csvFilename("plumbers in Austin, TX")).toMatch(
      /^leads-plumbers-in-austin-tx-\d{4}-\d{2}-\d{2}\.csv$/,
    );
  });

  it("falls back when the query has no usable characters", () => {
    expect(csvFilename("!!!")).toMatch(/^leads-search-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
