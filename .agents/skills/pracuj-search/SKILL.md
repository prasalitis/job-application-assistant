---
name: pracuj-search
version: 1.0.0
description: >
  Search live job listings on pracuj.pl, Poland's largest job board. Use for job
  searches targeting Poland - any city (Warszawa, Wrocław, Kraków, Gdańsk, Poznań,
  etc.) or nationwide. Trigger phrases: praca, oferty pracy, szukam pracy, job search
  Poland, jobs in Warsaw/Wrocław/Krakow/Gdansk, Polish job board.
context: fork
allowed-tools: Bash(bun run .agents/skills/pracuj-search/cli/src/cli.ts *)
---

# pracuj.pl Search Skill

Search live job listings from pracuj.pl's public pages. No authentication, no API
key, zero runtime dependencies - runs with just `bun`. Data comes from the same
structured JSON the site's own React frontend reads (see `url-reference.md`), not
scraped HTML markup, so results are clean and unlikely to break on minor CSS changes.

## When to use this skill

- Search for job openings anywhere in Poland, or in a specific city/region
- Filter by recency (posted within N days) - filtered client-side from each result's
  posting date
- Get the full description of a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/pracuj-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (job title, skill, role). Works in
  Polish or English; recommended.
- `--location <text>` / `-l <text>` — city or region, e.g. `"Warszawa"`, `"Wrocław"`,
  `"Gdańsk"`. Omit for nationwide results.
- `--jobage <days>` — only include postings whose `lastPublicated` date is within N
  days (filtered client-side; pracuj.pl has no confirmed server-side date filter).
- `--page <n>` — page number (1-indexed, 50 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/pracuj-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric offer ID from `search` results (e.g. `1004946752`). You may also
pass a full pracuj.pl offer URL. Returns the full multi-section description (about the
project, responsibilities, requirements, etc. joined into one readable text), deadline,
and apply link.

## Usage examples

```bash
# SAM/ITAM roles anywhere in Poland
bun run .agents/skills/pracuj-search/cli/src/cli.ts search -q "software asset manager" --format table

# IT governance roles in Wrocław, posted in the last 14 days
bun run .agents/skills/pracuj-search/cli/src/cli.ts search -q "IT governance" -l "Wrocław" --jobage 14 --format table

# License management roles, Polish keyword
bun run .agents/skills/pracuj-search/cli/src/cli.ts search -q "zarządzanie licencjami" --format table

# Full details for a specific offer
bun run .agents/skills/pracuj-search/cli/src/cli.ts detail 1004946752 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- **Requires `curl` on the system PATH.** pracuj.pl sits behind Cloudflare, which
  fingerprints and blocks Bun's native `fetch()` (confirmed live: identical
  URL/headers/IP, `curl` gets HTTP 200, `fetch()` gets a 403 bot-challenge page). This
  skill shells out to `curl` instead - a deliberate deviation from the repo's
  zero-dependency convention. `curl` ships by default on Windows 10+/macOS/most Linux,
  but a machine without it cannot run this skill. See `url-reference.md` for details.
- Data source: pracuj.pl's server-rendered pages embed the same JSON their frontend
  reads inside a `__NEXT_DATA__` script tag - see `url-reference.md` for the exact
  query keys and response shape.
- A single job posting can be listed for multiple cities at once; `search` emits one
  result row per (posting, city) pair, matching how they appear on the site.
- `detail` accepts any placeholder text before the ID in the URL (pracuj.pl doesn't
  validate the slug) - only the numeric ID is used.
- No posting-age or salary-range filter is confirmed server-side; `--jobage` is applied
  client-side from each result's posting date instead.
- Employment type / work mode is available on search results internally but not
  currently surfaced by `detail` - see the "Not yet confirmed" section of
  `url-reference.md`.
