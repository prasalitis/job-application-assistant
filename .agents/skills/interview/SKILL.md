---
name: interview
description: Builds a stage-specific interview prep pack (likely questions, STAR answer mapping, consistency brief, tough questions, questions to ask) for a tracked job application, and offers a mock interview roleplay. Use for "/interview <company>".
user-invocable: true
allowed-tools: read_file write_file edit grep bash web_search web_fetch ask_user_question
---

# /interview - Prepare for an Interview on a Tracked Application

You are preparing the user for a real, scheduled interview on one of their applications. The frameworks for this already exist - `07-interview-prep.md` (STAR examples, tough questions, questions to ask, roleplay protocol) and the profile files - and the `/outcome` archive (if it exists for this application) records which stage the user is at and what earlier stages surfaced. This command wires them together into a stage-specific prep pack and an optional mock interview.

`/apply` optimizes what the company reads; `/interview` optimizes what the company hears. The bridge between them is consistency: the interviewer has read the submitted CV and cover letter, so everything prepared here must match what those documents claim.

Follow these steps **in order**.

---

## Step 0: Parse Input

The skill argument may contain a company name (optionally with a role), e.g. "acme".

- **With an argument:** match against `job_search_tracker.csv` rows (case-insensitive on company, then role). One match → proceed. Several → list and ask. None → this application isn't tracked; suggest `/outcome <company>` to register it first, or accept the posting and role details directly if the user wants to prep anyway.
- **Without an argument:** list tracker rows whose status suggests a live process (`interview`, `offer`, or recently `applied`) and use `ask_user_question` to ask which one. If the tracker is empty, ask for the company, role, and posting.

This skill preps for a **specific application**. Generic no-target practice is out of scope - if asked, prep against a real tracked application instead.

---

## Step 1: Load the Application Context

1. **The archive** (maintained by `/outcome`, if it exists): `documents/applications/<company>_<role>/`
   - `job_posting.md` - the exact posting the user applied to
   - `cv_draft.tex` and `cover_letter.tex` - what was actually submitted. **These are what the interviewer read**; every talking point must be consistent with their claims.
   - `outcome.md` - the stage reached so far and any recorded feedback from earlier stages. Feedback from stage N is the highest-value input for stage N+1 prep.
2. **Fallbacks** (the application may predate `/outcome`): posting via `web_fetch` on the tracker row's `source` URL, or ask the user to paste it; CV via `cv/main_<company>.tex` and cover letter via `cover_letters/cover_<company>_*.tex`. State plainly which context is missing rather than guessing - and suggest `/outcome <company>` to build the archive for next time.
3. **Ask the user what this interview is** (skip anything `outcome.md` already records): stage (phone screen / technical / case / final round), date, format (phone, video, onsite), and who is interviewing (names and titles, if known).
4. **Resolve and read the frameworks once** - personal data first, generic fallback otherwise, same pattern as `apply`/`expand` - do not re-read them in later steps:
   ```bash
   bun run tools/resolve-doc.ts --primary personal/07-star-examples.md --fallback .agents/skills/job-application-assistant/07-interview-prep.md
   bun run tools/resolve-doc.ts --primary personal/01-candidate-profile.md --fallback .agents/skills/job-application-assistant/01-candidate-profile.md
   bun run tools/resolve-doc.ts --primary personal/02-behavioral-profile.md --fallback .agents/skills/job-application-assistant/02-behavioral-profile.md
   bun run tools/resolve-doc.ts --primary personal/04-job-evaluation-criteria.md --fallback .agents/skills/job-application-assistant/04-job-evaluation.md
   ```
   Read each call's `resolvedPath`. **Remember the 07 resolved path for Steps 3 and 5 - that is where any approved STAR-example append goes, not the hardcoded `.agents/` filename; writing to the wrong one would silently discard the addition and risk committing personal data into a git-tracked file.**

---

## Step 2: Research the Company (Interview-Focused)

Research the company: website (mission, values, recent news), review sites, LinkedIn (team size, recent hires), and media coverage (growth, restructuring, workplace issues) via `web_search`/`web_fetch`.

Additions for interview purposes:

- **Interviewer angle:** if interviewer names are known (from Step 1 or the tracker's `contact_person`), look up their public professional profile. A hiring manager probes team fit and motivation; a senior engineer probes technical depth; HR probes the CV timeline. Note the likely angle per interviewer - do not speculate beyond public information.
- **Conversation hooks:** 2-3 recent, verifiable company specifics (a product launch, a stated strategic priority) the user can reference naturally in answers and in the "why this company" moment.

**Verify before using:** every company claim that will appear in the prep pack must be independently confirmed via `web_fetch`/`web_search` - same rule the repo applies to cover-letter claims. An unverified "fact" delivered confidently in an interview is worse than no fact.

---

## Step 3: Build the Prep Pack

Assemble a stage-appropriate prep document with these sections:

### 1. Likely questions
Derive from four sources, in priority order:
1. **Recorded feedback from earlier stages** (`outcome.md`) - anything flagged, doubted, or left unresolved will come back
2. **The fit evaluation's gaps** - the requirements where the profile is weakest are the likeliest probes. For each, prepare an honest bridge answer per `07`'s "You don't have [X]" pattern: acknowledge, connect adjacent experience, show the learning path. **Never prepare an answer that invents experience.**
3. **The posting's stated requirements** - competency by competency
4. **The stage type** - phone screens get motivation and timeline questions; technical rounds get the posting's stack; final rounds get values, salary, and "any reservations" questions

### 2. STAR answer mapping
Match the ready-made STAR examples in `07-interview-prep.md` to the likely questions using their "Use for" tags.

**No fabricated specifics, in expansions or new drafts alike - no exceptions.** A verified test run of this skill "expanded for depth" existing STAR examples by inventing plausible-sounding specific numbers nowhere in any source: exact headcounts ("approximately 400 licenses"), percentages ("12% cost avoidance", "80% of Microsoft licensing independently"), timeframes ("within 48 hours", "zero within 30 days"), and monetary figures ("7-figure annual commitment", "6-figure true-up exposure", "€250K in annual savings") that do not exist in `07-interview-prep.md`, `01-candidate-profile.md`, or anywhere else in this workspace. This is not a cosmetic issue - if the user repeats an invented figure in a real interview and is asked a natural follow-up about it, they are exposed as having fabricated a professional claim, which is exactly the harm this whole system exists to prevent. The fix: when "expanding for depth" beyond what a source states, expand the narrative, structure, and reasoning shown in the S/T/A/R - never invent a number, date, percentage, or count that isn't already in a source. Where a real metric would strengthen the story and the user has one, ask them for it via `ask_user_question` rather than guessing. Where no real metric exists, leave it as a qualitative statement ("significant cost avoidance", "resolved within weeks") or insert a visible placeholder like `[ACTUAL FIGURE NEEDED - do not use as-is]` rather than a specific invented number. This rule applies identically to expanding existing STAR examples and to drafting new ones - the "grounded strictly in facts, not embellished" rule below was previously written to apply only to new drafts; it applies to every STAR answer in the pack.

Then:
- For likely questions **no existing STAR example covers**, draft a new STAR answer grounded strictly in facts from `01-candidate-profile.md` - profile facts arranged into S/T/A/R, not embellished. Include these drafts in the prep pack; offer to append them to the **07 resolved path from Step 1** only if the user explicitly approves (use `edit` - never the hardcoded generic filename).

### 3. Consistency brief
A short list of the specific claims the submitted CV and cover letter make (achievements, numbers, skills emphasized) that the interviewer is most likely to probe. The rule stated plainly: **no claim in the room that isn't on the paper, and every claim on the paper must be defensible in depth.**

**If no submitted CV/cover letter draft was actually found (neither in the archive nor via the `cv/main_<company>.tex` fallback), say so as the first line of this section, in bold, not as a trailing parenthetical.** A verified test run for an application with no saved draft (the tracker's `cv_file`/`cover_letter_file` columns were blank) produced a "Consistency Brief" that opened with "From your Roche application (CV and cover letter" and only hedged with a small "(verify against actual submitted files if different)" - easy to miss, and misleading since it implies a real document was checked. When no draft exists, open the section with something like: **"No submitted CV/cover letter draft exists in this workspace for this application - the claims below are reconstructed from your general profile (`01-candidate-profile.md`), not verified against what you actually sent. Treat this section as a starting point, not a confirmed record of your submission."**

### 4. Tough questions, customized
The relevant entries from `07`'s tough-question list with per-application answers - "Why this company specifically?" must use the verified hooks from Step 2, never a generic line.

### 5. Questions to ask
Pick 4-6 from `07`'s categories, customized to the research and the stage: role and team questions at screens, tech and growth questions at technical rounds, culture and leadership questions by the final round. Cut any question the research already answers publicly - asking it signals you didn't look.

### 6. Logistics
The phone/video tips from `07` when the format calls for them, plus date and interviewer names as a header.

Save the pack to `documents/applications/<company>_<role>/interview_prep_<stage>.md` (create the folder if this application predates `/outcome`). One file per stage, so earlier packs remain as history. Present the pack in chat as well - the file is the artifact, the conversation is the delivery.

---

## Step 4: Offer a Mock Interview

Use `ask_user_question` to ask if the user wants to practice. If yes, run the roleplay **in this conversation** following the Roleplay Guidelines in `07-interview-prep.md` exactly: warm-up first, then role-specific technical questions, 1-2 behavioral questions tied to the posting's competencies, and one tough question or curveball. After each answer, give brief feedback - what worked, what to sharpen, and which STAR example from the pack would have served better.

Calibrate feedback against `02-behavioral-profile.md`: coach toward the user's natural register, not a generic ideal - the same voice-consistency rule the `apply` reviewer subagent applies to cover letters.

---

## Step 5: Close the Loop

End with:

> Good luck. After the interview, run `/outcome <company>` to log the stage and any feedback - it sharpens prep for the next round.

If Step 3 drafted new STAR answers the user approved for keeps, remind them those were appended to the 07 resolved path from Step 1 (or offer again if they deferred).

---

## Important Rules

1. **Consistency with the submitted documents.** The interviewer read the archived CV and cover letter; prep must never contradict them or coach claims beyond them.
2. **Honesty on gaps.** Weak matches get bridge answers (acknowledge → adjacent experience → learning path), never invented experience.
3. **Verified research only.** Company specifics go in the pack only after independent confirmation. Interviewer notes stick to public professional information.
4. **Stage-appropriate prep.** A phone screen pack and a final-round pack are different documents; recorded feedback from earlier stages takes priority over generic question lists.
5. **Write only to the application archive.** The prep pack lands in `documents/applications/<company>_<role>/`; framework and profile files are never edited, except appending user-approved STAR examples to the 07 resolved path from Step 1 on explicit request.
