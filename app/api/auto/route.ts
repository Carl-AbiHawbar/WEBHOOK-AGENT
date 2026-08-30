import { NextResponse } from "next/server";
import { PlacesApiError, textSearch, GOOGLE_MAX_PAGES } from "@/lib/places";
import { AUTO_TRADES } from "@/lib/trades";
import { sweepTrades } from "@/lib/sweep";
import { TtlCache } from "@/lib/cache";
import type { SweepResult } from "@/lib/sweep";

export const runtime = "nodejs";

const cache = new TtlCache<SweepResult>();

const DEFAULT_RADIUS_METERS = 16000; // ~10 miles
const MAX_RADIUS_METERS = 50000; // Google's ceiling for a locationBias circle

function autoPagesPerCategory(): number {
  const raw = Number(process.env.AUTO_PAGES_PER_CATEGORY ?? GOOGLE_MAX_PAGES);
  if (!Number.isFinite(raw)) return GOOGLE_MAX_PAGES;
  return Math.min(Math.max(Math.trunc(raw), 1), GOOGLE_MAX_PAGES);
}

/** Rounds coordinates so nearby page loads share a cache entry instead of re-billing. */
function coarse(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "No Places API key configured.",
        hint: "Set GOOGLE_PLACES_API_KEY in .env.local (or your host's environment variables), then restart.",
      },
      { status: 500 },
    );
  }

  let body: { latitude?: unknown; longitude?: unknown; radiusMeters?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON." }, { status: 400 });
  }

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return NextResponse.json({ error: "Latitude was missing or out of range." }, { status: 400 });
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: "Longitude was missing or out of range." }, { status: 400 });
  }

  const requested = Number(body.radiusMeters);
  const radiusMeters = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1000), MAX_RADIUS_METERS)
    : DEFAULT_RADIUS_METERS;

  const maxPages = autoPagesPerCategory();
  const key = `auto::${coarse(latitude)},${coarse(longitude)}::${radiusMeters}::${maxPages}`;

  const cached = cache.get(key);
  if (cached) {
    return NextResponse.json({ ...cached, radiusMeters, fromCache: true });
  }

  try {
    const result = await sweepTrades(AUTO_TRADES, async (trade) => {
      const { places, requestsUsed } = await textSearch({
        query: trade,
        apiKey,
        maxPages,
        bias: { latitude, longitude, radiusMeters },
      });
      return { places, requestsUsed };
    });

    // A sweep where every trade failed is a failure, not an empty result.
    if (result.byTrade.length > 0 && result.byTrade.every((t) => t.error)) {
      const first = result.byTrade[0].error ?? "All searches failed.";
      return NextResponse.json(
        { error: first, hint: "Every trade search failed - check the key and its quota." },
        { status: 502 },
      );
    }

    cache.set(key, result);
    return NextResponse.json({ ...result, radiusMeters, fromCache: false });
  } catch (error) {
    if (error instanceof PlacesApiError) {
      return NextResponse.json(
        { error: error.message, hint: error.hint },
        { status: error.status === 429 ? 429 : 502 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Could not reach Google Places: ${message}` }, { status: 503 });
  }
}
