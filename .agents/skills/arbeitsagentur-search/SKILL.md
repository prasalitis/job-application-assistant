---
name: arbeitsagentur-search
version: 1.0.0
description: >
  Search live job listings in Germany via the Bundesagentur für Arbeit (Federal
  Employment Agency) Jobsuche API. Use for job searches targeting Germany - any city
  or nationwide. Trigger phrases: job Germany, Jobsuche, Arbeitsagentur, Stellenangebot,
  German job board, jobs in Berlin/Hamburg/Munich/Frankfurt.
context: fork
allowed-tools: Bash(bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts *)
---

# Bundesagentur für Arbeit (Jobsuche) Search Skill

Search live job listings via Germany's Federal Employment Agency Jobsuche API. No
scraping, no HTML parsing for search (real JSON API); `detail` parses the public
job-detail webpage's embedded Angular state for the full description. Zero runtime
dependencies.

## When to use this skill

- Search for job openings anywhere in Germany
- Get the full description of a specific listing

## Commands

### Search job listings

```bash
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (job title, skill, role). German or
  English. Recommended.
- `--page <n>` — page number, **1-indexed**.
- `--limit <n>` / `-n <n>` — results per page. Default 20.
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts detail <refnr|url> [--format json|plain]
```

`refnr` is the reference number from a `search` result (e.g. `10001-1003474294-S` -
note it may contain a `/`, which the CLI URL-encodes automatically). Some
externally-sourced listings (e.g. via staffing-agency partners) have no viewable
detail page on arbeitsagentur.de and will report `NOT_FOUND` - this is expected, not
a bug (see `url-reference.md`).

## Usage examples

```bash
# SAM/ITAM or governance roles anywhere in Germany
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search -q "IT governance" --format table
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search -q "software asset manager" --format table

# Full details for a specific listing
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts detail 10001-1003474294-S --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing reference numbers to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- `search` hits a real JSON API (`rest.arbeitsagentur.de`); `detail` fetches the
  public job-detail webpage and parses its embedded Angular `ng-state` block - see
  `url-reference.md` for both shapes.
- No Cloudflare or bot-detection encountered - Bun's native `fetch()` works fine for
  both, zero runtime dependencies.
- Page numbers are **1-indexed** - `page=0` returns an API error.
- Reference numbers can contain a `/` (e.g. `13319-886497/1_618044LS-S`) - always pass
  them through as-is; the CLI URL-encodes them internally.
