import type { Lead, PlaceResult } from "./types";
import { extractLeads } from "./leads";

/** Runs one trade's search. Injected so the sweep can be tested without HTTP. */
export type TradeSearcher = (trade: string) => Promise<{
  places: PlaceResult[];
  requestsUsed: number;
}>;

export interface TradeBreakdown {
  trade: string;
  leads: number;
  scanned: number;
  /** Set when this trade's search failed; the sweep continues regardless. */
  error?: string;
}

export interface SweepResult {
  leads: Lead[];
  totalScanned: number;
  withWebsite: number;
  requestsUsed: number;
  byTrade: TradeBreakdown[];
}

/** Caps parallel Places calls so a sweep does not trip rate limits. */
const CONCURRENCY = 3;

async function inBatches<T, R>(
  items: readonly T[],
  size: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(worker))));
  }
  return results;
}

/**
 * Searches every trade, then merges the results into one ranked lead list.
 *
 * The same business legitimately shows up under several trades (a barber shop
 * also matches "hair salon"), so results are deduped by place id before scoring.
 * A trade whose search fails is reported in the breakdown rather than failing
 * the whole sweep - partial leads beat no leads.
 */
export async function sweepTrades(
  trades: readonly string[],
  search: TradeSearcher,
): Promise<SweepResult> {
  const byTrade: TradeBreakdown[] = [];
  const seen = new Map<string, PlaceResult>();
  let requestsUsed = 0;

  const outcomes = await inBatches(trades, CONCURRENCY, async (trade) => {
    try {
      const { places, requestsUsed: used } = await search(trade);
      return { trade, places, used, error: undefined as string | undefined };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search failed";
      return { trade, places: [] as PlaceResult[], used: 0, error: message };
    }
  });

  for (const outcome of outcomes) {
    requestsUsed += outcome.used;

    if (outcome.error) {
      byTrade.push({ trade: outcome.trade, leads: 0, scanned: 0, error: outcome.error });
      continue;
    }

    // Count this trade's own leads before deduping, so the breakdown reflects
    // what the trade actually turned up rather than what survived the merge.
    const own = extractLeads(outcome.places);
    byTrade.push({ trade: outcome.trade, leads: own.leads.length, scanned: own.totalFound });

    for (const place of outcome.places) {
      if (!seen.has(place.id)) seen.set(place.id, place);
    }
  }

  const merged = extractLeads([...seen.values()]);

  return {
    leads: merged.leads,
    totalScanned: merged.totalFound,
    withWebsite: merged.withWebsite,
    requestsUsed,
    byTrade,
  };
}
