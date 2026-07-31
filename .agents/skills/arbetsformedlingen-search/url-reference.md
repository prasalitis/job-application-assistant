# arbetsformedlingen.se (JobTech Dev API) — Reference

Investigated 2026-07-31. Unlike every other portal skill in this repo,
**arbetsformedlingen.se's job listings are served by a real, official, documented
public REST API** - `jobsearch.api.jobtechdev.se` - part of Sweden's "JobTech Dev"
open-data initiative (jobtechdev.se), run by Arbetsförmedlingen (the Swedish Public
Employment Service) itself. There is no scraping, no HTML parsing, and no ToS
ambiguity here: this is the sanctioned way to access this data programmatically.

**OpenAPI spec:** `https://jobsearch.api.jobtechdev.se/swagger.json` (also browsable
as Swagger UI at the API root). Only 4 endpoints: `/search`, `/ad/{id}`,
`/ad/{id}/logo`, `/complete` (autocomplete).

## Search — `GET /search`

Confirmed live: `q=IT governance` returned 3646 total matches with highly relevant
titles ("Power Platform Governance-konsult", "Senior Security Officer", "IT Manager
Local IT Sweden").

Key parameters actually used by this CLI:
- `q` — freetext query (searches ad headline, description, and employer name).
- `published-after` — `YYYY-MM-DD` (or full datetime). This CLI derives it from
  `--jobage <days>`.
- `remote` — boolean; true limits to ads the API's phrase-matching thinks allow
  remote work.
- `offset` / `limit` — standard pagination (`limit` max 100).

**Not yet implemented in this CLI, but available and documented** (see the swagger
spec for the full list - worth revisiting if useful):
- `municipality` / `region` / `country` — location filters, but by **taxonomy code**,
  not free-text city names. Would need a lookup against the taxonomy (not
  investigated - likely at a companion `taxonomy.jobtechdev.se` service, unconfirmed).
- `occupation-name` / `occupation-group` / `occupation-field` / `skill` — structured
  taxonomy-code filters for role type and skills.
- `position` + `position.radius` — lat/long + radius geo-search.
- `employer` — filter by employer name or Swedish organisation number.
- `worktime-extent`, `parttime.min`/`.max`, `employment-type`, `duration`,
  `experience`, `driving-license*` — various structured filters.
- `stats` — aggregate counts per field (e.g. how many results per occupation-group).

**Response shape:**
```jsonc
{
  "total": { "value": 3646 },
  "hits": [
    {
      "id": "30624866",
      "headline": "Power Platform Governance-konsult",
      "webpage_url": "https://arbetsformedlingen.se/platsbanken/annonser/30624866",
      "employer": { "name": "B3 Consulting Group AB (publ)", "url": "...", "organization_number": "..." },
      "workplace_address": { "municipality": "Göteborg", "region": "Västra Götalands län", ... },
      "publication_date": "2026-02-17T15:03:58",
      "application_deadline": "2026-08-16T23:59:59",
      "employment_type": { "label": "Vanlig anställning" },
      "description": { "text": "<full plain-text description, not truncated>" }
      // ... many more fields, see swagger.json or a live response
    }
  ]
}
```

**Notable: the search response already embeds the full `description.text`** - not a
short snippet. A `detail` call is only needed if you have a bare ID without having
searched for it first.

## Detail — `GET /ad/{id}`

Same object shape as one `hits[]` entry from `/search`, just for a single ID.
`application_details.url` is the direct apply link when present.

## Access & fetching quirks

- **No bot-detection, no Cloudflare.** Confirmed live: Bun's native `fetch()` works
  fine, no workaround needed - this is a real API meant for programmatic access.
- No authentication required.
- No robots.txt restrictions apply (this is an API host, not the main website).

## Not yet confirmed / left as gaps

- Location filtering by free-text city name is not implemented - the API wants
  taxonomy codes for `municipality`/`region`. A `--location` flag could be added later
  if the taxonomy lookup is worked out.
- Salary, education requirements, and skill/language taxonomy fields (`must_have`,
  `nice_to_have`) are present in the API response but not currently surfaced by this
  CLI.
