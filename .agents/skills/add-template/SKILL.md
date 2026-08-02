---
name: add-template
description: Registers a custom LaTeX CV or cover letter template (stores files, captures compile engine/fonts/style rules, verifies it compiles, activates it for the apply skill). Use for "/add-template", "/add-template --list", or "/add-template --use <name|default>".
user-invocable: true
allowed-tools: read_file write_file edit grep bash git_bash ask_user_question
---

# /add-template - Register a Custom CV or Cover Letter Template

You are helping the user register their own LaTeX template with this job-search workspace. The workspace ships with moderncv (banking style) for CVs and a custom `cover.cls` for cover letters. This command lets the user swap in their own template: store the template files, capture usage instructions (compile engine, fonts, style rules, page limits), verify the template compiles, and wire it into the `apply` skill so every future application uses it.

The skill argument may contain a subcommand, a file path, or nothing.

Follow these steps **in order**.

---

## Step 0: Parse Arguments

- If the argument contains `--list`: run **List Mode** below and stop.
- If the argument contains `--use <name>`: skip to **Step 5: Activate** with that template name. `--use default` deactivates any custom template and restores the stock guidance (see Step 5).
- If the argument contains a file path: treat it as the template source and carry it into Step 1.
- Otherwise: start the registration flow at Step 1.

### List Mode

Run `bash`/`git_bash`: `find templates -maxdepth 2 -name "TEMPLATE.md"` to find registered templates. For each, read the manifest and print a table:

```
## Registered Templates

| Name | Type | Engine | Fonts | Active |
|------|------|--------|-------|--------|
| <name> | CV / Cover letter | lualatex/xelatex/pdflatex | <main font> | yes/no |
```

A template is **active** if `.agents/skills/job-application-assistant/05-cv-templates.md` (CV) or `.agents/skills/job-application-assistant/06-cover-letter-templates.md` (cover letter) contains an `ACTIVE-TEMPLATE` managed block naming it. If no custom templates exist, say so and explain that this skill registers one. Stop here.

**Note:** this workspace has two copies of the reference skill files - `.agents/skills/job-application-assistant/` (canonical for Vibe) and `.claude/skills/job-application-assistant/` (original, for Claude Code). Activating a template here only updates the `.agents/` copy; if you want the same activation to apply when using Claude Code on this repo, mirror the managed block into the `.claude/` copy manually.

---

## Step 1: Template Type and Source

Use `ask_user_question` for anything not already answered by the argument:

1. **Type:** Is this a **CV** template or a **cover letter** template?
2. **Source:** Where is the template? Accept any of:
   - A path to a `.tex` file (plus optional `.cls`/`.sty` files)
   - Pasted LaTeX content
   - A directory containing the template and its assets (class files, fonts, images)

Read every provided file. If the template references a document class or package that is not part of standard TeX distributions (e.g. a custom `.cls`), confirm the user has the file and ask for it if missing — the template cannot compile without it.

---

## Step 2: Capture Template Instructions

Interview the user for the metadata that `apply` needs to use the template correctly. Infer as much as possible from the LaTeX source first (documentclass, `\fontspec` calls, geometry, colors) and present your inferences for confirmation rather than asking blind questions.

Collect:

1. **Name** - short kebab-case identifier (e.g. `awesome-cv`, `classic-serif`). Must not collide with an existing folder in `templates/`.
2. **Compile engine** - `lualatex`, `xelatex`, or `pdflatex`. If the source uses `fontspec` or loads font files by path, it requires `xelatex` or `lualatex`; tell the user this rather than letting them pick `pdflatex`.
3. **Fonts** - which font(s) the template uses and where they come from:
   - **Bundled font files** (`.ttf`/`.otf` shipped with the template): copy them into the template folder in Step 3 and record the relative `Path` used in `\fontspec` calls.
   - **System / TeX-distribution fonts**: record the font name and note that the user's machine must have it installed.
4. **Style rules** - anything the drafter must preserve when filling the template: color scheme, section order, heading style, spacing conventions, bullet formatting, date format.
5. **Page limit** - hard page count for the compiled PDF. Default: **2 pages** for a CV, **1 page** for a cover letter. `apply`'s compile-and-inspect loop enforces this.
6. **Known pitfalls** (optional) - macros that break with certain content (like the stock template's `\lettercontent{}`/`itemize` interaction), characters that need escaping, sections that must not be reordered.

---

## Step 3: Store the Template

Create the template folder:

- CV: `templates/cv/<name>/`
- Cover letter: `templates/cover_letters/<name>/`

Write into it:

1. **`template.tex`** - the template skeleton. Replace all personal data in the source with `[PLACEHOLDER]` tokens (`[YOUR_NAME]`, `[YOUR_EMAIL]`, `[YOUR_PHONE]`, `[YOUR_LINKEDIN_URL]`, ...) so the template is shareable and profile-agnostic. Keep the structure, preamble, and styling exactly as provided.
2. **Class/style files** - copy any `.cls`/`.sty` files alongside `template.tex`.
3. **`fonts/`** - copy bundled font files here, preserving any directory layout the `\fontspec` `Path` options expect. Adjust `Path` values in `template.tex` to be relative to the template folder.
4. **`TEMPLATE.md`** - the manifest. Use exactly this format:

```markdown
# Template: <name>

- **Type:** CV | Cover letter
- **Engine:** lualatex | xelatex | pdflatex
- **Page limit:** <N> page(s)
- **Fonts:** <main font> (<bundled in fonts/ | system font - must be installed>)
- **Class/packages:** <documentclass and any non-standard packages, or "standard">

## Compile command

    cd <output dir> && <engine> -interaction=nonstopmode <file>.tex

## Style rules

- <rule 1: colors, section order, heading style, ...>
- <rule 2>

## Known pitfalls

- <pitfall and its fix, or "none recorded">
```

---

## Step 4: Verify the Template Compiles (MANDATORY)

Never register a template without a successful test compile. LaTeX templates that "look fine" routinely fail on missing fonts, missing classes, or engine mismatches.

1. Copy `template.tex` to a scratch file in the same folder (e.g. `_compile_test.tex`) and fill every `[PLACEHOLDER]` with realistic dummy data (name, contact line, one education entry, one job entry with 3 bullets — enough content to exercise the layout).
2. Compile with the declared engine via `bash`/`git_bash`:
   ```bash
   cd templates/<type>/<name> && <engine> -interaction=nonstopmode _compile_test.tex
   ```
3. If the compile fails: show the user the relevant error lines, diagnose (missing font file, wrong engine, missing class), fix what you can (e.g. font `Path` values), and re-compile. If the fix needs input only the user has (a missing font file, a license-restricted class), ask for it and wait.
4. On success, verify the layout renders sensibly. **Known limitation confirmed in this workspace: Vibe cannot visually render a PDF.** Use `pdfinfo` for page count and `pdftotext -layout` to check the text is complete and not garbled - this is a weaker check than visual inspection and cannot catch overlapping text or font-loading failures that don't produce a compile error. Tell the user this limitation applies here, the same as in the `apply` skill's PDF verification step.
5. Delete the scratch files: `_compile_test.tex`, `_compile_test.pdf`, and all `.aux`/`.log`/`.out` artifacts.

Do not proceed to Step 5 until the test compile passes.

---

## Step 5: Activate the Template

Activation wires the template into `apply` by adding a **managed block** to the top of the relevant guidance file — `.agents/skills/job-application-assistant/05-cv-templates.md` for CVs, `.agents/skills/job-application-assistant/06-cover-letter-templates.md` for cover letters. `apply` reads these files in its drafting step, so the block is all it takes.

Insert (or replace, if one exists) this block immediately after the file's H1 title:

```markdown
<!-- BEGIN ACTIVE-TEMPLATE (managed by add-template - do not edit by hand) -->
> **Active template override: `<name>`**
>
> A custom template is active. Where this block conflicts with the stock guidance below, this block wins. Structural advice below (tailoring, page-budget, cutting rules) still applies.
>
> - **Template skeleton:** `templates/<type>/<name>/template.tex` — use this as the structural reference instead of the stock template
> - **Manifest:** `templates/<type>/<name>/TEMPLATE.md` — read this for style rules and known pitfalls before drafting
> - **Compile with:** `<engine>` (not the engine named in the stock guidance below)
> - **Fonts:** <font summary, including any Path note for bundled fonts>
> - **Page limit:** exactly <N> page(s)
> - **Output file:** unchanged (`cv/main_<company>_<role>.tex` / `cover_letters/cover_<company>_<role>.tex`); copy any class/font files the template needs into the output directory, or reference them by relative path
<!-- END ACTIVE-TEMPLATE -->
```

Rules:

- Exactly **one** managed block per guidance file. Replace the whole block between the `BEGIN`/`END` markers when switching templates; never stack blocks.
- **`--use default`**: remove the managed block entirely via `edit`. The stock moderncv / cover.cls guidance below it is untouched and takes over again.
- Do not modify anything outside the markers.
- Remember the two-copy caveat from Step 0's List Mode note: this only updates `.agents/skills/job-application-assistant/`, not the `.claude/` copy.

---

## Step 6: Confirm

Present a summary:

> **Template `<name>` registered and activated.**
>
> - Files: `templates/<type>/<name>/` (skeleton, manifest<, class files><, fonts>)
> - Test compile: passed with `<engine>` (<N> page(s), verified via pdfinfo/pdftotext - not visually inspected, see Step 4 limitation)
> - `apply` will now draft <CVs | cover letters> from this template.
>
> Useful follow-ups:
> - `/add-template --list` — see all registered templates
> - `/add-template --use <other-name>` — switch templates
> - `/add-template --use default` — go back to the stock <moderncv | cover.cls> template

---

## Design Principles

- Registration is idempotent: re-running with the same name offers to update the existing template rather than duplicating it.
- Templates are stored profile-agnostic (`[PLACEHOLDER]` tokens) so they can be shared or committed without leaking personal data.
- The compile check in Step 4 is non-negotiable — a template that has never compiled will fail mid-`apply`, which is the worst place to discover it.
- Activation is a small managed block, not a rewrite of the guidance files: manual edits to `05`/`06` survive template switches, and `--use default` is a clean revert.
