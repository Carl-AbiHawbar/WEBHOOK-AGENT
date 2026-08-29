# Lead Finder

Finds local businesses on Google Maps that have **no website**, ranks them by how
much they stand to gain from one, and exports the list as CSV.

Built as a private tool: one shared password, no accounts, no database.

## How it finds them

Google Maps has no "businesses without a website" filter, so this exploits a
detail of the Places API instead. Every search asks for the `places.websiteUri`
field. A business that comes back **without** that field has no website on file —
and that is the lead.

Businesses whose only web presence is a Facebook page, a Linktree, or a retired
`business.site` page are also counted as leads, since they still have no real
site to sell them. Permanently closed businesses are dropped.

Results are scored 0–100. Review count dominates the score on a log scale, with
rating as a smaller modifier: a shop with 300 reviews, 4.8 stars and no website
is demonstrably busy and demonstrably leaving money on the table, which makes it
a far better call than a place with two reviews.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000 and sign in with `APP_PASSWORD`.

## Configuration

All of it lives in `.env.local`, which is gitignored:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_PLACES_API_KEY` | Places API (New) key. Server-side only — never reaches the browser. |
| `APP_PASSWORD` | Shared password for the app. Leave empty to disable the gate (localhost only). |
| `MAX_PAGES_PER_SEARCH` | Cost ceiling, 1–3. Each page is one billed request and returns 20 businesses. |

### Securing the API key

The key is the thing worth protecting — it bills to your Google Cloud account.
In the Cloud Console:

1. **APIs & Services → Credentials → your key → API restrictions** → restrict to
   *Places API (New)*.
2. **APIs & Services → Places API → Quotas** → set a daily request cap so a leak
   cannot run past a ceiling you choose.

If a key is ever exposed, delete it and create a new one; restriction limits the
damage but does not undo it.

## Cost

`websiteUri`, `nationalPhoneNumber`, `rating` and `userRatingCount` are all
Enterprise-tier fields in Google's Places pricing, which is the expensive tier.
They are requested anyway, because without them a lead cannot be identified or
called. Check current rates and your free monthly allowance in the Cloud Console
billing page — Google has changed this pricing recently.

Three things keep the bill down:

- Every search is capped at `MAX_PAGES_PER_SEARCH` billed requests.
- Identical searches are served from a 10-minute in-memory cache, so
  double-clicking costs nothing.
- The result summary always shows how many requests a search actually used.

## Known limits

- **60 results per search, hard stop.** That is Google's cap on text search, not
  a choice made here. Covering a whole metro means running several searches —
  one trade and one town at a time.
- **Only what Google knows.** A business with a website Google has never been
  told about will appear as a lead. Worth a glance before you pitch.
- **Don't build a database out of it.** Google's Places terms restrict storing
  Places content beyond 30 days. Exporting a CSV to run this week's outreach is
  ordinary use; a permanent scraped lead warehouse is not. The cache is
  deliberately short-lived and in-memory for that reason.

## Deploying

Works on Vercel as-is. Set `GOOGLE_PLACES_API_KEY` and `APP_PASSWORD` as
environment variables in the project settings — and set a real password, since a
public URL without one is an open tap on your Places quota.

## Tests

```bash
npm test
```

Covers website detection, lead scoring, CSV escaping, the TTL cache, the auth
token, and every Places error path with `fetch` mocked. No test hits the live API.

## Layout

```
app/page.tsx           search form + results table
app/login/page.tsx     password form
app/api/search/route.ts  server-only Places call; the key lives here
app/api/login/route.ts   sets the auth cookie
proxy.ts               password gate over every route
lib/places.ts          Places client, field mask, pagination, error mapping
lib/leads.ts           website detection + lead scoring
lib/csv.ts             export formatting
lib/cache.ts           short-lived cost guard
lib/auth.ts            cookie token hashing
```
