# pracuj-cli

CLI for searching jobs on [pracuj.pl](https://www.pracuj.pl), Poland's largest job
board. No authentication, zero runtime dependencies.

## Install

```bash
bun install
```

(Only pulls dev-only type definitions; the CLI itself has zero runtime dependencies.)

## Usage

```bash
bun run src/cli.ts search -q "software asset manager" --format table
bun run src/cli.ts detail <id> --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for how the
data source works.

## Test

```bash
bun run typecheck
bun run test
```

`tests/parsing.test.ts` is offline (synthetic fixtures). `tests/smoke.test.ts` hits
the real site - keep it to the existing handful of assertions rather than expanding
into a crawl.
