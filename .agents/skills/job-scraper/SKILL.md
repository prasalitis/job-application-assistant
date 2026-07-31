---
name: scrape
description: >
  Scrapes job sites across your target markets for new positions matching your profile.
  Deduplicates across runs against job_scraper/seen_jobs.json and job_search_tracker.csv.
  Triggers on: job scrape, find jobs, search jobs, new jobs, job search, scrape jobs, /scrape
allowed-tools: read_file write_file edit grep bash git_bash web_fetch web_search ask_user_question
---

# Job Scraper

**Porting note:** the original Claude Code version of this skill used the `Agent` tool to dispatch parallel sub-searches. This ported version runs everything sequentially in the main context instead - slower, but it avoids needing a new pre-registered Vibe subagent (with its own `~/.vibe/config.toml` allowlist entry) just for this. If scrape runs feel slow in practice, a parallel-dispatch subagent (similar to `job-scorer`) could be added later.

---

## How It Works

This skill searches multiple job sites using targeted queries based on the profile, deduplicates against previously seen jobs and the application tracker, and presents new matches with a quick fit assessment.

## Invocation

The user triggers this skill by saying things like:
- "Find new jobs"
- "Scrape for jobs"
- "Any new positions?"
- "/scrape"

Optional arguments:
- A focus area, e.g. "/scrape data science" or "/scrape geophysics"
- "broad" to run all search categories, e.g. "/scrape broad"

---

## Execution Steps

### Step 0: Load State

1. Read `job_scraper/seen_jobs.json` (create if missing - start with `{"seen": {}}`) - this is for your own context on what's been searched before; the actual dedup decision in Step 2 is delegated to `tools/dedup-check.ts`, which reads this file itself.
2. Read `job_search_tracker.csv` to get a sense of the current pipeline - same note as above, `dedup-check.ts` re-reads it directly for the actual dedup check.
3. Resolve and read the search-strategy files - personal data first, generic fallback otherwise. This repo's real search strategy lives in a gitignored `personal/` folder that overrides the generic template files; `resolve-doc.ts` finds the right one deterministically rather than relying on you to remember to check:

```bash
bun run tools/resolve-doc.ts --primary personal/job-scraper-search-queries.md --fallback .agents/skills/job-scraper/search-queries.md
bun run tools/resolve-doc.ts --primary personal/job-scraper-target-companies.md --fallback .agents/skills/job-scraper/target-companies.md
```

Read each call's `resolvedPath`. All later steps that mention `search-queries.md` or `target-companies.md` refer to whichever path was resolved here.

**Efficiency-critical: never do per-candidate dedup tool calls.** A verified test run of this skill issued one separate tool call per candidate job to check membership in `seen_jobs.json` (dozens of calls across ~150+ candidates from 8 countries) and never reached Step 5 - it ran out of turns before producing any output at all. The fix for this is now structural, not just a discipline reminder: Step 2's dedup check is one script call for the entire batch (`tools/dedup-check.ts`), which reads both files itself and returns a verdict per candidate in a single pass - there is no per-candidate file lookup left to accidentally repeat.

### Step 1: Search

Use the search-strategy file resolved in Step 0 for the search strategy. By default, run the top 3 priority query categories. If the user said "broad", run all categories. If the user specified a focus area (e.g. "data science"), prioritize queries from that category.

**Use the installed CLI tools as the primary search mechanism.** Fall back to `web_search` only for portals that do not have a CLI skill, or if `bun` is unavailable on the system.

#### 1a. Check bun availability

```bash
bun --version
```

If this fails (bun not installed), skip to **1c (web_search fallback)** for all portals and note the fallback in the Step 5 output.

#### 1b. Run CLI tools (primary)

Discover all installed portal CLI skills by reading every `SKILL.md` found under `.agents/skills/*/SKILL.md` (use `bash`/`git_bash`: `find .agents/skills -maxdepth 1 -name "*-search" -type d`, then read each one's `SKILL.md`). Each file documents that portal's exact CLI flags and usage examples. **Use each portal's own documented interface - do not guess flags.** This approach automatically includes any new portals added via the `add-portal` skill without requiring changes to this file.

For each installed portal skill:

1. Read its `SKILL.md` to find the correct `bun run …` invocation and supported flags.
2. Translate the query terms from `search-queries.md` into that portal's flag format (e.g. `--key`, `--search-string`, `--query`, filter codes - whatever the portal's SKILL.md specifies).
3. Scope to the last 14 days using the portal's supported recency flag (`--jobage`, `--since <YYYY-MM-DD>`, `--order PublicationDate`, etc. - as documented per portal).
4. Cap results to ~20 per call using the portal's limit flag.
5. Use `--format json` for machine-readable output.

Run the portal CLI calls one at a time via `bash`/`git_bash` (see porting note above re: no parallel dispatch in this version). Collect all `results` arrays into a single pool for Step 2.

If a CLI tool exits with a non-zero code, log the error message and continue - do not abort the whole search.

#### 1c. web_search fallback

Use `web_search` for:
- Portals listed in `search-queries.md` that do **not** have a corresponding directory under `.agents/skills/`
- Any portal whose CLI fails at runtime
- When bun is unavailable (Step 1a failed)

Use the site-specific query strings from `search-queries.md` directly as `web_search` queries for these portals.

### Step 2: Fetch & Parse

**Scope guardrail:** if the combined candidate pool from Step 1 (across all countries/categories run) exceeds roughly 40-50 postings, do not attempt to detail-fetch and assess every single one in this run. Process in priority order (highest-priority query category first, per `search-queries.md`), stop once a reasonable batch (~30-40 detail-fetches) is done, and tell the user in the Step 5 output that this was a partial pass with an offer to continue with the remaining categories/countries in a follow-up run. **A verified test run attempted the full pool from 8 countries at once and never reached Step 5 at all** - a partial but delivered result is strictly better than a thorough but never-delivered one.

For each promising result from Step 1:
- Use `web_fetch` to retrieve the job posting page
- Extract: **job title**, **company**, **location**, **posting date** (or "recent"), **URL**, **key requirements** (brief), **application deadline** (if listed)

**Deduplication is now a deterministic script call, not a judgment call.** After fetching details for a batch of candidates, write them to a temporary JSON file and run `tools/dedup-check.ts` **once for the whole batch** - never per-candidate, and never by eyeballing a string comparison yourself. This exists because the earlier prose-only version of this rule ("compare using a punctuation/spelling-tolerant comparison") was followed inconsistently by different AI runs: one run missed "Cracow" vs "Kraków" as the same posting entirely. A deterministic script gives the same answer every time.

```bash
# Write candidates (from this batch's web_fetch results) to a temp file, e.g.:
#   [{ "key": "<url>", "company": "...", "title": "..." }, ...]
bun run tools/dedup-check.ts --candidates /tmp/scrape-candidates.json \
  --seen-jobs job_scraper/seen_jobs.json --tracker job_search_tracker.csv
```

Handle each result by its `verdict`:
- **`duplicate`** - skip silently (do not present, do not re-add to `seen_jobs.json` under a new key). This is a safe, deterministic match (formatting/noise only).
- **`not_duplicate`** - proceed as a genuinely new candidate.
- **`review`** - proceed as a candidate, but note the ambiguity plainly in the Step 5 output (e.g. "possible near-duplicate of an existing tracker entry - verify before applying") rather than silently treating it either way. This is the deliberately-not-automated case (e.g. a "Senior" variant of an already-applied role) - a human or AI judgment call, not a string-distance guess.

### Step 3: Quick Fit Assessment

For each new job, do a rapid fit check (NOT the full evaluation from `04-job-evaluation.md` - just a quick signal):

- **High match**: Role directly involves core skills
- **Medium match**: Role is adjacent to experience
- **Low match**: Role requires significant skills lacking

### Step 4: Deduplicate & Store

1. Add ALL fetched jobs (new and skipped) to `seen_jobs.json` via `edit` with structure:
```json
{
  "seen": {
    "<url_or_company_title_key>": {
      "title": "...",
      "company": "...",
      "url": "...",
      "first_seen": "YYYY-MM-DD",
      "fit": "high/medium/low",
      "status": "new/skipped/evaluated/ranked/expired"
    }
  }
}
```
2. Only present jobs NOT already in the seen list or tracker.

### Step 5: Present Results

Present new jobs in a table sorted by fit (high first):

```
## New Job Matches - YYYY-MM-DD

Found X new positions (Y high, Z medium, W low match).

| # | Fit | Title | Company | Location | Deadline | URL |
|---|-----|-------|---------|----------|----------|-----|
| 1 | High | ... | ... | ... | ... | [Link](...) |

### High-Match Highlights
For each high-match job, add 2-3 bullet points:
- Why it matches the profile
- Key requirements to check
- Any red flags
```

After presenting, use `ask_user_question`:
> "Want me to evaluate any of these in detail? Just give me the number(s)."

If the user picks a number, invoke the **apply** skill (fit evaluation first, then CV + cover letter if approved).

If the run found many new jobs (roughly 8+), also suggest the **rank** skill - it batch-scores all new postings against the full fit framework and returns a ranked shortlist, which beats eyeballing a long table. (`rank` sets the `ranked` and `expired` status values in `seen_jobs.json`; treat both as already-seen for dedup purposes.)

### Step 6: Update Tracker (Optional)

If the user decides to apply to any job, add a row to `job_search_tracker.csv` via `edit`.

---

## Important Rules

1. **Never fabricate job postings.** Only present jobs found via actual `web_search`/`web_fetch` results.
2. **Respect deduplication.** Always check `seen_jobs.json` AND `job_search_tracker.csv` before presenting.
3. **Focus on configured geographic area.** Skip jobs that require relocation outside target markets or commute range, per `search-queries.md`'s Location Filter.
4. **Only open positions.** Skip postings with expired deadlines or those marked as closed.
5. **Be efficient with web_fetch.** Don't fetch every search result - use titles and snippets to pre-filter before fetching.
6. **Sequential, not parallel, in this ported version.** See the porting note at the top - the original used parallel Agent dispatch; this version runs sequentially.
