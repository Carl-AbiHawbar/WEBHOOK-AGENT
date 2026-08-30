import { NextResponse } from "next/server";
import { PlacesApiError, textSearch, GOOGLE_MAX_PAGES } from "@/lib/places";
import { extractLeads } from "@/lib/leads";
import { TtlCache, cacheKey } from "@/lib/cache";
import type { SearchOutcome } from "@/lib/types";

export const runtime = "nodejs";

/** Up to 3 Places calls; generous ceiling so a slow upstream does not 504. */
export const maxDuration = 30;

// Module-level so it survives across requests within a warm server instance.
const cache = new TtlCache<Omit<SearchOutcome, "fromCache">>();

function configuredMaxPages(): number {
  const raw = Number(process.env.MAX_PAGES_PER_SEARCH ?? GOOGLE_MAX_PAGES);
  if (!Number.isFinite(raw)) return GOOGLE_MAX_PAGES;
  return Math.min(Math.max(Math.trunc(raw), 1), GOOGLE_MAX_PAGES);
}

function fail(message: string, status: number, hint?: string) {
  return NextResponse.json({ error: message, hint }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return fail(
      "No Places API key configured.",
      500,
      "Set GOOGLE_PLACES_API_KEY in .env.local, then restart the dev server.",
    );
  }

  let payload: { category?: unknown; location?: unknown };
  try {
    payload = await request.json();
  } catch {
    return fail("Request body was not valid JSON.", 400);
  }

  const category = typeof payload.category === "string" ? payload.category.trim() : "";
  const location = typeof payload.location === "string" ? payload.location.trim() : "";

  if (!category || !location) {
    return fail("Both a business category and a location are required.", 400);
  }
  if (category.length > 100 || location.length > 100) {
    return fail("Category and location must each be under 100 characters.", 400);
  }

  const query = `${category} in ${location}`;
  const maxPages = configuredMaxPages();
  const key = cacheKey(query, maxPages);

  const cached = cache.get(key);
  if (cached) {
    return NextResponse.json({ ...cached, query, fromCache: true } satisfies SearchOutcome & {
      query: string;
    });
  }

  try {
    const { places, requestsUsed } = await textSearch({ query, apiKey, maxPages });
    const { leads, totalFound, withWebsite } = extractLeads(places);

    const outcome = { leads, totalFound, withWebsite, requestsUsed };
    cache.set(key, outcome);

    return NextResponse.json({ ...outcome, query, fromCache: false });
  } catch (error) {
    if (error instanceof PlacesApiError) {
      // 4xx from Google that are our fault surface as 400; quota as 429.
      const status = error.status === 429 ? 429 : 502;
      return fail(error.message, status, error.hint);
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return fail(`Could not reach Google Places: ${message}`, 503);
  }
}
