import type { Lead } from "./types";

const COLUMNS = [
  "Business",
  "Phone",
  "Address",
  "Category",
  "Rating",
  "Reviews",
  "Lead score",
  "Google Maps",
] as const;

/**
 * Escapes a CSV field. Values are also prefixed when they could be read as a
 * formula, so a business named "=SUM(...)" cannot execute on open in Excel.
 */
function escapeField(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/["\n,]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function leadsToCsv(leads: Lead[]): string {
  const rows = leads.map((lead) =>
    [
      lead.name,
      lead.phone,
      lead.address,
      lead.category,
      lead.rating,
      lead.reviewCount,
      lead.score,
      lead.mapsUrl,
    ]
      .map(escapeField)
      .join(","),
  );

  return [COLUMNS.join(","), ...rows].join("\r\n");
}

export function csvFilename(query: string): string {
  const slug = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  const date = new Date().toISOString().slice(0, 10);
  return `leads-${slug || "search"}-${date}.csv`;
}
