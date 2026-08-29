import type { PlaceResult, PlacesSearchResponse } from "./types";

const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";

/**
 * Fields requested from Places. `places.websiteUri` is the one that matters most:
 * a place that comes back WITHOUT it has no website, which is exactly what we want.
 *
 * Cost note: websiteUri, nationalPhoneNumber, rating and userRatingCount are all
 * Enterprise-tier fields. Removing them would drop the price per call but would also
 * leave us unable to identify or contact a lead, so they stay.
 */
export const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.primaryTypeDisplayName",
  "nextPageToken",
].join(",");

/** Google returns at most 20 places per page and stops after 3 pages (60 results). */
export const PAGE_SIZE = 20;
export const GOOGLE_MAX_PAGES = 3;

export class PlacesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "PlacesApiError";
  }
}

/** Turns a Places HTTP failure into something a human can act on. */
function describeFailure(status: number, body: string): PlacesApiError {
  let detail = body;
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message ?? body;
  } catch {
    // Non-JSON error body; use it as-is.
  }

  if (status === 400) {
    return new PlacesApiError(
      `Google rejected the request: ${detail}`,
      400,
      "This usually means the field mask asked for a field the API does not recognise.",
    );
  }
  if (status === 401 || status === 403) {
    return new PlacesApiError(
      `Google refused the API key: ${detail}`,
      status,
      "Check that Places API (New) is enabled for this key and that its API restrictions allow it.",
    );
  }
  if (status === 429) {
    return new PlacesApiError(
      "Google Places quota exhausted for this key.",
      429,
      "Wait for the quota window to reset, or raise the limit in Google Cloud Console under APIs & Services > Quotas.",
    );
  }
  return new PlacesApiError(`Places API error (HTTP ${status}): ${detail}`, status);
}

export interface TextSearchOptions {
  query: string;
  apiKey: string;
  maxPages: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface TextSearchResult {
  places: PlaceResult[];
  requestsUsed: number;
  /** True when Google still had more pages but we stopped at maxPages. */
  truncated: boolean;
}

/**
 * Runs a Places text search, following nextPageToken up to `maxPages`.
 *
 * Each page is a separate billed request, so maxPages is the main cost dial.
 */
export async function textSearch({
  query,
  apiKey,
  maxPages,
  fetchImpl = fetch,
}: TextSearchOptions): Promise<TextSearchResult> {
  const pageLimit = Math.min(Math.max(maxPages, 1), GOOGLE_MAX_PAGES);
  const places: PlaceResult[] = [];
  let pageToken: string | undefined;
  let requestsUsed = 0;

  for (let page = 0; page < pageLimit; page++) {
    const body: Record<string, unknown> = { textQuery: query, pageSize: PAGE_SIZE };
    // Google requires textQuery to stay identical when paginating.
    if (pageToken) body.pageToken = pageToken;

    const response = await fetchImpl(SEARCH_TEXT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
    requestsUsed++;

    if (!response.ok) {
      throw describeFailure(response.status, await response.text());
    }

    const data = (await response.json()) as PlacesSearchResponse;
    places.push(...(data.places ?? []));

    pageToken = data.nextPageToken;
    if (!pageToken) {
      return { places, requestsUsed, truncated: false };
    }
  }

  return { places, requestsUsed, truncated: Boolean(pageToken) };
}
