---
name: outcome
description: Records the result of a job application (interview stage reached, offer, rejection, no response) into job_search_tracker.csv and the per-application archive under documents/applications/, via the deterministic tools/outcome-record.ts script (fuzzy tracker matching, archive creation, file copying, append-only notes). Use for "/outcome <company>" or "/outcome" with no argument to list open applications.
user-invocable: true
allowed-tools: read_file write_file edit grep bash web_fetch ask_user_question
---

# /outcome - Record the Result of an Application

You are recording what happened to a job application: progress updates (interview invitations, stages completed, offers) and final resolutions (hired, rejected, no response). The data lands in two places the framework already reads but nothing systematically writes:

- `job_search_tracker.csv` - the status column used for dedup and exclusion in future ranking/scraping
- `documents/applications/<company>_<role>/` - the per-application archive (posting, submitted drafts, `outcome.md`)

`/outcome` writes the data; nothing else should interpret or restructure it. This command never edits the evaluation framework or profile files itself.

Follow these steps **in order**.

---

## Step 0: Parse Input

The skill argument may contain:

- Nothing → list open applications and use `ask_user_question` to ask which one to update
- A company name (optionally with a role), e.g. "acme" or "acme ml engineer" → target that application

---

## Step 1: Load State and Identify the Application

1. Read `job_search_tracker.csv`. If it does not exist, create it with the standard header:
   ```
   date,company,sector,role,role_type,channel,status,contact_person,fit_rating,notes,cv_file,cover_letter_file,source
   ```
2. **With an argument:** match rows case-insensitively on company (and role, if given). One match → proceed. Several → list them and ask. None → the application was made outside the workflow; collect company, role, date applied, channel, and posting URL from the user and add a tracker row.
3. **Without an argument:** list all rows whose status is not final (not hired / rejected / no response / withdrawn / offer declined) as a numbered table (company, role, date applied, current status) and ask which to update. If every row is resolved, say so and stop.
4. Derive the archive folder name: `documents/applications/<company>_<role>/` - lowercase, underscores for spaces. Check whether the folder and an `outcome.md` already exist - if so, you are updating, not creating.

---

## Step 2: Collect What Happened

Ask the user what happened, then classify:

**Progress updates** (application still open):
- Interview invitation / stage scheduled or completed (phone screen, technical, case, final round)
- Offer received (not yet accepted or declined)

**Resolutions** (application closed):
- `hired` - accepted an offer
- `offer_declined` - received an offer, turned it down
- `rejected` - explicit rejection at any stage
- `no_response` - no reply; if the user is unsure whether to call it, note how long it has been since the last contact and let them decide - do not impose a cutoff
- `interview_only` - reached interviews but the process stalled or was abandoned without an explicit rejection

Also collect, without interrogating - one or two open questions are enough:
- Dates for the stages reached. **Record dates at the precision the user actually gives you - never invent a specific day from a vague answer.** A verified test run asked about "mid-August 2026" and the workflow wrote `**Date resolved:** 2026-08-15` into `outcome.md` - a specific day the user never stated. If the user gives an approximate answer ("mid-August", "a couple weeks ago"), either ask a brief follow-up for the exact date if it matters, or write the approximation as given (e.g. `**Date resolved:** mid-August 2026`) rather than manufacturing false precision.
- Any feedback received, verbatim where the user remembers it
- What they'd do differently, and any signal about what the company valued

---

## Step 3: Archive the Application Materials and Update the Tracker (Script-Driven)

**Archive folder creation, file copying, tracker status/note updates, and dedup matching are now one deterministic script call - not separate AI-driven steps.** This replaces the previous Step 3 (manual archive logic) and Step 4 (manual tracker edit) entirely, closing two real bugs a verified test run found: `job_posting.md` being silently skipped with no mention anywhere, and a vague date ("mid-August 2026") being rewritten into a fabricated exact one (`2026-08-15`). Neither can happen here - the script's `note` field is never touched, reformatted, or date-parsed (whatever string you pass is exactly what lands on disk), and `job_posting.md`'s exact status is always a field in the JSON output, with no code path that omits it.

```bash
bun run tools/outcome-record.ts \
  --company "<Company>" --role "<Role, as it appears in the tracker or close to it - fuzzy-matched>" \
  --tracker job_search_tracker.csv --status <in_progress|hired|offer_declined|rejected|no_response|interview_only> \
  --note "<dated note, EXACTLY as the user described it - never reformat a date into a more precise one than given>" \
  --archive-root documents/applications \
  --cv-source cv/main_<company>.tex --cover-source cover_letters/cover_<company>_<role>.tex
```

The script fuzzy-matches company+role against the tracker (same matcher as `tools/dedup-check.ts`), creates the archive folder if missing, copies `cv_draft.tex`/`cover_letter.tex` from the given sources if they exist and aren't already archived, updates the tracker's `status` column, and appends (never overwrites) the given note. Omit `--cv-source`/`--cover-source` if no draft files exist for this application - the script reports `sourceExisted: false` rather than erroring.

**Read the JSON output and act on every field, especially `filesArchived.jobPosting`:**
- If `jobPosting.exists` is `false`, its `note` field explains the script deliberately did not create it (fetching/pasting a posting is a judgment call). At this point - not before, not skipped - try `web_fetch` on the tracker row's `source` URL if it looks like a real URL; if the source isn't a real URL or the fetch fails, ask the user to paste the posting, or write an explicit "unavailable" stub. **Never reconstruct a posting from memory.** Whatever you do here must be named in the Step 6 report.
- If the script's exit code is 1 and `matchedRow` is `null`, no tracker row matched - the application was made outside the workflow. Collect company, role, date applied, channel, and posting URL from the user, add a new tracker row yourself via `edit` (matching the existing header format), then re-run the script.

---

## Step 4: Write outcome.md

The script does not write `outcome.md` itself - that's a richer structured document than a single tracker note, and deciding its content (which stage checkboxes to tick, how to phrase what changed) is a judgment call, not a mechanical one. Write or update `documents/applications/<company>_<role>/outcome.md` (the archive folder from Step 3's output) in this format:

```markdown
# Outcome: <Company> — <Role>

**Status:** in_progress | hired | offer_declined | rejected | no_response | interview_only

**Date resolved:** <exactly as the user gave it - see the date-precision rule in Step 2; never more precise than stated>

## Interview stages reached
- [x] Phone screen (YYYY-MM-DD)
- [ ] Technical interview
- [ ] Case interview
- [ ] Final round
- [ ] Offer received

## Notes
<feedback received, what to do differently, signals about what they valued -
appended per update with a date, never overwritten>
```

Update rules: tick stage checkboxes as they are reached (add the date in parentheses, at whatever precision was given), append dated entries to Notes, and only change `Status` from `in_progress` to a final value on resolution. Re-running `/outcome` on the same application is idempotent - it appends new information, never duplicates or rewrites history.

---

## Step 5: Calibration Note

Count the `outcome.md` files under `documents/applications/` with a **final** status (not `in_progress`).

- If 3 or more are resolved (or 2+ share a pattern - same role type rejected twice, same sector going silent), mention it to the user as a pattern worth noticing. (The Claude Code original suggested running `/setup` here to recalibrate the evaluation framework automatically; that hasn't been ported to this Vibe workspace yet, so just surface the pattern in prose for now rather than referencing a command that doesn't exist here.)

---

## Step 6: Confirm

Summarize what was recorded, **relaying the actual `tools/outcome-record.ts` JSON fields rather than re-describing them in your own words** - this is the same reason the script exists: a free-text summary is where a silent omission or invented detail can creep back in.

> **Outcome recorded for <Role> at <Company>.**
>
> - `documents/applications/<company>_<role>/outcome.md` - status: <status>, <what changed>
> - Archived (from the script's `filesArchived` field): cvDraft <copied/already present/no source>, coverLetter <copied/already present/no source>, jobPosting <exists/created this run/still missing - state exactly what you did about it in Step 3, per the `jobPosting.note` field>
> - Tracker (from the script's `matchedRow`/`trackerUpdated` fields): status <previousStatus> → <new status>

If the update recorded an upcoming or newly scheduled interview stage, also suggest:

> "Interview coming up? `/interview <company>` builds a prep pack for that stage from this application's archive."

---

## Important Rules

1. **Write data, don't interpret it.** This command never edits profile or framework files.
2. **The archived version is the submitted version.** Existing files in the application folder are never overwritten by fresher drafts - `tools/outcome-record.ts` enforces this mechanically (it never copies over an existing `cv_draft.tex`/`cover_letter.tex`).
3. **Never fabricate.** A dead posting URL gets a user-pasted copy or an explicit "unavailable" stub, not a reconstruction. Feedback is recorded as the user reports it, at the precision they gave it - the script's `--note` value is never touched, reformatted, or date-parsed, specifically so this can't happen mechanically either.
4. **Idempotent updates.** Re-running on the same application appends new stages and notes; it never duplicates folders, rows, or history - verified directly: running `tools/outcome-record.ts` twice on the same application correctly skipped re-copying already-archived files and correctly appended (not duplicated) the tracker note.
5. **The tracker/archive mechanics are a script, not AI discipline.** `tools/outcome-record.ts` handles fuzzy company+role matching, archive folder creation, file copying, and the tracker CSV update. Do not hand-edit `job_search_tracker.csv` for an existing row's status/notes outside the script - the only exception is Step 3's fallback for adding a brand-new row when no tracker entry exists yet to match against.
