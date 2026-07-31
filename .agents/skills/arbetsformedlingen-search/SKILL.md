---
name: arbetsformedlingen-search
version: 1.0.0
description: >
  Search live job listings in Sweden via the official JobTech Dev public API
  (Arbetsförmedlingen / Platsbanken - the Swedish Public Employment Service). Use for
  job searches targeting Sweden - any city or nationwide. Trigger phrases: job Sweden,
  Platsbanken, jobb Sverige, Swedish job board, Arbetsförmedlingen.
context: fork
allowed-tools: Bash(bun run .agents/skills/arbetsformedlingen-search/cli/src/cli.ts *)
---

# Arbetsförmedlingen (Platsbanken) Search Skill

Search live job listings via the official, government-run JobTech Dev open-data API
(`jobsearch.api.jobtechdev.se`) that backs arbetsformedlingen.se. Unlike the other
portal skills in this repo, **this is a real, documented public API, not a scraped
website** - no HTML parsing, no bot-detection to work around, no Terms-of-Service
ambiguity. No authentication, zero runtime dependencies.

## When to use this skill

- Search for job openings anywhere in Sweden
- Filter by recency (posted within N days) or likely remote-work postings
- Get the full description, deadline, and employment type of a specific listing

## Commands

### Search job listings

```bash
bun run .agents/skills/arbetsformedlingen-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (job title, skill, role). Swedish or
  English. Recommended.
- `--jobage <days>` — only include postings published within N days.
- `--remote` — only ads the API's phrase-matching considers likely remote-friendly.
- `--page <n>` — page number (1-indexed).
- `--limit <n>` / `-n <n>` — results per page (API max 100). Default 20.
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/arbetsformedlingen-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric ad ID from a `search` result (e.g. `30624866`). You may also pass
a full `arbetsformedlingen.se/platsbanken/annonser/...` URL. **Note:** the search
response already includes the full job description - `detail` is mainly useful when
you have a bare ID without having searched for it first.

## Usage examples

```bash
# SAM/ITAM or governance roles anywhere in Sweden
bun run .agents/skills/arbetsformedlingen-search/cli/src/cli.ts search -q "IT governance" --format table
bun run .agents/skills/arbetsformedlingen-search/cli/src/cli.ts search -q "software asset manager" --jobage 30 --format table

# Full details for a specific listing
bun run .agents/skills/arbetsformedlingen-search/cli/src/cli.ts detail 30624866 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data source: the official JobTech Dev REST API, not scraped HTML - see
  `url-reference.md` for the full parameter set (much more is available than this CLI
  currently exposes, e.g. taxonomy-code-based location/occupation/skill filters,
  salary and language-requirement fields).
- No bot-detection or Cloudflare encountered - this is a real government API meant
  for programmatic access.
- Search results already include the full job description text, not a truncated
  snippet - unlike some other portal skills in this repo.
- Location filtering by free-text city name is not yet implemented (the API wants
  taxonomy codes, not city strings) - see `url-reference.md`'s "Not yet confirmed" section.
