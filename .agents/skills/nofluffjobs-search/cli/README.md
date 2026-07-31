# nofluffjobs-cli

CLI for searching jobs on **No Fluff Jobs** (https://nofluffjobs.com), a major
IT job portal for Central and Eastern Europe covering Poland, Hungary, Czech
Republic, Slovakia, Netherlands, Ukraine, Albania, and more.

**Data source**: No Fluff Jobs public HTML search and detail pages.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only
pulls dev type definitions.

> **⚠️ Personal use only.** This uses No Fluff Jobs' public job pages. Their
> robots.txt disallows `/api/` and `/posting/` paths but allows the public search
> pages. Keep volume low and don't use it commercially or for bulk data collection.
> Run it on your own responsibility.

## Installation

```bash
cd .agents/skills/nofluffjobs-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` recommended) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts
`--format json|plain`. All errors are written to **stderr** as
`{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Software Asset Management roles in Poland
bun run src/cli.ts search -q "software asset management" -l "Poland" --format table

# IT Asset Management roles remotely
bun run src/cli.ts search -q "IT asset management" --format table

# Developer jobs in Warsaw, limited to 5 results
bun run src/cli.ts search -q "developer" -l "Warsaw" --limit 5 --format table

# Full detail for a specific job
bun run src/cli.ts detail /job/senior-devops-engineer-company-remote-12345 --format plain
```

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (job title, skill, or role). Recommended. |
| `--location` | `-l` | Location filter (city or country name). Optional. |
| `--page` | | 1-indexed page (default 1). Note: pagination may not work as expected. |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | `-f` | `json` \| `table` \| `plain`. |

## Notes

- Data is from No Fluff Jobs' public HTML pages — no credentials required.
- Location filter uses client-side text matching against job locations, titles, and companies.
- The portal serves both English (`/job`) and Polish (`/pl/job`) paths; this CLI uses the English path.
- No Fluff Jobs uses lazy loading for pagination; the CLI currently fetches the first page only.
- Salary information is parsed when available (common on this portal).
- Job IDs are extracted from the URL slug (e.g., `/job/...-12345` where `12345` is the ID).

See `../SKILL.md` for the full skill description and trigger phrases.
