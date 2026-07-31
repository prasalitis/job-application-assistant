---
name: moovijob-search
version: 1.0.0
description: >
  Search live job listings on moovijob.com, Luxembourg's job board (Luxembourg only -
  not Belgium, despite the two often being grouped together). Use for job searches
  targeting Luxembourg. Trigger phrases: job Luxembourg, emploi Luxembourg, jobs
  Luxembourg, Luxembourg job board, moovijob.
context: fork
allowed-tools: Bash(bun run .agents/skills/moovijob-search/cli/src/cli.ts *)
---

# moovijob.com Search Skill

Search live job listings from moovijob.com's public English-language pages. No
authentication, no API key. Data comes from the site's own schema.org `JobPosting`
structured data on detail pages (see `url-reference.md`), not fragile ad-hoc scraping,
so detail results are clean and unlikely to break on minor markup changes.

**Scope: Luxembourg only.** Despite Luxembourg and Belgium often being grouped
together as a search region, this portal has no Belgium content.

## When to use this skill

- Search for job openings in Luxembourg
- Get the full description, deadline, and employment type of a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/moovijob-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (job title, skill, role). English or
  French. Recommended.
- `--page <n>` — page number (1-indexed).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/moovijob-search/cli/src/cli.ts detail <url|company-slug/title-slug> [--format json|plain]
```

Accepts either a full moovijob.com job-offers URL from a `search` result, or the
`<company-slug>/<title-slug>` path shorthand. Returns the full description, deadline,
and employment type.

## Usage examples

```bash
# SAM/ITAM or governance roles in Luxembourg
bun run .agents/skills/moovijob-search/cli/src/cli.ts search -q "IT governance" --format table
bun run .agents/skills/moovijob-search/cli/src/cli.ts search -q "software asset manager" --format table

# Full details for a specific offer
bun run .agents/skills/moovijob-search/cli/src/cli.ts detail advanzia-bank/junior-ict-governance-officer --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing URLs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- **Requires `curl` on the system PATH.** moovijob.com sits behind Cloudflare, which
  blocks Bun's native `fetch()` (confirmed live, same as `pracuj-search`) - this skill
  shells out to `curl` instead. See `url-reference.md` for details.
- Search results carry a **relative** posting date ("1w ago", "6 h") - there is no
  confirmed `--jobage` filter, unlike `pracuj-search`, since relative-time text isn't
  reliably convertible to an exact day count.
- `detail`'s data comes from the page's schema.org `JobPosting` JSON-LD block, not
  scraped HTML - see `url-reference.md` for the exact shape.
- No numeric-only job ID exists for this portal; the full `<company>/<title>` slug
  path is the identifier.
