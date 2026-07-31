# jobsch-cli

CLI for searching jobs on [jobs.ch](https://www.jobs.ch) (Switzerland). No
authentication, zero runtime dependencies. **Personal use only** — see `../SKILL.md`.

## Install

```bash
bun install
```

## Usage

```bash
bun run src/cli.ts search -q "IT governance" --format table
bun run src/cli.ts detail <uuid> --format plain
```

See `../SKILL.md` for the full flag reference (including the personal-use notice)
and `../url-reference.md` for how the data source works.

## Test

```bash
bun run typecheck
bun run test
```

`tests/parsing.test.ts` is offline (synthetic fixtures). `tests/smoke.test.ts` hits
the real site - keep it to the existing handful of assertions.
