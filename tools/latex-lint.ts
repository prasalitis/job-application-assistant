#!/usr/bin/env bun
// Deterministic pre-compile linter for the job-search LaTeX files (CVs, cover letters).
//
// Why this exists: three separate verified test runs of the apply skill hit the same
// class of bug that a linter catches for free - an unescaped `&` that broke compilation,
// an em-dash that triggered a multi-turn edit struggle (which then introduced an
// unrelated factual error), and a stray `\closing{}` left in a cover letter against this
// repo's stated style rule. None of these need AI judgment to catch; they're exactly
// the kind of mechanical check that should run before a single compile attempt, not be
// caught turn-by-turn by a failed compile and a manual fix.
//
// Usage:
//   bun run tools/latex-lint.ts --file cv/main_<company>.tex
//   bun run tools/latex-lint.ts --file cover_letters/cover_<company>_<role>.tex --cover-letter
//
// --cover-letter enables cover-letter-specific checks (the \closing{} rule and the
// \lettercontent{}/itemize pitfall) that don't apply to CVs.
//
// Output (stdout, JSON): { "clean": bool, "issues": [{ "line": number|null, "type": "...", "char"?: "...", "context": "..." }] }
// Exit code: 0 if clean, 1 if issues were found (so this can gate a compile step in a shell pipeline).

import { readFileSync } from "fs"

interface Issue {
  line: number | null
  type: "unescaped_special_char" | "non_ascii_punctuation" | "closing_tag_present" | "lettercontent_itemize_pitfall"
  char?: string
  context: string
}

function lintContent(text: string, opts: { coverLetter?: boolean } = {}): Issue[] {
  const issues: Issue[] = []
  const lines = text.split("\n")

  // Only lint generated body content, not the fixed LaTeX preamble (documentclass,
  // package loads, \renewcommand macro definitions like \color{color1}#1, etc).
  // A verified test run flagged legitimate #1/#2 macro-parameter syntax in the
  // preamble's \renewcommand lines as "unescaped special characters" - a real false
  // positive, since that boilerplate is copied unchanged from a known-working template
  // and isn't the AI-generated content this linter needs to catch bugs in. If no
  // \begin{document} marker is found, fall back to scanning the whole file.
  const bodyStartIdx = lines.findIndex((l) => l.includes("\\begin{document}"))
  const scanStart = bodyStartIdx === -1 ? 0 : bodyStartIdx + 1

  lines.forEach((line, idx) => {
    if (idx < scanStart) return
    const lineNum = idx + 1
    if (line.trim().startsWith("%")) return // whole-line comment, not scanned

    // & $ # : always need escaping in this repo's body text (no tables, no math mode,
    // no macro-parameter usage in generated content).
    for (const ch of ["&", "$", "#"]) {
      let searchIdx = 0
      while (true) {
        const foundIdx = line.indexOf(ch, searchIdx)
        if (foundIdx === -1) break
        const precededByBackslash = foundIdx > 0 && line[foundIdx - 1] === "\\"
        if (!precededByBackslash) {
          issues.push({ line: lineNum, type: "unescaped_special_char", char: ch, context: line.trim().slice(0, 80) })
        }
        searchIdx = foundIdx + 1
      }
    }

    // % is different: a bare % is usually a legitimate comment-start, not a bug.
    // Only flag when it looks like an intended literal percent sign - immediately
    // preceded by a digit with no space (e.g. "40%") - since a genuine comment-start
    // is virtually never glued directly to a preceding digit like that.
    let searchIdx = 0
    while (true) {
      const foundIdx = line.indexOf("%", searchIdx)
      if (foundIdx === -1) break
      const precededByBackslash = foundIdx > 0 && line[foundIdx - 1] === "\\"
      const precededByDigit = foundIdx > 0 && /\d/.test(line[foundIdx - 1])
      if (!precededByBackslash && precededByDigit) {
        issues.push({ line: lineNum, type: "unescaped_special_char", char: "%", context: line.trim().slice(0, 80) })
      }
      searchIdx = foundIdx + 1
    }

    // Non-ASCII punctuation (em-dash, en-dash) - not a compile error under lualatex/xelatex
    // (both are Unicode-native), but a verified test run got stuck in a multi-turn edit
    // loop trying to "fix" one, and that struggle introduced an unrelated factual error.
    // Flagging it lets it be replaced with a plain hyphen/colon/comma up front instead.
    if (/[\u2014\u2013]/.test(line)) {
      issues.push({ line: lineNum, type: "non_ascii_punctuation", context: line.trim().slice(0, 80) })
    }
  })

  if (opts.coverLetter) {
    if (/\\closing\{/.test(text)) {
      issues.push({
        line: null,
        type: "closing_tag_present",
        context: "\\closing{...} found - this repo's cover letters end with name only, no closing line (see 06-cover-letter-templates.md)",
      })
    }
    if (/\\lettercontent\{[^}]*\\begin\{itemize\}/.test(text)) {
      issues.push({
        line: null,
        type: "lettercontent_itemize_pitfall",
        context: "\\begin{itemize} found inside \\lettercontent{...} - this breaks compile (the command appends \\\\ after its argument, which errors on \\end{itemize}). Close \\lettercontent{} before the list and wrap the list in the matching font block instead.",
      })
    }
  }

  return issues
}

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    }
  }
  return flags
}

function main() {
  const flags = parseFlags(process.argv.slice(2))
  if (!flags.file || typeof flags.file !== "string") {
    process.stderr.write(JSON.stringify({ error: "--file <path> is required", code: "NO_FILE" }) + "\n")
    process.exit(1)
  }

  const text = readFileSync(flags.file, "utf-8")
  const issues = lintContent(text, { coverLetter: !!flags["cover-letter"] })

  process.stdout.write(JSON.stringify({ clean: issues.length === 0, issues }, null, 2) + "\n")
  process.exit(issues.length === 0 ? 0 : 1)
}

main()
