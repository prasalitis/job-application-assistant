#!/usr/bin/env bun
// Deterministic tracker-update + archive-folder helper for the outcome skill.
//
// Why this exists: two separate verified test runs of the outcome skill showed the
// same class of problem - a silent omission (job_posting.md was never created and
// never mentioned in the final report) and a fabrication (the user said "mid-August
// 2026" and the skill wrote "2026-08-15" into outcome.md, inventing a specific day
// that was never stated). Both are exactly the kind of thing a script can prevent
// structurally: this script always reports job_posting.md's exact status (never
// silently omits it), and it never touches, reformats, or "cleans up" a date string -
// whatever is passed in --note is exactly what lands on disk, verbatim.
//
// Usage:
//   bun run tools/outcome-record.ts --company "ABB" --role "IS Department Manager for Software and SaaS Category" \
//     --tracker job_search_tracker.csv --status rejected --note "mid-August 2026: rejected via ..." \
//     --archive-root documents/applications --cv-source cv/main_abb.tex --cover-source cover_letters/cover_abb.tex
//
// Output (stdout, JSON): matchedRow, archiveFolder, archiveCreated, filesArchived
// (cvDraft/coverLetter/jobPosting status - job_posting.md status is ALWAYS reported,
// never omitted), trackerUpdated, previousNote, newNote.
// Exit code: 0 if a tracker row was matched and updated, 1 otherwise.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "fs"
import { join, basename } from "path"

// --- Reused fuzzy-match logic (same classifier as tools/dedup-check.ts) ---
const LEGAL_SUFFIXES = ["sp z o o", "s a", "ltd", "limited", "gmbh", "inc", "incorporated", "llc", "ag", "nv", "bv", "a s", "oy", "plc", "kg"]

function normalize(s: string, opts: { stripParens?: boolean } = {}): string {
  let out = s
  if (opts.stripParens) out = out.replace(/\([^)]*\)/g, " ")
  out = out
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[łŁ]/g, "l")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  for (const suffix of LEGAL_SUFFIXES) {
    out = out.replace(new RegExp(`\\b${suffix}\\b\\.?$`), "").trim()
  }
  return out
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

function similarity(a: string, b: string): number {
  if (a === b) return 1
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

function isMatch(candCompany: string, candRole: string, rowCompany: string, rowRole: string): boolean {
  const companySim = similarity(normalize(candCompany), normalize(rowCompany))
  const titleSim = similarity(normalize(candRole, { stripParens: true }), normalize(rowRole, { stripParens: true }))
  return companySim >= 0.75 && titleSim >= 0.9
}

// --- Minimal CSV parse/write preserving all columns and unmatched rows exactly ---
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cur += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ",") { result.push(cur); cur = "" }
      else cur += c
    }
  }
  result.push(cur)
  return result
}

function csvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      flags[argv[i].slice(2)] = argv[i + 1]
      i++
    }
  }
  return flags
}

interface Result {
  matchedRow: { company: string; role: string; previousStatus: string } | null
  archiveFolder: string | null
  archiveCreated: boolean
  filesArchived: {
    cvDraft: { attempted: boolean; copied: boolean; sourceExisted: boolean }
    coverLetter: { attempted: boolean; copied: boolean; sourceExisted: boolean }
    jobPosting: { exists: boolean; note: string }
  }
  trackerUpdated: boolean
  previousNote: string | null
  newNote: string | null
}

function main() {
  const flags = parseFlags(process.argv.slice(2))
  const required = ["company", "role", "tracker", "status", "note"]
  for (const r of required) {
    if (!flags[r]) {
      process.stderr.write(JSON.stringify({ error: `--${r} is required`, code: "MISSING_ARG" }) + "\n")
      process.exit(1)
    }
  }

  const trackerPath = flags.tracker
  const raw = readFileSync(trackerPath, "utf-8")
  const lines = raw.split("\n")
  // Preserve trailing-newline behavior of the original file exactly.
  const hadTrailingNewline = raw.endsWith("\n")
  const nonEmptyLines = lines.filter((l) => l.length > 0)
  const header = parseCsvLine(nonEmptyLines[0])
  const companyIdx = header.indexOf("company")
  const roleIdx = header.indexOf("role")
  const statusIdx = header.indexOf("status")
  const notesIdx = header.indexOf("notes")

  const result: Result = {
    matchedRow: null,
    archiveFolder: null,
    archiveCreated: false,
    filesArchived: {
      cvDraft: { attempted: false, copied: false, sourceExisted: false },
      coverLetter: { attempted: false, copied: false, sourceExisted: false },
      jobPosting: { exists: false, note: "" },
    },
    trackerUpdated: false,
    previousNote: null,
    newNote: null,
  }

  if (companyIdx === -1 || roleIdx === -1 || statusIdx === -1 || notesIdx === -1) {
    process.stderr.write(JSON.stringify({ error: "tracker CSV is missing required columns (company/role/status/notes)", code: "BAD_TRACKER" }) + "\n")
    process.exit(1)
  }

  let matchedIdx = -1
  for (let i = 1; i < nonEmptyLines.length; i++) {
    const cols = parseCsvLine(nonEmptyLines[i])
    if (isMatch(flags.company, flags.role, cols[companyIdx] || "", cols[roleIdx] || "")) {
      matchedIdx = i
      break
    }
  }

  if (matchedIdx === -1) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n")
    process.exit(1)
  }

  const matchedCols = parseCsvLine(nonEmptyLines[matchedIdx])
  result.matchedRow = { company: matchedCols[companyIdx], role: matchedCols[roleIdx], previousStatus: matchedCols[statusIdx] }
  result.previousNote = matchedCols[notesIdx]
  // Append-only: never overwrite the existing note, always append the new one after it.
  const newNote = matchedCols[notesIdx] ? `${matchedCols[notesIdx]} ${flags.note}` : flags.note
  result.newNote = newNote
  matchedCols[statusIdx] = flags.status
  matchedCols[notesIdx] = newNote
  nonEmptyLines[matchedIdx] = matchedCols.map(csvField).join(",")
  writeFileSync(trackerPath, nonEmptyLines.join("\n") + (hadTrailingNewline ? "\n" : ""), "utf-8")
  result.trackerUpdated = true

  // Archive folder
  if (flags["archive-root"]) {
    const folderName = slugify(`${flags.company}_${flags.role}`)
    const archiveDir = join(flags["archive-root"], folderName)
    result.archiveFolder = archiveDir
    if (!existsSync(archiveDir)) {
      mkdirSync(archiveDir, { recursive: true })
      result.archiveCreated = true
    }

    if (flags["cv-source"]) {
      result.filesArchived.cvDraft.attempted = true
      const srcExists = existsSync(flags["cv-source"])
      result.filesArchived.cvDraft.sourceExisted = srcExists
      const dest = join(archiveDir, "cv_draft.tex")
      if (srcExists && !existsSync(dest)) {
        copyFileSync(flags["cv-source"], dest)
        result.filesArchived.cvDraft.copied = true
      }
    }
    if (flags["cover-source"]) {
      result.filesArchived.coverLetter.attempted = true
      const srcExists = existsSync(flags["cover-source"])
      result.filesArchived.coverLetter.sourceExisted = srcExists
      const dest = join(archiveDir, "cover_letter.tex")
      if (srcExists && !existsSync(dest)) {
        copyFileSync(flags["cover-source"], dest)
        result.filesArchived.coverLetter.copied = true
      }
    }
    // job_posting.md status is ALWAYS reported here, structurally - there is no code
    // path that skips setting this field, unlike the AI-driven version that silently
    // omitted it in a verified test run.
    const jobPostingPath = join(archiveDir, "job_posting.md")
    result.filesArchived.jobPosting.exists = existsSync(jobPostingPath)
    result.filesArchived.jobPosting.note = existsSync(jobPostingPath)
      ? "job_posting.md already exists in the archive - left untouched."
      : "job_posting.md does NOT exist. This script does not create it (fetching/pasting the posting is a judgment call, not mechanical) - the calling skill must explicitly create it or explicitly note why it can't."
  }

  process.stdout.write(JSON.stringify(result, null, 2) + "\n")
  process.exit(0)
}

main()
