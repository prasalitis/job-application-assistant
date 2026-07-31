#!/usr/bin/env bun
// Deterministic company+role duplicate checker for the job-search pipeline.
//
// Why this exists: an AI-driven dedup check (comparing strings via judgment) missed
// "Cracow" vs "Kraków" as the same posting in real use, and a separate run never
// checked the tracker CSV at all despite being told to. Both are exactly the kind of
// mechanical, zero-ambiguity comparison that should be code, not a probabilistic
// judgment call - this script is deterministic, testable, and gives the same answer
// every time for the same input, which an AI's read of two strings cannot promise.
//
// Usage:
//   bun run tools/dedup-check.ts --candidates candidates.json \
//     --seen-jobs job_scraper/seen_jobs.json --tracker job_search_tracker.csv
//
// candidates.json: [{ "key": "<id or url>", "company": "...", "title": "..." }, ...]
//
// Output (stdout, JSON): one result per candidate, in the same order:
//   [{ "key": "...", "verdict": "duplicate" | "not_duplicate" | "review",
//      "companySim": 0.0-1.0, "titleSim": 0.0-1.0,
//      "matchedAgainst": { "source": "seen_jobs" | "tracker", "company": "...", "title": "..." } | null }]
//
// Verdicts:
//   "duplicate"     - safe to auto-skip. Only formatting/noise differs (diacritics,
//                     punctuation, legal suffixes, a location appended in parens).
//   "not_duplicate" - company or title are substantively different.
//   "review"        - genuinely ambiguous (e.g. a "Senior" variant of the same base
//                     role, or mixed-signal title overlap). Deliberately NOT auto-decided
//                     by string distance - surface this to the AI/human for a real judgment call.

import { readFileSync } from "fs"

interface Candidate {
  key: string
  company: string
  title: string
}

interface MatchSource {
  source: "seen_jobs" | "tracker"
  company: string
  title: string
}

interface Result {
  key: string
  verdict: "duplicate" | "not_duplicate" | "review"
  companySim: number
  titleSim: number
  matchedAgainst: MatchSource | null
}

const LEGAL_SUFFIXES = [
  "sp z o o",
  "spolka z ograniczona odpowiedzialnoscia",
  "s a",
  "ltd",
  "limited",
  "gmbh",
  "inc",
  "incorporated",
  "llc",
  "ag",
  "nv",
  "bv",
  "a s",
  "oy",
  "plc",
  "kg",
]

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
  const m = a.length
  const n = b.length
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

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function classifyPair(
  candCompany: string,
  candTitle: string,
  otherCompany: string,
  otherTitle: string,
): { verdict: Result["verdict"]; companySim: number; titleSim: number } {
  const companySim = similarity(normalize(candCompany), normalize(otherCompany))
  const titleSim = similarity(
    normalize(candTitle, { stripParens: true }),
    normalize(otherTitle, { stripParens: true }),
  )

  if (companySim < 0.75) {
    return { verdict: "not_duplicate", companySim: round(companySim), titleSim: round(titleSim) }
  }
  if (titleSim >= 0.9) {
    return { verdict: "duplicate", companySim: round(companySim), titleSim: round(titleSim) }
  }
  if (titleSim >= 0.55) {
    return { verdict: "review", companySim: round(companySim), titleSim: round(titleSim) }
  }
  return { verdict: "not_duplicate", companySim: round(companySim), titleSim: round(titleSim) }
}

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2)
      flags[key] = argv[i + 1]
      i++
    }
  }
  return flags
}

function loadSeenJobs(path: string): { company: string; title: string }[] {
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"))
    const seen = raw.seen || raw
    return Object.values(seen as Record<string, any>).map((v: any) => ({
      company: v.company || "",
      title: v.title || "",
    }))
  } catch {
    return []
  }
}

function loadTracker(path: string): { company: string; title: string }[] {
  try {
    const raw = readFileSync(path, "utf-8")
    const lines = raw.split("\n").filter((l) => l.trim().length > 0)
    if (lines.length < 2) return []
    const header = parseCsvLine(lines[0])
    const companyIdx = header.indexOf("company")
    const roleIdx = header.indexOf("role")
    if (companyIdx === -1 || roleIdx === -1) return []
    return lines.slice(1).map((line) => {
      const cols = parseCsvLine(line)
      return { company: cols[companyIdx] || "", title: cols[roleIdx] || "" }
    })
  } catch {
    return []
  }
}

/** Minimal CSV line parser handling quoted fields with embedded commas. */
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        cur += c
      }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ",") {
        result.push(cur)
        cur = ""
      } else cur += c
    }
  }
  result.push(cur)
  return result
}

function main() {
  const flags = parseFlags(process.argv.slice(2))
  if (!flags.candidates) {
    process.stderr.write(JSON.stringify({ error: "--candidates <file> is required", code: "NO_CANDIDATES" }) + "\n")
    process.exit(1)
  }

  const candidates: Candidate[] = JSON.parse(readFileSync(flags.candidates, "utf-8"))
  const seenJobs = flags["seen-jobs"] ? loadSeenJobs(flags["seen-jobs"]) : []
  const tracker = flags.tracker ? loadTracker(flags.tracker) : []

  const pool: { source: "seen_jobs" | "tracker"; company: string; title: string }[] = [
    ...seenJobs.map((j) => ({ source: "seen_jobs" as const, ...j })),
    ...tracker.map((j) => ({ source: "tracker" as const, ...j })),
  ]

  const results: Result[] = candidates.map((cand) => {
    let best: Result = {
      key: cand.key,
      verdict: "not_duplicate",
      companySim: 0,
      titleSim: 0,
      matchedAgainst: null,
    }
    for (const entry of pool) {
      const { verdict, companySim, titleSim } = classifyPair(cand.company, cand.title, entry.company, entry.title)
      const rank = (v: Result["verdict"]) => (v === "duplicate" ? 2 : v === "review" ? 1 : 0)
      if (rank(verdict) > rank(best.verdict) || (rank(verdict) === rank(best.verdict) && titleSim > best.titleSim)) {
        best = {
          key: cand.key,
          verdict,
          companySim,
          titleSim,
          matchedAgainst: { source: entry.source, company: entry.company, title: entry.title },
        }
      }
    }
    return best
  })

  process.stdout.write(JSON.stringify(results, null, 2) + "\n")
}

main()
