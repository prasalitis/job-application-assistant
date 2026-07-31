# nav-cli

CLI for searching Norwegian jobs via NAV's "Arbeidsplassen" public search API
(`arbeidsplassen.nav.no`). No authentication, zero runtime dependencies.

## Install

```bash
bun install
```

## Usage

```bash
bun run src/cli.ts search -q "IT governance" --format table
bun run src/cli.ts detail <uuid> --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for how the
data source works - including the React Flight streaming parser `detail` uses, which
is more fragile than the other portal skills' JSON-based parsing.

## Test

```bash
bun run typecheck
bun run test
```

`tests/parsing.test.ts` is offline (synthetic fixtures, including a from-scratch
constructor for the React Flight chunk format). `tests/smoke.test.ts` hits the real
API/site - keep it to the existing handful of assertions.
