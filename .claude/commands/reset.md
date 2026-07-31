# /reset - Reset Candidate Profile Data

You are resetting parts of the job search framework back to a blank state so the user can start fresh with `/setup`.

**This command is destructive.** Nothing is deleted until the user explicitly confirms. Follow these steps exactly in order.

**Personal-data note:** all real candidate data lives in the gitignored `personal/` folder, never in the tracked `.claude/skills/job-application-assistant/` files (those are generic templates and never contain real data to clear). `profile` scope therefore only ever touches `personal/`.

---

## Step 0: Parse Scope from Arguments

Check `$ARGUMENTS` for a scope keyword:

- `profile` — clears candidate profile data from `personal/` only
- `documents` — deletes user-provided files from the `documents/` folder only
- `all` — both of the above

If `$ARGUMENTS` is empty or does not contain a recognized scope keyword, ask:

> **What would you like to reset?**
>
> - **`profile`** — Clears all real candidate data from `personal/` (identity, experience, behavioral profile, writing-style overrides, evaluation criteria, profile statements, cover-letter preferences, STAR examples). The generic tracked framework files are never touched. Use this to re-run `/setup` from scratch.
>
> - **`documents`** — Deletes all files you've placed in the `documents/` folder (CV PDFs, LinkedIn export, diplomas, references, past applications). The folder structure and `README.md` are preserved.
>
> - **`all`** — Both of the above.
>
> Reply with `profile`, `documents`, or `all`.

Wait for the user's response before continuing.

---

## Step 1: Show Exactly What Will Be Cleared

Before doing anything, show the user precisely what will be wiped.

### If scope includes `profile`:

Check whether each of these files exists in `personal/` (a file that doesn't exist yet has nothing to clear - report it as "not created yet" rather than proposing to write a blank file into existence):

- `personal/01-candidate-profile.md`
- `personal/02-behavioral-profile.md`
- `personal/03-writing-style-overrides.md`
- `personal/04-job-evaluation-criteria.md`
- `personal/05-profile-statements.md`
- `personal/06-cover-letter-preferences.md`
- `personal/07-star-examples.md`

Present as:

```
## Profile reset will clear:

- personal/01-candidate-profile.md — [has content / not created yet]
- personal/02-behavioral-profile.md — [has content / not created yet]
- personal/03-writing-style-overrides.md — [has content / not created yet]
- personal/04-job-evaluation-criteria.md — [has content / not created yet]
- personal/05-profile-statements.md — [has content / not created yet]  (includes CV contact details)
- personal/06-cover-letter-preferences.md — [has content / not created yet]  (includes cover-letter contact details)
- personal/07-star-examples.md — [has content / not created yet]

Each existing file will be replaced with a blank template. Files not created yet are skipped - nothing new is written.

The tracked framework files under .claude/skills/job-application-assistant/ are NOT
touched - they hold no candidate data to clear.
```

If every `personal/*.md` file above is missing, state "No profile data exists yet in `personal/` — nothing to clear." and skip the confirmation step for this scope.

### If scope includes `documents`:

Use Glob to list all files present in `documents/cv/`, `documents/linkedin/`, `documents/diplomas/`, `documents/references/`, and `documents/applications/`. Present as:

```
## Documents reset will delete:

documents/cv/
  - [filename] or "(empty)"

documents/linkedin/
  - [filename] or "(empty)"

documents/diplomas/
  - [filename] or "(empty)"

documents/references/
  - [filename] or "(empty)"

documents/applications/
  - [subfolder/filename] or "(empty)"

documents/README.md — NOT deleted (instructions file)
```

If all document subfolders are already empty, state "All document subfolders are already empty — nothing to delete." and skip the confirmation step for this scope.

---

## Step 2: Require Explicit Confirmation

Present the confirmation prompt:

> **This cannot be undone.**
>
> Type **`RESET`** (all caps) to confirm, or anything else to cancel.

Wait for the user's response.

- If the user types exactly `RESET`: proceed to Step 3.
- If the user types anything else: abort and tell them "Reset cancelled. Nothing was changed."

---

## Step 3: Execute the Reset

### Profile reset

Only touch files confirmed to exist in Step 1. For each, replace its full content (each `personal/*.md` file is now single-purpose - no framework text is mixed in, so a full-file blank is safe).

**`personal/01-candidate-profile.md`:**

```markdown
# Candidate Profile (Personal Data)

<!-- This file is gitignored - real personal data, never committed. -->
<!-- Run /setup to populate this file -->

## Identity

## Education

## Professional Experience

## Independent Projects

## Technical Skills

## Publications

## Awards

## References
```

**`personal/02-behavioral-profile.md`:**

```markdown
# Behavioral Profile (Personal Data)

<!-- This file is gitignored - real personal data, never committed. -->
<!-- Run /setup to populate this file -->

## Overview

## Strongest Behavioral Traits

## How I Work Best

## Growth Areas

## Mapping to Job Posting Language

## Management Style Preferences

## Using This in Applications
```

**`personal/03-writing-style-overrides.md`:**

```markdown
# Writing Style Overrides (Personal Data)

<!-- This file is gitignored - real personal preferences, never committed. -->
<!-- Run /setup to populate this file -->

These personal preferences override the generic guidance where they conflict.

### Cover letters

### CV
```

**`personal/04-job-evaluation-criteria.md`:**

```markdown
# Job Evaluation Criteria (Personal Data)

<!-- This file is gitignored - real personal data, never committed. -->
<!-- Run /setup to populate this file -->

## Quick Pre-Screen (run before full scoring)

## Skill Match Areas

## Career Goals

## Location Constraints

## Salary Anchors
```

**`personal/05-profile-statements.md`:**

```markdown
# CV Profile Statements (Personal Data)

<!-- This file is gitignored - real personal data, never committed. -->
<!-- Run /setup to populate this file -->

## Contact Details (for the Document Structure LaTeX template)

## Profile Statement Templates
```

**`personal/06-cover-letter-preferences.md`:**

```markdown
# Cover Letter Preferences (Personal Data)

<!-- This file is gitignored - real personal data, never committed. -->
<!-- Run /setup to populate this file -->

## Contact Details (for the Document Structure LaTeX template)

## Closing Line Preference
```

**`personal/07-star-examples.md`:**

```markdown
# Interview Prep — STAR Examples & Real Answers (Personal Data)

<!-- This file is gitignored - real personal data, never committed. -->
<!-- Run /setup to populate this file -->

## Ready-Made STAR Examples
```

### Documents reset

For each non-empty document subfolder, delete all files within it using Bash `rm`. Do not delete the folder itself, and do not delete `documents/README.md`.

```bash
rm -f documents/cv/*
rm -f documents/linkedin/*
rm -f documents/diplomas/*
rm -f documents/references/*
rm -rf documents/applications/*/
```

---

## Step 4: Confirm What Was Done and Next Steps

After the reset is complete, report:

```
## Reset complete

### Cleared
[List each file/folder that was actually modified or cleared]

### Unchanged
[List anything that was already empty, not created yet, or intentionally preserved]
```

Then tell the user what to do next based on what was reset:

**If profile was reset:**
> Your candidate profile is now blank. Run `/setup` to repopulate it - the command auto-detects any files in your `documents/` folder and offers to read from there; otherwise it walks you through a CV import or interactive interview. Either way, it writes to the same `personal/` files.

**If documents were reset:**
> The `documents/` folder is now empty. Add your career documents and run `/setup` to populate your profile. See `documents/README.md` for instructions on what to put where.

**If both were reset:**
> Both your profile files and documents folder are now empty. Add documents to `documents/` (or skip and use the CV import / interview path), then run `/setup`.
