import { afterEach, describe, expect, test } from "bun:test";
import { runCLI, parseJSON } from "./helpers.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("CLI flag validation", () => {
  test("search without query returns empty or all results", async () => {
    // Mock a simple HTML response
    globalThis.fetch = (async () =>
      new Response(`
        <html><body>
          [### Software Engineer
          18 000 - 22 000 PLN
          Backend
          #### Silvair
          Kraków](/job/software-engineer-python-aws-silvair-krakow-12345)
        </body></html>
      `)
    ) as typeof fetch;

    const result = await runCLI(["search", "--format", "json"]);
    
    // Should not error, might return empty or parsed results
    expect(result.exitCode).toBe(0);
    // The response should be valid JSON
    const json = JSON.parse(result.stdout);
    expect(json).toHaveProperty("results");
    expect(Array.isArray(json.results)).toBe(true);
  });

  test("search with query and location", async () => {
    globalThis.fetch = (async () =>
      new Response(`
        <html><body>
          [### Senior DevOps Engineer
          24 227 - 28 120 PLN
          DevOps
          #### Matrix Global Services
          Remote](/job/senior-devops-engineer-matrix-global-services-remote-54321)
        </body></html>
      `)
    ) as typeof fetch;

    const result = await runCLI([
      "search",
      "-q", "devops",
      "-l", "Poland",
      "--format", "json",
    ]);
    
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json).toHaveProperty("results");
  });

  test("search with invalid limit flag errors", async () => {
    const result = await runCLI(["search", "-q", "test", "--limit", "invalid"]);
    
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("BAD_ARG");
  });

  test("detail without ID errors", async () => {
    const result = await runCLI(["detail"]);
    
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("NO_ID");
  });

  test("help flag shows help text", async () => {
    const result = await runCLI(["--help"]);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("nofluffjobs-cli");
    expect(result.stdout).toContain("USAGE");
  });

  test("unknown command errors", async () => {
    const result = await runCLI(["unknown-command"]);
    
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("BAD_CMD");
  });
});
