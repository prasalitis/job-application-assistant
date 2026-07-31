---
name: nofluffjobs-search
version: 1.0.0
description: >
  Use this skill to search live IT, marketing, sales, HR, and remote job listings
  across Central and Eastern Europe via No Fluff Jobs. The portal covers Poland,
  Hungary, Czech Republic, Slovakia, Netherlands, Ukraine, Albania, and more.
  Invoke for IT jobs, software jobs, developer jobs, DevOps roles, remote developer
  jobs, or "are there any <tech role> jobs in <CEE location>". Supports English and
  Polish searches. Trigger phrases: find a job, job search, search for jobs, job
  openings, vacancies, hiring, positions open, remote jobs, oferty pracy, ledige
  stillinger, jobsøgning.
context: fork
allowed-tools: Bash(bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts *)
---

# No Fluff Jobs Search Skill

Search live job listings from **No Fluff Jobs** (https://nofluffjobs.com), a major
job portal for IT, marketing, sales, HR, and remote work across **Central and Eastern
Europe**. The portal covers Poland, Hungary, Czech Republic, Slovakia, Netherlands,
Ukraine, Albania, and more. No authentication required, zero runtime dependencies —
it runs with just `bun`.

> **⚠️ Personal use only.** This uses No Fluff Jobs' public job pages. Their
> robots.txt disallows `/api/` and `/posting/` paths but allows the public search
> pages. Keep volume low and don't use it commercially or for bulk data collection.
> Run it on your own responsibility.

## When to use this skill

- Search for IT job openings in CEE countries (Poland, Hungary, Czech Republic, etc.)
- Filter by location (city or country)
- Search in English or Polish
- Get the full description of a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts search -q "<query>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, skill, role). Recommended.
- `--location <text>` / `-l <text>` — location filter (city or country name).
- `--page <n>` — page number (1-indexed, defaults to 1).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the **full slug** from the job URL — everything after `/job/` (e.g. from
`https://nofluffjobs.com/job/senior-sap-ewm-consultant-link-group-remote-1` use
`senior-sap-ewm-consultant-link-group-remote-1`, not just a trailing number). No Fluff
Jobs slugs are not purely numeric — passing just a number will build a wrong URL and fail.
You may also pass a full No Fluff Jobs URL. Returns the full description, salary,
requirements, benefits, and apply information.

## Usage examples

```bash
# Software Asset Management roles in Poland
bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts search -q "software asset management" -l "Poland" --format table

# IT Asset Management roles remotely
bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts search -q "IT asset management" --format table

# Developer jobs in Warsaw
bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts search -q "developer" -l "Warsaw" --format table

# DevOps roles in Kraków, last page results limited to 5
bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts search -q "devops" -l "Kraków" --limit 5 --format table

# Full details for a specific job (use the full slug from search results, not a number)
bun run .agents/skills/nofluffjobs-search/cli/src/cli.ts detail senior-sap-ewm-consultant-link-group-remote-1 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## Notes

- Data is from No Fluff Jobs' public HTML search pages — no credentials required.
- Location filter uses simple text matching against job locations.
- The portal serves both English (`/job`) and Polish (`/pl/job`) paths; this skill uses
the English path by default but searches all content regardless of language.
- No Fluff Jobs may rate-limit; the CLI retries 429/5xx with exponential backoff.
- **Job IDs are the full URL slug (everything after `/job/`), not a numeric ID** — e.g.
  `senior-sap-ewm-consultant-link-group-remote-1`. Pass the entire slug to `detail`,
  exactly as returned in a search result's `id`/`url` field.
- Salary information is parsed when available (common on this portal).
