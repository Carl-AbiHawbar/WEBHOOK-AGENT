import type { Lead, PlaceResult } from "./types";

/**
 * A business has no website when Places returns no `websiteUri` for it.
 *
 * Places also lets businesses point `websiteUri` at a Facebook page or a
 * link-in-bio service. Those are still prospects - they have no real site -
 * so they are treated as leads too.
 */
const SOCIAL_ONLY_HOSTS = [
  "facebook.com",
  "fb.me",
  "instagram.com",
  "linktr.ee",
  "linkedin.com",
  "yelp.com",
  "business.site", // retired Google Business profile sites
  "sites.google.com",
];

export function hasRealWebsite(place: PlaceResult): boolean {
  const uri = place.websiteUri?.trim();
  if (!uri) return false;

  let host: string;
  try {
    host = new URL(uri).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    // Unparseable URL means we cannot confirm a real site; treat it as a lead.
    return false;
  }

  return !SOCIAL_ONLY_HOSTS.some((social) => host === social || host.endsWith(`.${social}`));
}

/**
 * Scores a lead 0-100 on how worthwhile the pitch is.
 *
 * Review count dominates: a shop with 300 reviews and no website is demonstrably
 * busy and demonstrably leaving money on the table. Rating is a smaller modifier -
 * a well-liked business is an easier sell than a poorly-rated one.
 */
export function scoreLead(place: PlaceResult): number {
  const reviews = place.userRatingCount ?? 0;
  const rating = place.rating ?? 0;

  // Log scale so 500 reviews doesn't swamp everything; 200+ reviews approaches full marks.
  const reviewScore = Math.min(Math.log10(reviews + 1) / Math.log10(201), 1) * 70;
  const ratingScore = rating > 0 ? (Math.min(rating, 5) / 5) * 30 : 0;

  return Math.round(reviewScore + ratingScore);
}

export function toLead(place: PlaceResult): Lead {
  return {
    id: place.id,
    name: place.displayName?.text ?? "(unnamed business)",
    address: place.formattedAddress ?? "",
    phone: place.nationalPhoneNumber ?? null,
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? 0,
    category: place.primaryTypeDisplayName?.text ?? null,
    mapsUrl: place.googleMapsUri ?? null,
    score: scoreLead(place),
  };
}

/** Businesses that closed permanently are not worth pitching. */
function isOperational(place: PlaceResult): boolean {
  return !place.businessStatus || place.businessStatus === "OPERATIONAL";
}

export interface FilterResult {
  leads: Lead[];
  totalFound: number;
  withWebsite: number;
}

/** Keeps only operational businesses with no real website, best leads first. */
export function extractLeads(places: PlaceResult[]): FilterResult {
  const operational = places.filter(isOperational);
  const withWebsite = operational.filter(hasRealWebsite).length;

  const leads = operational
    .filter((place) => !hasRealWebsite(place))
    .map(toLead)
    .sort((a, b) => b.score - a.score || b.reviewCount - a.reviewCount);

  return { leads, totalFound: operational.length, withWebsite };
}
