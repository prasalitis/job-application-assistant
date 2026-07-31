import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

// Live smoke tests - hit the real jobs.ch site. Keep volume low: one search, one detail.

describe("live smoke test", () => {
  test("search with a realistic query returns at least one real result", async () => {
    const result = await runCLI(["search", "-q", "IT governance", "--limit", "5", "--format", "json"]);
    const parsed = parseJSON<{ meta: { count: number }; results: Array<{ id: string; title: string; url: string }> }>(result);
    expect(parsed.results.length).toBeGreaterThan(0);
    const [job] = parsed.results;
    expect(job.id).toBeTruthy();
    expect(job.title).toBeTruthy();
    expect(job.url).toContain("jobs.ch");
  }, 30000);

  test("detail on a real ID returns a description", async () => {
    const search = await runCLI(["search", "-q", "IT governance", "--limit", "1", "--format", "json"]);
    const { results } = parseJSON<{ results: Array<{ id: string }> }>(search);
    expect(results.length).toBeGreaterThan(0);

    const detail = await runCLI(["detail", results[0].id, "--format", "json"]);
    const job = parseJSON<{ title: string; description: string | null }>(detail);
    expect(job.title).toBeTruthy();
    expect(job.description).toBeTruthy();
  }, 30000);

  test("a missing required arg (detail with no id) exits 1 with a JSON error on stderr", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("NO_ID");
  });

  test("an unknown command exits 1 with a JSON error on stderr", async () => {
    const result = await runCLI(["bogus-command"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("BAD_CMD");
  });
});
