/**
 * Trades swept automatically on page load.
 *
 * Chosen because these are overwhelmingly owner-operated local businesses that
 * run on phone calls and word of mouth - the profile most likely to have a
 * Google listing and no website. Each entry costs up to
 * AUTO_PAGES_PER_CATEGORY billed requests per sweep, so this list is the main
 * cost dial for the automatic search.
 */
export const AUTO_TRADES = [
  "barber shop",
  "nail salon",
  "hair salon",
  "plumber",
  "landscaping",
  "cleaning service",
  "auto repair shop",
  "tattoo shop",
  "hvac contractor",
  "roofing contractor",
] as const;

export type Trade = (typeof AUTO_TRADES)[number];
