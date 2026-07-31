# moovijob-cli

CLI for searching jobs on [moovijob.com](https://en.moovijob.com), Luxembourg's job
board. No authentication, zero runtime dependencies beyond `curl`.

## Install

```bash
bun install
```

## Usage

```bash
bun run src/cli.ts search -q "IT governance" --format table
bun run src/cli.ts detail <company-slug>/<title-slug> --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for how the
data source works (including why `curl` is required).

## Test

```bash
bun run typecheck
bun run test
```

`tests/parsing.test.ts` is offline (synthetic fixtures). `tests/smoke.test.ts` hits
the real site - keep it to the existing handful of assertions.
