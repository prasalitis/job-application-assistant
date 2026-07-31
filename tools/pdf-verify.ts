#!/usr/bin/env bun
// Deterministic compile + verify wrapper for the job-search LaTeX files.
//
// Why this exists: multiple verified test runs of the apply skill reported "verified
// visually" or "no orphaned entries (verified visually via compilation)" when no
// visual inspection tool was ever available or used - only pdfinfo/pdftotext/grep calls
// actually ran. That kept happening even after the instruction was patched twice in
// prose, in two different files. Making the check a script that returns structured
// facts (not a free-text claim) removes the possibility of that specific false claim
// structurally: the AI's job becomes "relay this JSON," not "describe what I did."
//
// Usage:
//   bun run tools/pdf-verify.ts --tex cv/main_<company>.tex --engine lualatex --expect-pages 2 \
//     --contains "<your email>" --contains "<your phone number>"
//
// --engine: lualatex | xelatex (required)
// --expect-pages: integer page count the compiled PDF must match (optional - omit to skip the check)
// --contains: a literal string that must appear in the extracted text layer (repeatable)
// --keep-artifacts: skip deleting .aux/.log/.out after running (debugging only)
//
// Output (stdout, JSON) - see the Result interface below for the exact shape.
// Exit code: 0 only if compile succeeded AND (no --expect-pages, or it matches) AND no
// garbled text markers AND every --contains string was found. 1 otherwise.

import { execFileSync } from "child_process"
import { readFileSync, existsSync, unlinkSync } from "fs"
import { dirname, basename, join, extname } from "path"

interface ContainsCheck {
  text: string
  found: boolean
}

interface GarbledOccurrence {
  pattern: string
  context: string
}

interface Result {
  compileSuccess: boolean
  compileErrors: string[]
  pageCount: number | null
  expectedPages: number | null
  pageCountMatches: boolean | null
  garbledTextDetected: boolean
  garbledOccurrences: GarbledOccurrence[]
  containsChecks: ContainsCheck[]
  artifactsCleanedUp: boolean
  notes: string[]
}

function parseFlags(argv: string[]): { file?: string; engine?: string; expectPages?: number; contains: string[]; keepArtifacts: boolean } {
  const out: { file?: string; engine?: string; expectPages?: number; contains: string[]; keepArtifacts: boolean } = {
    contains: [],
    keepArtifacts: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--tex") out.file = argv[++i]
    else if (a === "--engine") out.engine = argv[++i]
    else if (a === "--expect-pages") out.expectPages = parseInt(argv[++i], 10)
    else if (a === "--contains") out.contains.push(argv[++i])
    else if (a === "--keep-artifacts") out.keepArtifacts = true
  }
  return out
}

function run(cmd: string, args: string[], cwd: string): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execFileSync(cmd, args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] })
    return { stdout, stderr: "", code: 0 }
  } catch (e: any) {
    return { stdout: e.stdout?.toString() ?? "", stderr: e.stderr?.toString() ?? "", code: e.status ?? 1 }
  }
}

function extractLatexErrors(log: string): string[] {
  // LaTeX fatal errors are lines starting with "! " in the .log
  return log
    .split("\n")
    .filter((l) => l.startsWith("! "))
    .slice(0, 10) // cap - a cascading error can produce dozens of near-duplicate lines
}

function main() {
  const flags = parseFlags(process.argv.slice(2))
  if (!flags.file || !flags.engine) {
    process.stderr.write(JSON.stringify({ error: "--tex <path> and --engine <lualatex|xelatex> are required", code: "MISSING_ARGS" }) + "\n")
    process.exit(1)
  }
  if (flags.engine !== "lualatex" && flags.engine !== "xelatex") {
    process.stderr.write(JSON.stringify({ error: `--engine must be lualatex or xelatex, got "${flags.engine}"`, code: "BAD_ENGINE" }) + "\n")
    process.exit(1)
  }

  const texPath = flags.file
  const dir = dirname(texPath)
  const base = basename(texPath, extname(texPath))
  const pdfPath = join(dir, `${base}.pdf`)
  const auxPath = join(dir, `${base}.aux`)
  const logPath = join(dir, `${base}.log`)
  const outPath = join(dir, `${base}.out`)
  const txtPath = join(dir, `${base}.txt`)

  const notes: string[] = []
  const result: Result = {
    compileSuccess: false,
    compileErrors: [],
    pageCount: null,
    expectedPages: flags.expectPages ?? null,
    pageCountMatches: null,
    garbledTextDetected: false,
    garbledOccurrences: [],
    containsChecks: flags.contains.map((t) => ({ text: t, found: false })),
    artifactsCleanedUp: false,
    notes,
  }

  // Compile (single pass; moderncv/cover.cls in this repo don't need a second pass for
  // references/TOC, so one run is sufficient - if that stops being true, run twice.)
  const compile = run(flags.engine, ["-interaction=nonstopmode", basename(texPath)], dir)
  const logExists = existsSync(logPath)
  const logContent = logExists ? readFileSync(logPath, "utf-8") : ""

  if (compile.code !== 0 || !existsSync(pdfPath)) {
    result.compileSuccess = false
    result.compileErrors = logExists ? extractLatexErrors(logContent) : [compile.stderr || "Compile failed with no log file produced."]
    if (!flags.keepArtifacts) {
      for (const p of [auxPath, outPath]) {
        if (existsSync(p)) {
          try {
            unlinkSync(p)
          } catch {}
        }
      }
      notes.push("Compile failed - .log was intentionally kept (not deleted) for debugging; .aux/.out were cleaned up.")
    } else {
      notes.push("--keep-artifacts was set; .aux/.log/.out left on disk for debugging.")
    }
    process.stdout.write(JSON.stringify(result, null, 2) + "\n")
    process.exit(1)
  }
  result.compileSuccess = true

  // pdfinfo for page count
  const info = run("pdfinfo", [basename(pdfPath)], dir)
  const pagesMatch = info.stdout.match(/^Pages:\s*(\d+)/m)
  result.pageCount = pagesMatch ? parseInt(pagesMatch[1], 10) : null
  if (flags.expectPages !== undefined) {
    result.pageCountMatches = result.pageCount === flags.expectPages
  }

  // pdftotext for text-layer extraction
  const totext = run("pdftotext", ["-layout", basename(pdfPath), basename(txtPath)], dir)
  const extractedText = existsSync(txtPath) ? readFileSync(txtPath, "utf-8") : ""
  if (totext.code !== 0) {
    notes.push("pdftotext failed to run - contains/garbled-text checks are unavailable, not just clean.")
  } else {
    const garbledOccurrences: GarbledOccurrence[] = []
    const scanPatterns: [string, RegExp][] = [
      ["(cid:N)", /\(cid:\d+\)/g],
      ["U+FFFD replacement char", /\uFFFD/g],
    ]
    for (const [label, re] of scanPatterns) {
      let m: RegExpExecArray | null
      while ((m = re.exec(extractedText)) !== null) {
        const start = Math.max(0, m.index - 30)
        const end = Math.min(extractedText.length, m.index + 30)
        garbledOccurrences.push({
          pattern: label,
          context: extractedText.slice(start, end).replace(/\s+/g, " ").trim(),
        })
      }
    }
    result.garbledOccurrences = garbledOccurrences
    result.garbledTextDetected = garbledOccurrences.length > 0
    result.containsChecks = flags.contains.map((t) => ({ text: t, found: extractedText.includes(t) }))
  }

  // Cleanup build artifacts (never the .pdf or .tex themselves)
  if (!flags.keepArtifacts) {
    let cleaned = true
    for (const p of [auxPath, logPath, outPath, txtPath]) {
      if (existsSync(p)) {
        try {
          unlinkSync(p)
        } catch {
          cleaned = false
        }
      }
    }
    result.artifactsCleanedUp = cleaned
  } else {
    notes.push("--keep-artifacts was set; .aux/.log/.out/.txt left on disk for debugging.")
  }

  const overallOk =
    result.compileSuccess &&
    (result.pageCountMatches === null || result.pageCountMatches) &&
    !result.garbledTextDetected &&
    result.containsChecks.every((c) => c.found)

  process.stdout.write(JSON.stringify(result, null, 2) + "\n")
  process.exit(overallOk ? 0 : 1)
}

main()
