---
name: apply
description: Drafter-reviewer job application workflow. Evaluates a job posting against the candidate's profile, drafts a tailored CV and cover letter, dispatches a read-only app-reviewer subagent to research the company and critique the drafts, applies the feedback, compiles and verifies both PDFs via deterministic scripts (tools/latex-lint.ts, tools/pdf-verify.ts), and reports final status. Use for "/apply <job posting URL or pasted text>".
user-invocable: true
allowed-tools: read_file write_file edit grep bash git_bash web_search web_fetch task ask_user_question
---

# /apply - Drafter-Reviewer Job Application Workflow

You are orchestrating a two-agent job application workflow. The job posting is provided below as the skill argument (either a URL or pasted text).

Follow these steps **exactly in order**. Do not skip steps.

**Token-efficiency rules for this workflow:**
- Never re-read a file whose contents are already in your context from an earlier step. If you read it in Step 1, it is still available in Step 2.
- When dispatching the reviewer subagent via `task`, pass draft content **inline in the task prompt** rather than asking it to read_file drafts you already have in memory.
- Run the full verification checklist exactly once, at the end (Step 6). The reviewer focuses on content critique, not verification.
- Step 5 (compile and inspect PDFs) is mandatory and non-skippable — LaTeX page-break decisions are unpredictable, and `.tex` files that look fine often produce broken PDFs.

---

## Step 0: Parse Input

- If the argument looks like a URL, use `web_fetch` to retrieve the job posting content.
- If it is pasted text, use it directly.
- Extract: **company name**, **role title**, **department** (if mentioned), **location**, and **language** of the posting (Danish or English).
- Store these for use throughout the workflow.

---

## Step 1: DRAFTER - Evaluate Fit

**Resolve and read the evaluation framework - personal data first, generic fallback otherwise.** This repo's real candidate data lives in a gitignored `personal/` folder that overrides the generic template files; `resolve-doc.ts` finds the right one deterministically rather than relying on you to remember to check:

```bash
bun run tools/resolve-doc.ts --primary personal/04-job-evaluation-criteria.md --fallback .agents/skills/job-application-assistant/04-job-evaluation.md
bun run tools/resolve-doc.ts --primary personal/01-candidate-profile.md --fallback .agents/skills/job-application-assistant/01-candidate-profile.md
```

Read each call's `resolvedPath`.

Using the framework from `04-job-evaluation.md`, evaluate the job posting against the candidate's profile. If the salary lookup tool is configured, run:

```bash
python salary_lookup.py "<Company Name>" --json
```

If the posting specifies a city, add `--city "<City>"` to narrow results. Parse the JSON output and include the salary benchmark in the evaluation. If the tool is not configured or returns an error, skip the salary benchmark.

Present the evaluation to the user with:

1. **Skills match** - which required/preferred skills match vs. gaps
2. **Experience match** - how work history maps to the role
3. **Behavioral/culture match** - how behavioral profile fits the role/company culture
4. **Salary benchmark** - salary index for the company (if available)
5. **Overall fit score** and recommendation (strong fit / moderate fit / weak fit)

After presenting the evaluation, use `ask_user_question` to ask:
> "Should I proceed with drafting the CV and cover letter for this role?"

**If the user says no, stop here.** If yes, continue to Step 2.

---

## Step 2: DRAFTER - Draft CV + Cover Letter

You already have `01-candidate-profile.md` and `04-job-evaluation.md` in context from Step 1. **Do not re-read them.**

Resolve and read the reference files you do not yet have (personal-first, same pattern as Step 1):
```bash
bun run tools/resolve-doc.ts --primary personal/03-writing-style-overrides.md --fallback .agents/skills/job-application-assistant/03-writing-style.md
bun run tools/resolve-doc.ts --primary personal/05-profile-statements.md --fallback .agents/skills/job-application-assistant/05-cv-templates.md
bun run tools/resolve-doc.ts --primary personal/06-cover-letter-preferences.md --fallback .agents/skills/job-application-assistant/06-cover-letter-templates.md
```
**Note the asymmetry for `05` and `06`:** the personal files (`05-profile-statements.md`, `06-cover-letter-preferences.md`) hold only the personal *override* content (actual profile-statement text, actual contact details, closing-line preference) - they do not replace the generic CV/cover-letter framework (compile instructions, page budget, cutting rules, ATS guidance), which always needs reading from the `.agents/` file regardless of whether a personal override exists. So for `05` and `06`, read **both** the resolved personal file (if `usedPrimary: true`) **and** the generic `.agents/` file - the personal file supplies the actual content, the generic file supplies the rules for using it. For `03`, the personal file only adds overrides on top of generic writing-style rules, so the same both-if-present logic applies there too.

Also read the most recent existing CV and cover letter files for concrete structural reference (one of each is enough):
- Read any existing `cv/main_*.tex` file as a LaTeX template reference
- Read any existing `cover_letters/cover_*.tex` or `cover_letters/Cover_*.tex` file as a template reference

### CV (`cv/main_<company>.tex`)
- Always in **English**
- Follow the moderncv/banking format from `05-cv-templates.md`
- Tailor the profile statement and experience bullets to the specific role
- Reframe skills and achievements to match job requirements
- Keep to 2 pages

### Cover Letter (`cover_letters/cover_<company>_<role>.tex`)
- **Match the language of the job posting** (Danish posting -> Danish cover letter, English posting -> English cover letter)
- Follow the structure from `06-cover-letter-templates.md`
- Use the `cover.cls` template
- Tailor the opening paragraph to the specific role and company
- Address to a named person if available in the posting, otherwise "Dear Hiring Manager" (or equivalent in posting language)
- Keep to approximately one page
- Any mention of agentic coding or AI tooling must reference **Claude Code** by name
- **Escape LaTeX special characters as you write, not after.** Any `&`, `%`, `$`, `#`, or `_` in dynamically-inserted content (job titles, department names, company names) must be escaped (`\&`, `\%`, `\$`, `\#`, `\_`) at the moment you write it. A verified test run of this workflow hit repeated compile failures from an unescaped `&` in a job title (e.g. "Vendor Management & Software Asset Management"), costing several fix-and-recompile cycles that a check at write-time would have avoided entirely.
- **Avoid em-dashes and other non-ASCII punctuation in generated content; prefer a colon, comma, or plain hyphen instead.** A separate verified test run got stuck in a multi-edit loop trying to fix an em-dash in a "Speaking Engagements" line, cycling through a mangled Unicode artifact (literal `ó` in place of the dash), then `---`, then `\textbar`, before landing on a rewritten sentence that avoided the character entirely - and **that rewrite introduced a factual error** (changed the real event location from Oslo to Warsaw, apparently pulled from the unrelated job posting's location rather than checked against the profile) and used an invented command, `\textcomma{}`, which is not a standard LaTeX command in this template's package set and risks an "Undefined control sequence" compile failure. The lesson isn't just an encoding fix - it's that **fighting a formatting problem by rewriting content from scratch is exactly when a fact can silently get swapped for a wrong one.** Prefer simple ASCII punctuation up front so this class of struggle doesn't arise, and if a rewrite becomes necessary mid-edit for any reason, re-verify every fact in the rewritten sentence against the source profile before moving on, not just the formatting.

Write both files to disk using `write_file`. Keep the exact text of both drafts in working memory - you will pass them inline to the reviewer subagent in Step 3 and revise them in Step 4 without re-reading.

**Mandatory lint gate before proceeding to Step 3.** Run the deterministic linter on both files - this replaces relying on write-time discipline alone for the escaping/punctuation/spec-compliance rules above, since three separate verified test runs showed that discipline isn't reliably followed in practice:

```bash
bun run tools/latex-lint.ts --file cv/main_<company>.tex
bun run tools/latex-lint.ts --file cover_letters/cover_<company>_<role>.tex --cover-letter
```

If either call reports `"clean": false`, fix every issue it lists (using `edit`, or `write_file` per the Step 4 fallback rule below if a single `edit` attempt fails) and re-run the linter until both files come back clean. Do not proceed to Step 3 with a non-clean file - this is a zero-cost, zero-ambiguity check, so there is no reason to compile first and discover the same issue as a LaTeX error instead.

---

## Step 3: REVIEWER - Research & Critique

Use the `task` tool to delegate to the `app-reviewer` subagent. It has its own read-only, research-only system prompt (`.vibe/prompts/app-reviewer.md`, config at `.vibe/agents/app-reviewer.toml`) - **and no `bash` access, so it cannot run `resolve-doc.ts` itself.** Resolve the one remaining reference path it needs (02) here, then pass all four resolved paths inline in the task prompt so the reviewer only ever does a plain `read_file` on a path you give it, never its own resolution:

```bash
bun run tools/resolve-doc.ts --primary personal/02-behavioral-profile.md --fallback .agents/skills/job-application-assistant/02-behavioral-profile.md
```

Pass the drafts **inline in the task prompt** (do not make the reviewer read_file them).

Replace `<COMPANY>`, `<ROLE>`, `<JOB_POSTING_TEXT>`, `<CV_DRAFT>`, `<COVER_LETTER_DRAFT>`, and the four `<RESOLVED_..._PATH>` placeholders (from this step's and Step 1/2's `resolve-doc.ts` calls) with actual values, then call:

```
task(
  agent = "app-reviewer",
  task = "
    Review this job application draft.

    ## Job posting
    <JOB_POSTING_TEXT>

    ## CV draft (cv/main_<COMPANY>.tex)
    <CV_DRAFT>

    ## Cover letter draft (cover_letters/cover_<COMPANY>_<ROLE>.tex)
    <COVER_LETTER_DRAFT>

    ## Reference file paths (read these exact paths with read_file - already resolved, personal-data-first)
    - Candidate profile: <RESOLVED_01_PATH>
    - Behavioral profile: <RESOLVED_02_PATH>
    - Writing style: <RESOLVED_03_PATH>
    - Job evaluation criteria: <RESOLVED_04_PATH>

    Follow your system prompt: research the company, read the four reference files at the
    exact paths given above, and return Part A (structured JSON edits) and Part B (narrative
    suggestions by category).
  "
)
```

---

## Step 4: DRAFTER - Revise Based on Feedback

**If a single `edit` call fails on the same paragraph more than twice, stop trying to patch around it - rewrite the whole file with `write_file` instead.** A verified test run got stuck for dozens of turns trying to edit a paragraph containing apostrophes ("emagine Polska's", "emagine's") - cycling through `sed` one-liners, several throwaway Python scripts (`fix_cover.py`, `fix_cv.py`, `fix_cv_length.py`, `fix_cv_length2.py`), and even a `git checkout` to revert and retry, before eventually succeeding. This burned an enormous amount of the run's turn budget on what should have been a simple text change, and very likely contributed to a later context-size failure in the same session. `write_file` with the corrected full content, using the draft you already hold in memory from Step 2, is far more reliable than compounding shell-escaping workarounds - use it as soon as a second `edit` attempt on the same spot fails, not as a last resort after many attempts. If you do fall back to `bash`/`git_bash` scripting for any reason, delete every scratch file it created (`.py`, `.sh`, `_new.tex`, etc.) before moving on - a verified test run's scratch scripts were cleaned up correctly, so this discipline is achievable, just make sure it happens every time, not only when remembered.

Once the reviewer subagent returns its feedback:

1. **Apply Part A (structured edits) directly with `edit`.** Do NOT re-read the draft files — you already have them in context from Step 2, and the reviewer's `old_string` values were quoted from that same text. For each edit in the JSON array, call `edit` with the given `file`, `old_string`, and `new_string`. Skip any whose rationale would require fabricating content.
2. **Apply Part B (narrative suggestions)** using judgment. These need interpretation, not mechanical replacement. Walk through every Part B category the reviewer returned and address it:
   - **Missed keywords/requirements:** add the keyword or capability where it fits naturally in the CV or cover letter. Prefer the experience bullets (concrete evidence) over the profile statement (abstract claim).
   - **Company/department-specific angles:** weave the reviewer's research into the cover letter opening or motivation paragraph. Verify every company claim via `web_fetch`/`web_search` before including it — do not trust reviewer research at face value.
   - **Action-oriented reframing:** rewrite passive or generic phrasing (CV profile statement, cover letter opening, bullet leads).
   - **Tone and style issues:** apply the writing-style-guide fixes (no em-dashes, no cliches, no apologetic hedging, consistent first-person active voice).
   Use `edit` for targeted changes; only re-read a file if an edit fails because the surrounding text has shifted.
3. Do NOT incorporate any suggestion that would fabricate skills or experience. If a posting requirement is a genuine gap, acknowledge it honestly and frame adjacent experience instead.

After all edits are applied, the two files on disk are the final drafts.

**Re-run the lint gate.** The reviewer's edits (Step 4) can reintroduce an issue the Step 2 gate already cleared - e.g. a suggested keyword or company name containing an `&`, or a rewritten sentence using an em-dash. Re-run both `tools/latex-lint.ts` calls from Step 2 and fix anything flagged before moving to Step 5.

---

## Step 5: DRAFTER - Compile & Inspect PDFs (MANDATORY)

**Never skip this step.** Compile both documents and verify them with the deterministic wrapper before presenting - this replaces the manual compile/pdfinfo/pdftotext sequence entirely, so there is no longer a free-text "verified visually"-style claim to make. Multiple verified test runs made exactly that false claim even after this was patched twice in prose across two different files - a script that returns structured facts removes the possibility of it, because your job becomes relaying the JSON, not describing what you did.

```bash
bun run tools/pdf-verify.ts --tex cv/main_<company>.tex --engine lualatex --expect-pages 2 \
  --contains "<your email>" --contains "<your phone number>"

bun run tools/pdf-verify.ts --tex cover_letters/cover_<company>_<role>.tex --engine xelatex --expect-pages 1 \
  --contains "<your email>" --contains "<your phone number>"
```

Each call returns JSON: `compileSuccess`, `compileErrors` (if any), `pageCount`, `pageCountMatches`, `garbledTextDetected`, `containsChecks` (per-string found/not-found), `artifactsCleanedUp`, and `notes`. The script also handles cleanup itself (`.aux`/`.log`/`.out`/`.txt` removed on success; `.log` deliberately kept on failure for debugging) - do not delete these yourself.

**If `compileSuccess` is false:** read `compileErrors` and fix the `.tex` source (check `tools/latex-lint.ts` first - most compile failures are exactly what it catches), then re-run.

**If `pageCountMatches` is false:** see "Iterate until clean" below for fixes (`\needspace`, `\enlargethispage`, relevance-weighted cutting) - **never silently delete an entire section to fix a page-count miss; ask the user first** (see the "Never silently delete an entire section" rule in `05-cv-templates.md` - a verified test run deleted a whole "Speaking Engagements" section without asking, which also made the document internally inconsistent with claims elsewhere in the same file).

**What this check still cannot catch, even with the script:** an orphaned `\cventry` title (job title alone at the bottom of a page with bullets pushed to the next), a section heading isolated at the top of a page with only 1-2 lines below it, awkward whitespace gaps, or a font mismatch in the cover letter's bullet list (Raleway-Medium vs. default Lato) - none of these are visible from page count or extracted text alone. This is a real, permanent limitation of the current environment, not something the script pretends to solve - say so plainly in Step 6 rather than letting a passing script result imply more confidence than it supports.

### Iterate until clean

See `.agents/skills/job-application-assistant/05-cv-templates.md` and `06-cover-letter-templates.md` for the full fix reference (`\needspace`, `\enlargethispage`, relevance-weighted cutting, the `\lettercontent{}` itemize pitfall - though the lint gate in Step 2/4 should have already caught the itemize pitfall specifically). Do not proceed to Step 6 until both `pdf-verify.ts` calls exit 0.

### ATS keyword coverage (CV)

`pdf-verify.ts`'s `--contains` flags check contact details; separately check the posting's required/preferred keywords against the CV's actual content (not the script's output, since it only checks the specific strings you gave it). Keywords covered, honestly synonym-matched, or honestly absent - never stuffed. See `05-cv-templates.md` for the full keyword-coverage guidance.

---

## Step 6: Present Final Output

Run the full verification checklist from `AGENTS.md` now - this is the **only** verification pass in the workflow. Re-read both files once here to verify final state on disk matches your mental model after the Step 4 and Step 5 edits.

Report pass/fail for each item (factual accuracy, targeting, consistency, quality), **relaying the actual `pdf-verify.ts` JSON output for the compile/page-count/contains/garbled-text checks rather than re-describing them in your own words** - this is the whole point of making it a script. Explicitly state the layout-check limitation from Step 5 (orphaned entries, awkward whitespace, and font mismatches are not detectable by this script) so the user knows a quick manual look at the PDF before submitting is still worthwhile.

### Key Tailoring Decisions
Summarize 3-5 key decisions made to tailor the application.

### Files Created
List `cv/main_<company>.tex` and `cover_letters/cover_<company>_<role>.tex`.

Tell the user: "Both files are ready for your review. Open them to check the final output before compiling."

Also mention: once the application has actually been submitted, log it in `job_search_tracker.csv` for pipeline tracking.
