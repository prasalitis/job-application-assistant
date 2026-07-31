---
name: reset
description: Destructively resets candidate profile data and/or the documents/ folder back to a blank state, with mandatory preview and explicit RESET confirmation before anything is deleted. Use for "/reset profile", "/reset documents", or "/reset all".
user-invocable: true
allowed-tools: read_file write_file edit grep bash git_bash ask_user_question
---

# /reset - Reset Candidate Profile Data

You are resetting parts of the job search workspace back to a blank state so the user can start fresh.

**This command is destructive.** Nothing is deleted until the user explicitly confirms. Follow these steps exactly in order.

**Personal-data note:** all real candidate data lives in the gitignored `personal/` folder, never in the tracked `.claude/skills/job-application-assistant/` or `.agents/skills/job-application-assistant/` files (those are generic templates shared by both toolchains and never contain real data to clear). `profile` scope therefore only ever touches `personal/`. There is no "two-copy drift" risk here - `personal/` is the single shared source of truth both toolchains read via `resolve-doc.ts`, so resetting it once resets it for both Claude Code and Vibe.

---

## Step 0: Parse Scope from Arguments

Check the skill argument for a scope keyword:

- `profile` — clears candidate profile data from `personal/` only
- `documents` — deletes user-provided files from the `documents/` folder only
- `all` — both of the above

If the argument is empty or does not contain a recognized scope keyword, use `ask_user_question`:

> **What would you like to reset?**
>
> - **`profile`** — Clears all real candidate data from `personal/` (identity, experience, behavioral profile, writing-style overrides, evaluation criteria, profile statements, cover-letter preferences, STAR examples). The generic tracked framework files are never touched.
>
> - **`documents`** — Deletes all files you've placed in the `documents/` folder (CV PDFs, LinkedIn export, diplomas, references, past applications). The folder structure and `README.md` are preserved.
>
> - **`all`** — Both of the above.

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

The tracked framework files under .claude/skills/job-application-assistant/ and
.agents/skills/job-application-assistant/ are NOT touched - they hold no candidate
data to clear.
```

If every `personal/*.md` file above is missing, state "No profile data exists yet in `personal/` — nothing to clear." and skip the confirmation step for this scope.

### If scope includes `documents`:

Use `bash`/`git_bash` (`find documents/cv documents/linkedin documents/diplomas documents/references documents/applications -type f` or `ls` per subfolder) to list all files present in `documents/cv/`, `documents/linkedin/`, `documents/diplomas/`, `documents/references/`, and `documents/applications/`. Present as:

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

Use `ask_user_question` (or plain text if that tool doesn't support a free-text confirmation phrase in this context - fall back to asking in prose):

> **This cannot be undone.**
>
> Type **`RESET`** (all caps) to confirm, or anything else to cancel.

Wait for the user's response.

- If the user types exactly `RESET`: proceed to Step 3.
- If the user types anything else: abort and tell them "Reset cancelled. Nothing was changed."

---

## Step 3: Execute the Reset

### Profile reset

Only touch files confirmed to exist in Step 1. For each, use `write_file` to replace its full content (each `personal/*.md` file is now single-purpose - no framework text is mixed in, so a full-file blank is safe and does not risk deleting structural guidance the way section-only edits on a mixed file would).

**`personal/01-candidate-profile.md`:**

```markdown
# Candidate Profile (Personal Data)

<!-- This file is gitignored - real personal data, never committed. -->

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

These personal preferences override the generic guidance where they conflict.

### Cover letters

### CV
```

**`personal/04-job-evaluation-criteria.md`:**

```markdown
# Job Evaluation Criteria (Personal Data)

<!-- This file is gitignored - real personal data, never committed. -->

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

## Contact Details (for the Document Structure LaTeX template)

## Profile Statement Templates
```

**`personal/06-cover-letter-preferences.md`:**

```markdown
# Cover Letter Preferences (Personal Data)

<!-- This file is gitignored - real personal data, never committed. -->

## Contact Details (for the Document Structure LaTeX template)

## Closing Line Preference
```

**`personal/07-star-examples.md`:**

```markdown
# Interview Prep — STAR Examples & Real Answers (Personal Data)

<!-- This file is gitignored - real personal data, never committed. -->

## Ready-Made STAR Examples
```

### Documents reset

For each non-empty document subfolder, delete all files within it using `bash`/`git_bash` `rm`. Do not delete the folder itself, and do not delete `documents/README.md`.

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
> Your candidate profile is now blank (`personal/` files reset to templates). Repopulate them directly, or use the `setup` skill if it's available in this workspace - it writes to the same `personal/` files.

**If documents were reset:**
> The `documents/` folder is now empty. Add your career documents back and repopulate your profile. See `documents/README.md` for instructions on what to put where.

**If both were reset:**
> Both your profile files and documents folder are now empty.

---

## Important Rules

1. **Nothing is deleted without the exact `RESET` confirmation.** No partial or implied confirmations count.
2. **Preview before destroy.** Step 1's preview is not optional, even if the user seems confident.
3. **`personal/` only.** The tracked generic framework files (`.claude/skills/job-application-assistant/`, `.agents/skills/job-application-assistant/`) are never touched - they hold no candidate data to clear, and both toolchains share the same `personal/` files, so there is nothing to keep in sync.
4. **Only touch files that exist.** Never create a `personal/*.md` file just to immediately blank it - if it doesn't exist yet, there is nothing to reset.
