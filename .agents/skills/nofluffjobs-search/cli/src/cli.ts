#!/usr/bin/env bun
// Self-contained CLI for searching jobs on No Fluff Jobs.
// No external CLI framework, so it runs anywhere `bun` is available with zero install.
//
// Personal use only. This reads No Fluff Jobs' public pages; keep volume low.

import { runSearch, type SearchOpts } from "./commands/search.js";
import { runDetail, type DetailOpts } from "./commands/detail.js";

interface Flags {
  _: string[];
  [k: string]: string | boolean | string[];
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  const alias: Record<string, string> = {
    q: "query",
    l: "location",
    n: "limit",
    f: "format",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "");
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      (flags._ as string[]).push(a);
    }
  }
  return flags;
}

const HELP = `nofluffjobs-cli — search jobs on No Fluff Jobs (CEE IT job portal)

USAGE
  bun run src/cli.ts search -q "<query>" [flags]
  bun run src/cli.ts detail <url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, or role). Recommended.
  --location, -l <text>   Location filter (city or country). Optional.
  --page <n>              1-indexed page (default 1).
  --limit, -n <n>         Cap results emitted (client-side).
  --format, -f <fmt>      json (default) | table | plain.

DETAIL COMMAND
  bun run src/cli.ts detail <url|slug> [--format json|plain]
  
  Pass a full No Fluff Jobs URL like:
    https://nofluffjobs.com/job/senior-devops-engineer-company-remote-12345
  
  Or a path like: /job/senior-devops-engineer-company-remote-12345

EXAMPLES
  bun run src/cli.ts search -q "software asset management" -l "Poland" --format table
  bun run src/cli.ts search -q "IT asset management" --limit 5 --format table
  bun run src/cli.ts search -q "developer" -l "Warsaw" --format table
  bun run src/cli.ts detail /job/senior-devops-engineer-company-remote-12345 --format plain

Personal use only — uses No Fluff Jobs' public pages; keep volume low.
`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const flags = parseFlags(argv);
  const cmd = (flags._ as string[])[0];

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP);
    return 0;
  }

  if (cmd === "search") {
    const query = typeof flags.query === "string" ? flags.query : undefined;
    const location = typeof flags.location === "string" ? flags.location : undefined;
    const fmt = (flags.format as string) || "json";

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10);
      if (isNaN(val)) {
        process.stderr.write(
          JSON.stringify({
            error: `--${name} must be a number, got "${raw}"`,
            code: "BAD_ARG",
          }) + "\n",
        );
        return null;
      }
      return val;
    };

    let page = 1;
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page);
      if (v === null) return 1;
      page = Math.max(1, v);
    }

    let limit: number | undefined;
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit);
      if (v === null) return 1;
      limit = v;
    }

    const opts: SearchOpts = {
      query,
      location,
      page,
      limit,
      format: (['json', 'table', 'plain'].includes(fmt) ? fmt : 'json') as SearchOpts['format'],
    };
    return runSearch(opts);
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1];
    if (!id) {
      process.stderr.write(
        JSON.stringify({ error: "detail requires a <url|slug>", code: "NO_ID" }) + "\n",
      );
      return 1;
    }
    const fmt = (flags.format as string) || "json";
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    };
    return runDetail(opts);
  }

  process.stderr.write(
    JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n",
  );
  return 1;
}

main().then((code) => process.exit(code));
