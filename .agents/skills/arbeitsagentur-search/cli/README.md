# arbeitsagentur-cli

CLI for searching German jobs via the Bundesagentur für Arbeit (Federal Employment
Agency) Jobsuche API. No authentication (beyond a well-known public API key), zero
runtime dependencies.

## Install

```bash
bun install
```

## Usage

```bash
bun run src/cli.ts search -q "IT governance" --format table
bun run src/cli.ts detail <refnr> --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for how the
data source works (including a known gap for externally-sourced listings).

## Test

```bash
bun run typecheck
bun run test
```

`tests/parsing.test.ts` is offline (synthetic fixtures). `tests/smoke.test.ts` hits
the real API/site - keep it to the existing handful of assertions.
