#!/usr/bin/env bun
// Self-contained CLI for searching jobs on jobs.ch (Switzerland), via its embedded
// schema.org JobPosting structured data. No external CLI framework, zero runtime
// dependencies - runs anywhere `bun` is available.
//
// PERSONAL USE ONLY - see SKILL.md. jobs.ch's robots.txt disallows automated access
// to individual job-detail pages; this CLI's `detail` command fetches them anyway on
// the same personal-use judgment call this repo already makes for LinkedIn's ToS via
// linkedin-search. Keep volume low, never commercial/bulk use.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `jobsch-cli — search jobs on jobs.ch (Switzerland)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <uuid|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>   Keywords (job title, skill, or role). Recommended.
  --page <n>           1-indexed page (21 results/page). Default 1.
  --limit, -n <n>      Cap results emitted (client-side).
  --format <fmt>       json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "IT governance" --format table
  bun run src/cli.ts search -q "software asset manager" --format json
  bun run src/cli.ts detail 090087b4-e4f9-4feb-a219-acb7cefc8303 --format plain

PERSONAL USE ONLY - jobs.ch's robots.txt disallows automated access to individual
job-detail pages. This CLI's "detail" command fetches them anyway on a personal-use
basis (same judgment already made for linkedin-search / LinkedIn's ToS). Keep volume
low; never use this commercially or for bulk data collection.
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"
    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10)
      if (isNaN(val)) {
        process.stderr.write(JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n")
        return null
      }
      return val
    }
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      flags.page = String(v)
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      flags.limit = String(v)
    }
    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires a <uuid|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = { id, format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"] }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main().then((code) => process.exit(code))
