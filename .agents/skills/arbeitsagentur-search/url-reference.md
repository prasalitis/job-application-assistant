# Bundesagentur für Arbeit (Jobsuche API) — Reference

Investigated 2026-07-31. Germany's Federal Employment Agency runs a real REST API
backing its public job search - `rest.arbeitsagentur.de/jobboerse/jobsuche-service`.
This is the same API arbeitsagentur.de's own website uses, authenticated with a
well-known public `X-API-Key: jobboerse-jobsuche` header (not a secret - this key is
widely documented in community projects that use this API; it is the public-facing
key, not an internal one).

## Search — `GET /pc/v4/jobs`

Confirmed live: `was=IT governance` returned 1011 total matches with directly
relevant titles ("Manager IT-Governance", "IT Governance Manager" at FERCHAU,
"IT Governance Managerin" at 50Hertz Transmission).

Parameters used by this CLI:
- `was` — freetext query (job title/keyword).
- `page` — **1-indexed** (confirmed live: `page=0` returns HTTP 400
  `EINGABEN_UNVOLLSTAENDIG_ODER_FEHLERHAFT` / "must be greater than or equal to 1").
- `size` — results per page.

**Response shape** (`stellenangebote[]`):
```jsonc
{
  "refnr": "10001-1003474294-S",      // the job ID - may contain a `/`, must be URL-encoded when building a detail URL
  "titel": "Manager IT-Governance (m/w/d)",
  "arbeitgeber": "M.M.Warburg & CO (AG & Co.) KGaA",
  "arbeitsort": { "ort": "Hamburg", "region": "Hamburg", "land": "Deutschland" },
  "aktuelleVeroeffentlichungsdatum": "2026-07-31"
}
```

No full description is included in search results - unlike Sweden's JobTech API.

## Detail

There is no reliably-working `/jobdetails/{refnr}` REST endpoint (tried during
investigation - consistently returned 404 `STELLENANGEBOT_NICHT_GEFUNDEN` even for
freshly-fetched refnrs). Instead, this CLI fetches the **public job-detail webpage**:

```
https://www.arbeitsagentur.de/jobsuche/jobdetail/<url-encoded refnr>
```

The page is server-rendered Angular Universal, and embeds the full job data as JSON
in `<script id="ng-state">` - Angular's equivalent of Next.js's `__NEXT_DATA__`
mechanism (the state Angular transfers to the client for hydration). The relevant
`jobdetail` object:

```jsonc
{
  "stellenangebotsTitel": "...",
  "stellenangebotsBeschreibung": "...",   // full description, markdown-formatted (### headers etc.)
  "firma": "...",
  "arbeitszeitVollzeit": true,
  "datumErsteVeroeffentlichung": "2026-07-31",
  "referenznummer": "10001-1003474294-S",
  "stellenlokationen": [{ "adresse": { "ort": "...", "region": "..." } }]
}
```

**Known gap confirmed live:** externally-sourced listings (e.g. via staffing agency
partners like Hays) can return a genuine 404 on `arbeitsagentur.de`'s own detail page,
even though they appear fine in search results - confirmed this is not a bug in the
CLI by checking the same URL directly in `curl` with a browser UA (also 404). These
listings' "real" detail page likely lives on the partner's own site instead. `detail`
correctly reports `NOT_FOUND` for these rather than crashing or fabricating content.

## Access & fetching quirks

- **No Cloudflare or bot-detection** on either the API host or the public website -
  Bun's native `fetch()` works fine for both, zero runtime dependencies.
- The API key is not secret, but is also not a formally "public/documented" API in the
  same sense as Sweden's JobTech Dev platform - it's the key the arbeitsagentur.de
  website itself uses. Keep volume reasonable as a matter of good practice.

## Not yet confirmed / left as gaps

- Location/region filtering (beyond freetext in `was`) was not investigated - the API
  likely supports a location parameter given `arbeitsort` in every result, but the
  exact parameter name wasn't confirmed.
- Salary and contract-duration fields (`verguetungsangabe`, `vertragsdauer`) are
  present in the detail page's data but not currently surfaced by this CLI.
