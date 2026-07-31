import { afterEach, describe, expect, test } from "bun:test";
import { runCLI, parseJSON } from "./helpers.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Live search smoke tests", () => {
  // Note: these tests make actual HTTP requests to No Fluff Jobs
  // They may be slow and may fail if the site is down or blocks requests
  
  test("search returns results for 'developer'", async () => {
    const result = await runCLI(["search", "-q", "developer", "--limit", "3", "--format", "json"]);
    
    expect(result.exitCode).toBe(0);
    const json = parseJSON<{ meta: { count: number }; results: Array<{ id: string; title: string; url: string }> }>(result);
    expect(json.meta.count).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(json.results)).toBe(true);
    
    // Verify each result has required fields
    for (const r of json.results) {
      expect(r.id).toBeTruthy();
      expect(r.title).toBeTruthy();
      expect(r.url).toContain("nofluffjobs.com/job/");
    }
  }, 10000); // 10 second timeout for live test

  test("search with location filter", async () => {
    const result = await runCLI(["search", "-q", "developer", "-l", "Warsaw", "--limit", "3", "--format", "json"]);
    
    expect(result.exitCode).toBe(0);
    const json = parseJSON<{ results: Array<{ location: string | null }> }>(result);
    expect(Array.isArray(json.results)).toBe(true);
  }, 10000);

  test("search returns table format", async () => {
    const result = await runCLI(["search", "-q", "developer", "--limit", "2", "--format", "table"]);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("TITLE");
    expect(result.stdout).toContain("COMPANY");
    expect(result.stdout).toContain("LOCATION");
  }, 10000);
});
