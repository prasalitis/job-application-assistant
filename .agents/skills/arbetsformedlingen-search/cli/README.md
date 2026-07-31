# arbetsformedlingen-cli

CLI for searching Swedish jobs via the official
[JobTech Dev](https://jobtechdev.se) open-data API
(`jobsearch.api.jobtechdev.se`), which backs
[arbetsformedlingen.se](https://arbetsformedlingen.se)'s "Platsbanken". No
authentication, zero runtime dependencies - a real government REST API, not a
scraped site.

## Install

```bash
bun install
```

## Usage

```bash
bun run src/cli.ts search -q "IT governance" --format table
bun run src/cli.ts detail <id> --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for the API's
documented parameters (there's a lot more available than this CLI currently exposes -
see the OpenAPI spec at `https://jobsearch.api.jobtechdev.se/swagger.json`).

## Test

```bash
bun run typecheck
bun run test
```

`tests/parsing.test.ts` is offline (synthetic fixtures). `tests/smoke.test.ts` hits
the real API - keep it to the existing handful of assertions.
