---
name: rank
description: Triages scraped jobs from job_scraper/seen_jobs.json into a ranked shortlist using triage-depth scoring (posting text vs. profile rubric, no company research). Use for "/rank", "/rank <focus area>", or "/rank --all --top <N>".
user-invocable: true
allowed-tools: read_file write_file edit grep bash web_fetch task ask_user_question
---

# /rank - Triage Scraped Jobs into a Ranked Shortlist

You are batch-scoring the jobs that the scraper skills have collected into `job_scraper/seen_jobs.json`, so the user can decide where to spend `apply` effort. `/rank` scores every new posting against the fit framework and returns a ranked shortlist.

`/rank` produces **triage scores**, not final evaluations. It scores from the posting text and the candidate profile only - no company research, no reviewer subagent. `apply`'s Step 1 evaluation (which adds company research) remains authoritative and always re-runs when the user applies.

**Dependency note:** this skill assumes jobs have already been collected into `job_scraper/seen_jobs.json` by running the `scrape` skill (`.agents/skills/job-scraper/`) or an individual portal scraper skill directly (`linkedin-search`, `jobindex-search`, etc.). If `seen_jobs.json` has no `new`-status entries, tell the user to run `scrape` first.

Follow these steps **in order**.

---

## Step 0: Parse Input

The skill argument may contain:

- Nothing → rank all jobs with status `new` in `job_scraper/seen_jobs.json`
- A focus area (e.g. "data science") → rank only jobs whose title or stored fit-notes match the focus
- `--all` → re-rank every job that has not been applied to, including previously ranked ones (useful after the profile changes)
- `--top <N>` → shortlist size (default 5)

---

## Step 1: Load State

1. Read `job_scraper/seen_jobs.json`. If the file is missing or has no entries, tell the user to run a portal scraper skill first and stop.
2. **Build the exclusion set with the deterministic dedup script, not a manual comparison.** Write the `seen_jobs.json` entries with status `new` (or all non-applied entries, if `--all`) to a temporary candidates JSON file, then run:
   ```bash
   bun run tools/dedup-check.ts --candidates /tmp/rank-candidates.json \
     --seen-jobs job_scraper/seen_jobs.json --tracker job_search_tracker.csv
   ```
   Exclude any candidate whose verdict is `duplicate`. Keep candidates with `not_duplicate` or `review` in scope for ranking, but for `review` candidates, carry the ambiguity note through to the Step 5 presentation (e.g. "possible near-duplicate of an existing tracker entry") rather than silently ranking it as if fully new. This script call replaces a prose-only fuzzy-match instruction that a verified test run of the sibling `scrape` skill got wrong in practice: it presented ABB's "IS Department Manager for Software and SaaS Category" (Kraków) as new because the check only compared `seen_jobs.json` job IDs, never actually cross-referencing the tracker's company/role text (which used "Kraków" where the new posting said "Cracow"). A deterministic script call cannot repeat that specific mistake, since it's the same code path every time rather than a fresh judgment call per run.
3. Select candidates: entries with status `new` (or all non-applied entries with `--all`), minus the excluded `duplicate` set from step 2, filtered by the focus area if one was given.
4. If no candidates remain, say so ("Nothing new to rank") and stop.
5. Resolve and read the scoring framework and profile **once** - personal data first, generic fallback otherwise, same pattern as `apply`:
   ```bash
   bun run tools/resolve-doc.ts --primary personal/04-job-evaluation-criteria.md --fallback .agents/skills/job-application-assistant/04-job-evaluation.md
   bun run tools/resolve-doc.ts --primary personal/01-candidate-profile.md --fallback .agents/skills/job-application-assistant/01-candidate-profile.md
   ```
   Read each call's `resolvedPath`.

State how many jobs will be ranked before proceeding.

---

## Step 2: Batch-Fetch and Score

Dispatch parallel calls to the `job-scorer` subagent via the `task` tool, ~5 jobs per call (a single call is fine for ≤5 jobs). Token-efficiency rules, consistent with `apply`:

- Pass each call everything it needs **inline in the task prompt** - the job list (title, company, URL) and a compact scoring rubric extracted from the files you read in Step 1: the strong/moderate/weak skill match areas, direct/adjacent experience domains, behavioral thrive/drain factors, career goals, deal-breakers, and the location constraints. Do **not** make the subagent try to read the profile files - it has no `read_file` access anyway.
- The subagent fetches each posting URL with `web_fetch` and scores **only from actually fetched content**.
- Scope is triage: posting text vs. rubric. **No company research, no salary lookup, no web searches** - that depth belongs to `apply`.

Example dispatch:

```
task(
  agent = "job-scorer",
  task = "
    Score these jobs against this rubric.

    ## Jobs
    [{ \"key\": \"...\", \"title\": \"...\", \"company\": \"...\", \"url\": \"...\" }, ...]

    ## Rubric
    [compact rubric extracted from 04-job-evaluation.md and 01-candidate-profile.md]
  "
)
```

Each call returns a JSON array per its own system prompt format (see `.vibe/prompts/job-scorer.md`). Each scored job includes `strengths` and `gaps` arrays (1-3 bullets each, grounded in the posting text).

---

## Step 3: Aggregate and Rank

Back in the main context, for each scored job:

1. Compute the overall score with the weighting from `04-job-evaluation.md` (Technical 30%, Experience 25%, Behavioral 15%, Career Alignment 30%; location is unweighted).
2. Map to the framework's verdict bands (Strong Fit 75+, Good Fit 60-74, Moderate Fit 45-59, Weak Fit 30-44, Poor Fit <30).
3. **Location veto:** `FAIL` (e.g. requires relocation to somewhere off-target) excludes the job from the shortlist no matter the score - list it separately with the reason. `FLAG` (e.g. heavy travel) stays in the ranking but carries a visible ⚠ marker.
4. **Deadline urgency:** a deadline within 7 days gets a 🔥 marker and wins ties. A deadline that has already passed moves the job to `expired`.

Sort by overall score (descending), urgency as tiebreaker.

---

## Step 4: Update State

Update `job_scraper/seen_jobs.json` in place via `edit` - these fields are additive to the scraper's schema:

- Ranked jobs: set `"status": "ranked"` and add `"rank_score": <overall>`, `"rank_verdict": "<band>"`, `"rank_date": "YYYY-MM-DD"`, plus `"strengths": [...]` and `"gaps": [...]` copied verbatim from the scoring subagent's response for that job
- Dead or past-deadline jobs: set `"status": "expired"`

Store both arrays **verbatim** as the subagent returned them (1-3 bullets each) - never expand to prose, never reformat. `--all` re-scoring **replaces** both arrays with the fresh ones; they never accumulate across runs.

Do not modify `job_search_tracker.csv` - that file records applications, and `/rank` never applies. Re-running `/rank` is idempotent: already-`ranked` jobs are skipped unless `--all` re-scores them.

---

## Step 5: Present the Shortlist

```
## Job Ranking - YYYY-MM-DD

Ranked <N> new postings (<X> shortlisted, <Y> below threshold, <Z> expired/vetoed).

### Shortlist

| # | Score | Verdict | Title | Company | Location | Deadline | |
|---|-------|---------|-------|---------|----------|----------|---|
| 1 | 78 | Strong Fit | ... | ... | ... | ... | 🔥 |

### Why these ranked highest
**1. <Title> at <Company> (78)** - [2-3 strength bullets from the agent's findings] | Gaps: [1-3 honest gap bullets from the agent's findings]
[repeat for each shortlisted job]

### Below threshold
| Score | Verdict | Title | Company | One-line reason |

### Excluded
- <Title> at <Company> - location FAIL: requires relocation
- <Title> at <Company> - expired <date>
```

Rules for the presentation:

- Every claim traces to fetched posting text or the profile - no invented details.
- Say explicitly that these are **triage scores from the posting text only**, and that `apply` will re-evaluate with company research before anything is drafted.
- Then use `ask_user_question`: "Want to apply to any of these? Give me the number(s) and I'll start with the full apply workflow."
- If the user picks one, run the `apply` skill on that job's URL, passing the triage verdict as prior context but **re-running the full Step 1 evaluation** - triage never substitutes for it.

---

## Important Rules

1. **Never rank unfetched postings.** A job whose posting cannot be retrieved is marked expired, not guessed at.
2. **Triage depth only.** No company research, no salary lookups - `/rank` exists to be cheap enough to run on every scrape batch.
3. **Deal-breakers veto scores.** A 90-point job that fails a location deal-breaker is excluded, not ranked first.
4. **Honest scoring.** Gaps are reported per job; a low-scoring posting is presented as such.
5. **State stays consistent.** `seen_jobs.json` fields are only added, never restructured; the tracker is read-only for this command.
