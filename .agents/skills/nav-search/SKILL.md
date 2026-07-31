---
name: nav-search
version: 1.0.0
description: >
  Search live job listings in Norway via NAV Arbeidsplassen (Norway's Public
  Employment Service job board). Use for job searches targeting Norway - any city or
  nationwide. Trigger phrases: job Norway, Arbeidsplassen, NAV, jobb Norge, Norwegian
  job board, jobs in Oslo/Bergen/Trondheim/Stavanger.
context: fork
allowed-tools: Bash(bun run .agents/skills/nav-search/cli/src/cli.ts *)
---

# NAV Arbeidsplassen (Norway) Search Skill

Search live job listings via NAV's public Elasticsearch-backed search API. No
authentication, zero runtime dependencies. `search` returns real JSON directly (no
scraping); `detail` fetches the public job page and parses Next.js's React Server
Components streaming payload for the full description - see `url-reference.md` for
why this is more fragile than the other portal skills in this repo, and what to
re-check first if it stops working.

## When to use this skill

- Search for job openings anywhere in Norway
- Get the full description of a specific listing (company/location/date come from
  `search`, not `detail` - see Notes)

## Commands

### Search job listings

```bash
bun run .agents/skills/nav-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (job title, skill, role). Norwegian
  or English. Recommended.
- `--page <n>` — page number, 1-indexed. Each page is a **fixed 25 results** - the
  API ignores any page-size parameter.
- `--limit <n>` / `-n <n>` — cap results emitted from that page (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/nav-search/cli/src/cli.ts detail <uuid|url> [--format json|plain]
```

`uuid` is the ad ID from a `search` result. You may also pass a full
`arbeidsplassen.nav.no/stillinger/stilling/...` URL.

## Usage examples

```bash
# SAM/ITAM or governance roles anywhere in Norway
bun run .agents/skills/nav-search/cli/src/cli.ts search -q "IT governance" --format table
bun run .agents/skills/nav-search/cli/src/cli.ts search -q "software asset manager" --format json

# Full description for a specific listing
bun run .agents/skills/nav-search/cli/src/cli.ts detail 0be9cd3a-219a-455f-9c54-2fded012f84d --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing UUIDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- **`detail` only reliably returns `title` and `description`** - company, location,
  date, and deadline are not populated (they were not found in an easily-parseable
  form during investigation). Get those from the corresponding `search` result
  instead. See `url-reference.md`'s "Known limitation".
- `search` hits a real Elasticsearch-backed JSON API; `detail` parses Next.js's React
  Server Components streaming payload (not a stable public format) - this is the most
  fragile parsing approach among this repo's portal skills. If descriptions stop
  coming back, re-investigate before assuming the whole integration is broken.
- Page size is a fixed 25 - `--limit` only trims what's already been fetched, it does
  not request fewer results from the API.
- No Cloudflare or bot-detection encountered - Bun's native `fetch()` works fine for
  both endpoints.
