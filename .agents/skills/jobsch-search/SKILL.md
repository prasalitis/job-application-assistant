---
name: jobsch-search
version: 1.0.0
description: >
  Search live job listings on jobs.ch, Switzerland's job board. Use for job searches
  targeting Switzerland - Geneva, Zurich, Bern, Basel, or nationwide. Trigger phrases:
  job Switzerland, Swiss job board, jobs.ch, jobs in Geneva/Zurich/Bern, Stelle
  Schweiz, emploi Suisse.
context: fork
allowed-tools: Bash(bun run .agents/skills/jobsch-search/cli/src/cli.ts *)
---

# jobs.ch Search Skill

Search live job listings from jobs.ch's public pages. No authentication, no API key,
zero runtime dependencies - runs with just `bun`. Both search and detail data come
from the site's own embedded schema.org `JobPosting` structured data (see
`url-reference.md`), not fragile ad-hoc HTML scraping.

## ⚠️ Personal use only

jobs.ch's `robots.txt` explicitly disallows automated access to **individual job-detail
pages** (search/listing pages are not restricted). This skill's `detail` command
fetches those pages anyway, on the same personal-use judgment call this repo already
makes for `linkedin-search` and LinkedIn's Terms of Service: a real job-seeker looking
up a handful of postings for their own application, not a competitor bulk-scraping the
site. **Keep volume low and don't use this commercially or for bulk data collection.**
Run it on your own responsibility.

## When to use this skill

- Search for job openings anywhere in Switzerland, or filter by keyword
- Get the full description, employment type, and apply link for a specific listing

## Commands

### Search job listings

```bash
bun run .agents/skills/jobsch-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (job title, skill, role). Recommended.
- `--page <n>` — page number (1-indexed, 21 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/jobsch-search/cli/src/cli.ts detail <uuid|url> [--format json|plain]
```

`uuid` is the job ID from a `search` result (e.g. `bb061be9-0583-489d-928c-fb0c3b5f63d2`).
You may also pass a full jobs.ch detail URL. Returns the full description, employment
type, and apply link.

## Usage examples

```bash
# SAM/ITAM or governance roles anywhere in Switzerland
bun run .agents/skills/jobsch-search/cli/src/cli.ts search -q "IT governance" --format table
bun run .agents/skills/jobsch-search/cli/src/cli.ts search -q "software asset manager" --format table

# Full details for a specific listing
bun run .agents/skills/jobsch-search/cli/src/cli.ts detail bb061be9-0583-489d-928c-fb0c3b5f63d2 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing UUIDs to `detail` |
| `table` | Quick human-readable scanning (full UUID shown, not truncated - a truncated ID isn't valid input to `detail`) |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data source: both search and detail pages embed schema.org `JobPosting` JSON-LD - see
  `url-reference.md` for the exact shapes (they differ: search embeds a lighter copy
  per result inside an `ItemList`, detail embeds one much richer standalone object).
- No Cloudflare or similar bot-challenge encountered - Bun's native `fetch()` works
  fine here, unlike `pracuj-search` and `moovijob-search`, which both need a `curl`
  workaround.
- Job IDs are UUIDs (e.g. `bb061be9-0583-489d-928c-fb0c3b5f63d2`), not sequential
  numbers - pass them as-is to `detail`.
- Salary and named-contact-person fields exist in the detail page's data but are not
  currently surfaced by this CLI - see `url-reference.md`'s "Not yet confirmed" section.
