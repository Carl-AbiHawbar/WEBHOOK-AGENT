# Lead Finder — design

**Date:** 2026-08-29
**Status:** implemented

## Problem

Businesses with no website are the natural customers for a web-design service,
but Google Maps offers no way to filter for them. Finding them by hand means
opening listings one at a time.

## Approach

Query the Google Places API (New) text search endpoint and request
`places.websiteUri` in the field mask. Places omits the field entirely for
businesses that have no website registered, so the absence of that field is the
lead signal. Everything else in the product follows from that one observation.

Scraping maps.google.com was rejected: it breaks Google's Terms of Service, gets
IP-blocked, and breaks on markup changes. Third-party lead resellers were
rejected as an unnecessary vendor dependency for a private tool.

## Architecture

Next.js 16 App Router, single page plus two API routes.

| Module | Responsibility |
| --- | --- |
| `app/page.tsx` | Search form, results table, CSV download |
| `app/login/page.tsx` | Password form |
| `app/api/search/route.ts` | Validates input, calls Places, filters, caches |
| `app/api/login/route.ts` | Verifies password, sets auth cookie |
| `proxy.ts` | Password gate across all routes |
| `lib/places.ts` | Places client: field mask, pagination, error mapping |
| `lib/leads.ts` | Website detection, lead scoring, sorting |
| `lib/csv.ts` | Export formatting and escaping |
| `lib/cache.ts` | Short-lived TTL cache |
| `lib/auth.ts` | Cookie token hashing and constant-time comparison |

The API key is read only inside the route handler. The browser never sees it and
never contacts Google directly.

### Data flow

1. User submits business type + location.
2. Route composes `"{type} in {location}"` and calls `places:searchText`,
   following `nextPageToken` up to `MAX_PAGES_PER_SEARCH` (Google caps at 3).
3. Non-operational businesses are dropped.
4. Businesses with a real website are counted and excluded.
5. Remaining businesses are scored and sorted, best lead first.
6. Result is cached for 10 minutes against the normalised query.

## Key decisions

**Enterprise field tier accepted.** `websiteUri`, `nationalPhoneNumber`,
`rating`, `userRatingCount` are all Enterprise-tier fields and cost more per
call. Without `websiteUri` there is no product; without the phone number a lead
is not actionable. The cost is the point of the tool.

**Social-only presences count as leads.** A Facebook page or a retired
`business.site` link is stored in `websiteUri` but is not a real website, so
those businesses stay in the list. Host matching is exact-or-subdomain so
`notfacebook.com` is not caught by mistake.

**Scoring favours review count over rating.** Review count enters on a log scale
capped near 200 reviews and carries 70 of the 100 points; rating carries 30.
Established-but-siteless is the profile worth calling.

**Login page rather than HTTP basic auth.** Basic auth was the first
implementation and was replaced: a 401 challenge breaks the page's own `fetch`
calls, and pages loaded with credentials in the URL cannot construct `fetch`
requests at all in Chrome. The cookie stores a SHA-256 of the password, not the
password.

**No database.** Google's Places terms restrict retaining Places content beyond
30 days. CSV export covers the actual workflow; persistent lead storage would be
both more work and a terms problem.

## Error handling

Every Places failure maps to a message with a next action: rejected key points
at API restrictions, 429 points at the quota page, 400 points at the field mask.
"No businesses found" and "all businesses found already have websites" are
distinct outcomes in the UI, because they call for different next searches.

## Testing

Vitest over the pure modules and the Places client with `fetch` injected. 46
tests covering website detection edge cases, scoring bounds, CSV escaping
including formula injection, cache expiry and eviction, auth token behaviour,
and every Places error path. No test contacts the live API.

## Known limits

- 60 results per search is Google's hard cap. Metro-wide coverage needs tiled
  searches, deliberately not built — it multiplies cost silently.
- Detection reflects what Google knows; a business with an unlisted website
  appears as a lead.
- The cache is per-process, so it does not survive a redeploy or span serverless
  instances. Acceptable for a cost guard.
