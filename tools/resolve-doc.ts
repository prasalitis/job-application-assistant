#!/usr/bin/env bun
// Deterministic path resolver: personal data file if it exists, generic template otherwise.
//
// Why this exists: after splitting real candidate data out of the git-tracked skill files
// (into a gitignored personal/ directory) to make this repo safely publishable, every
// skill that reads those files needs to actually get the real data, not the placeholder
// template that's left in the tracked copy. A comment inside the file saying "check
// personal/ first" is not reliable enough on its own - it's exactly the class of
// prose-only instruction that's failed repeatedly elsewhere in this project. This script
// makes "which file do I read" a mechanical lookup instead of a judgment call: the skill
// runs this once, then reads whatever path it returns - no different from any other tool
// call in this repo's skills.
//
// Usage:
//   bun run tools/resolve-doc.ts --primary personal/01-candidate-profile.md \
//     --fallback .agents/skills/job-application-assistant/01-candidate-profile.md
//
// Output (stdout, JSON): { "resolvedPath": "...", "usedPrimary": true|false }
// Exit code: always 0 (this is a resolution, not a pass/fail check) - unless neither
// path exists, in which case exit 1 with an error.

import { existsSync } from "fs"

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

function main() {
  const flags = parseFlags(process.argv.slice(2))
  if (!flags.primary || !flags.fallback) {
    process.stderr.write(JSON.stringify({ error: "--primary <path> and --fallback <path> are required", code: "MISSING_ARGS" }) + "\n")
    process.exit(1)
  }

  if (existsSync(flags.primary)) {
    process.stdout.write(JSON.stringify({ resolvedPath: flags.primary, usedPrimary: true }, null, 2) + "\n")
    process.exit(0)
  }

  if (existsSync(flags.fallback)) {
    process.stdout.write(JSON.stringify({ resolvedPath: flags.fallback, usedPrimary: false }, null, 2) + "\n")
    process.exit(0)
  }

  process.stderr.write(JSON.stringify({ error: `Neither path exists: ${flags.primary} or ${flags.fallback}`, code: "NOT_FOUND" }) + "\n")
  process.exit(1)
}

main()
