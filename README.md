# Lead Finder

Finds local businesses on Google Maps that have **no website**, ranks them by how
much they stand to gain from one, and exports the list as CSV.

Open it and it works on its own: the page asks your browser where you are, sweeps
ten local trades, and shows the businesses without websites ranked best-first. No
typing required. A manual search is tucked under "Search somewhere else" for
looking at other towns.

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

## The automatic sweep

On load the page requests your coordinates and searches these ten trades around
you, all of them owner-operated businesses that typically run on phone calls and
word of mouth:

barber shop, nail salon, hair salon, plumber, landscaping, cleaning service,
auto repair shop, tattoo shop, hvac contractor, roofing contractor.

Results are merged and deduped by place id, because one business legitimately
matches several trades. A real sweep near Waco returned **146 website-less
businesses out of 457 scanned, using 30 billed requests**.

If a single trade's search fails, the sweep keeps going and reports which trades
were skipped — partial leads beat no leads.

### Pinning an area

`?lat=&lng=` skips geolocation and sweeps a fixed point, so you can bookmark a
territory or share one:

```
http://localhost:3000/?lat=31.549&lng=-97.146
```

Denying the location prompt is not fatal; the page says so and points you at the
manual search.

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
| `MAX_PAGES_PER_SEARCH` | Cost ceiling for a manual search, 1–3. Each page is one billed request and returns 20 businesses. |
| `AUTO_PAGES_PER_CATEGORY` | Cost ceiling per trade in the automatic sweep, 1–3. At 3 a full sweep is ~30 requests; at 1 it is ~10. |

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

- A manual search is capped at `MAX_PAGES_PER_SEARCH` billed requests; the
  automatic sweep at `AUTO_PAGES_PER_CATEGORY` per trade. **Turning
  `AUTO_PAGES_PER_CATEGORY` down to 1 cuts a sweep from ~30 requests to ~10** and
  is the single biggest lever on your bill.
- Sweep results are cached against coordinates rounded to ~1km, so refreshing the
  page or moving slightly does not re-bill.
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

Works on Vercel as-is; it builds on Linux, so the Windows compiler problem below
does not apply there.

1. **Import the repo** at vercel.com/new and pick this GitHub repository. Leave
   the framework preset on Next.js and do not deploy yet.
2. **Add environment variables** before the first build, under Environment
   Variables:
   - `GOOGLE_PLACES_API_KEY` — your Places API (New) key
   - `APP_PASSWORD` — the password for the app itself
   - `AUTO_PAGES_PER_CATEGORY` — optional; `1` makes sweeps three times cheaper
     and faster
3. **Deploy.**

Changing an environment variable later needs a redeploy to take effect; Vercel
does not apply them to an existing build.

### Things that behave differently once deployed

- **The cache is per-instance.** It lives in module scope, so each cold serverless
  instance starts empty. It still prevents a double-click from billing twice, but
  it will not spread savings across the whole deployment.
- **Sweeps are slow enough to matter.** A full sweep is ~30 Places calls and takes
  around 5 seconds on a fast connection. The routes declare a `maxDuration`, but a
  host that caps below that will kill a sweep mid-flight. If that happens, set
  `AUTO_PAGES_PER_CATEGORY=1`.
- **The password is the only thing guarding your quota.** A public URL with a weak
  password is an open tap on Places billing. Pair it with a daily quota cap in the
  Google Cloud Console so a leak has a ceiling.

## Tests

```bash
npm test
```

58 tests covering website detection, lead scoring, CSV escaping, the TTL cache,
the auth token, sweep dedupe and partial-failure handling, location bias, and
every Places error path with `fetch` mocked. No test hits the live API.

## Layout

```
app/page.tsx           auto sweep on load + results table + manual search
app/login/page.tsx     password form
app/api/auto/route.ts    automatic multi-trade sweep around coordinates
app/api/search/route.ts  single manual search; the key lives here too
app/api/login/route.ts   sets the auth cookie
proxy.ts               password gate over every route
lib/places.ts          Places client, field mask, pagination, error mapping
lib/leads.ts           website detection + lead scoring
lib/trades.ts          the ten trades swept automatically
lib/sweep.ts           runs trades in parallel, merges and dedupes
lib/csv.ts             export formatting
lib/cache.ts           short-lived cost guard
lib/auth.ts            cookie token hashing
```

## Troubleshooting

**`An Application Control policy has blocked this file` / `next-swc.win32-x64-msvc.node`**

Windows is blocking Next's native compiler binary. Next falls back to WASM
bindings, which run `next dev --webpack` fine but fail `next build` with a
confusing `EISDIR ... readlink app/api/<any>/route.ts` — the named route is a red
herring, it fails on whichever route it reaches first.

Options:

- Build on your host instead. Vercel builds on Linux and is unaffected, so
  deploys work regardless of this.
- Allow the binary in Windows Security → App & browser control. On Windows 11
  Home this is usually Smart App Control, which **cannot be re-enabled without
  reinstalling Windows** once turned off — worth knowing before you touch it.
- Run `next dev --webpack` locally and let CI do the production build.

**`No Places API key configured`**

The process cannot see `GOOGLE_PLACES_API_KEY`. A fresh clone has no
`.env.local` — it is gitignored on purpose. Copy yours across, or start from
`.env.example`. On a host, set it in that host's environment variables, not in
the repo, and redeploy afterwards.
