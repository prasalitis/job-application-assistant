---
name: setup
description: Lightweight, update-only profile maintenance. Does NOT do full onboarding (the profile is already populated) - only handles targeted "--section <name>" updates to one part of the profile at a time. Use for "/setup --section search", "/setup --section experience", etc.
user-invocable: true
allowed-tools: read_file write_file edit grep bash git_bash ask_user_question
---

# /setup - Targeted Section Updates Only

**This is a deliberately scaled-down version of the original `/setup` command.** The original ran full onboarding across three paths (documents-folder import, single-CV import, interview mode) to build a profile from scratch. That's not needed here - the profile is already populated, in the gitignored `personal/` folder that overrides the generic tracked template files. This version only handles the one piece of ongoing value: updating a single named section as circumstances change (a new role, a new location, updated search priorities), without touching anything else.

If the skill argument does not contain `--section <name>`, list the available sections below and ask which one to update via `ask_user_question`. Do not attempt full onboarding under any circumstances - if the user seems to want that, tell them plainly that this lightweight version doesn't support it, and ask them to describe what they want changed instead so it can be handled as a targeted edit.

---

## Available Sections

| Section keyword | What it updates | Personal file (primary) | Generic file (fallback) |
|---|---|---|---|
| `identity` | Location, contact details, work authorisation, relocation targets | `personal/01-candidate-profile.md` | `.agents/skills/job-application-assistant/01-candidate-profile.md` |
| `experience` | Add or correct a job entry | `personal/01-candidate-profile.md` | `.agents/skills/job-application-assistant/01-candidate-profile.md` |
| `skills` | Technical skills, tools, certifications | `personal/01-candidate-profile.md` | `.agents/skills/job-application-assistant/01-candidate-profile.md` |
| `behavioral` | Behavioral traits, strengths, thrive/drain factors | `personal/02-behavioral-profile.md` | `.agents/skills/job-application-assistant/02-behavioral-profile.md` |
| `career` | Career goals, deal-breakers, target sectors, excluded directions | `personal/01-candidate-profile.md`, `personal/04-job-evaluation-criteria.md` | `.agents/skills/job-application-assistant/01-candidate-profile.md`, `04-job-evaluation.md` |
| `references` | Reference contacts | `personal/01-candidate-profile.md` | `.agents/skills/job-application-assistant/01-candidate-profile.md` |
| `search` | Job-portal search queries and target companies | `personal/job-scraper-search-queries.md`, `personal/job-scraper-target-companies.md` | `.agents/skills/job-scraper/search-queries.md`, `target-companies.md` |

**Real data lives in `personal/`, never in the generic fallback files.** The fallback column exists only for a genuinely first-ever run, when `personal/` has not been created yet - in every other case (which is the normal case for this lightweight, update-only command), the personal file already exists and is the one to read and edit.

---

## Step 1: Resolve and Read Current State for the Named Section

Before asking anything, resolve each relevant file from the table above - personal data first, generic fallback otherwise - using the same deterministic tool the other skills use:

```bash
bun run tools/resolve-doc.ts --primary <personal file> --fallback <generic file>
```

Read each call's `resolvedPath` and identify the current content for that specific section only. Hold this in context - do not re-read later in the same run.

**Remember every resolved path for Step 3 - that is where you write.** If a call's `usedPrimary` is `false` (the personal file does not exist yet), do not write there anyway with abandon - still target `personal/<filename>` explicitly in Step 3 rather than the generic fallback path, creating the personal file for the first time. Writing to the generic fallback would put real data into a git-tracked file.

If the section is `search`, also read `personal/01-candidate-profile.md`'s Identity block (location, relocation targets), resolved the same way, to keep the search queries consistent with the current stated preferences.

---

## Step 2: Ask What Changed

Use `ask_user_question` (or plain conversational questions if the change is open-ended and doesn't fit clean multiple-choice options) to find out specifically what's different. Keep this tight - one or two questions, not a full re-interview:

- **identity**: "What's changed - location, relocation targets, contact details, or work authorisation?"
- **experience**: "New role, or a correction to an existing entry? Give me the details."
- **skills**: "What's being added or removed?"
- **behavioral**: "What's changed about how you'd describe your working style or strengths?"
- **career**: "What's changed - target sectors, deal-breakers, or something newly ruled in/out?"
- **references**: "New reference, or an update to an existing one?"
- **search**: "What should change - new role titles, new locations, new target companies, or portals to add/drop?"

Do not ask about anything outside the named section. If the user's answer implies a change that belongs in a different section, note it back to them and ask if they want to run this again for that section separately, rather than silently expanding scope.

---

## Step 3: Apply the Targeted Edit

Use `edit` to make the specific, minimal change to the **personal file(s) resolved in Step 1** - never rewrite the whole file, never touch other sections, and never write to the generic tracked filename even if that is what `resolvedPath` returned (see the note in Step 1). Preserve existing formatting and structure exactly. If the personal file did not exist yet, create it with the same section structure as the generic fallback, populated with the real content.

**Two-copy note:** the generic templates for `01-candidate-profile.md`, `02-behavioral-profile.md`, and `04-job-evaluation.md` exist in two places in this workspace - `.agents/skills/job-application-assistant/` (canonical for Vibe) and `.claude/skills/job-application-assistant/` (original, for Claude Code) - but both resolve to the **same** `personal/` files, since `personal/` is shared across both. There is nothing to mirror: editing the resolved `personal/` path updates the data both copies read.

---

## Step 4: Confirm

Report back concisely:

> **Updated: <section>**
>
> - `<personal file path>`: <one-line summary of what changed>
> [repeat per file touched]

---

## Important Rules

1. **Scope discipline.** Touch only the named section's target file(s), and only the specific content that changed. Never expand into a full profile review.
2. **No full onboarding.** If asked for anything resembling ground-up profile building, decline and explain this is the lightweight, update-only version.
3. **Personal data only, never the generic template.** Every write in Step 3 targets the resolved `personal/` path, even on a file's first-ever write. Writing to `.agents/skills/job-application-assistant/*.md` or `.agents/skills/job-scraper/*.md` directly would commit real data into a git-tracked file.
4. **Minimal, targeted edits.** Use `edit` for surgical changes; never `write_file` a full rewrite of an already-populated file.
