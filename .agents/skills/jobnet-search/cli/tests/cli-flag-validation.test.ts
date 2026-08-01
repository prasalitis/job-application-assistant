import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

// All cases fail schema validation before any network request, so the suite
// is network-free. Regression context: a bare z.coerce.number() accepted
// --limit=-1, and slice(0, -1) then silently dropped the last result instead
// of erroring.

describe("Jobnet CLI flag validation", () => {
  test("search --limit=-1 is rejected instead of silently dropping the last result", async () => {
    const result = await runCLI(["search", "--limit=-1"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.error).toContain("positive integer");
  });

  test("search --limit=0 is rejected", async () => {
    const result = await runCLI(["search", "--limit=0"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.error).toContain("positive integer");
  });

  test("search --limit=1.5 is rejected as non-integer", async () => {
    const result = await runCLI(["search", "--limit=1.5"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.error).toContain("integer");
  });

  test("search --page=0 is rejected on the 1-indexed portal", async () => {
    const result = await runCLI(["search", "--page=0"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.error).toContain("positive integer");
  });

  test("search --per-page=-1 is rejected", async () => {
    const result = await runCLI(["search", "--per-page=-1"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.error).toContain("positive integer");
  });

  test("occupations --per-page=0 is rejected", async () => {
    const result = await runCLI(["occupations", "--search-string", "test", "--per-page=0"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.error).toContain("positive integer");
  });

  test("suggestions --limit=0 is rejected", async () => {
    const result = await runCLI(["suggestions", "--query", "test", "--limit=0"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.error).toContain("positive integer");
  });

  test("valid numeric flags pass schema validation", async () => {
    const result = await runCLI(["search", "--page=2", "--limit=5"]);

    // Valid flags must never trigger the manual VALIDATION_ERROR path. The CLI
    // may still succeed (real network call) or fail for an unrelated reason
    // depending on network availability in the test environment - only a
    // VALIDATION_ERROR on these valid inputs would indicate a real bug.
    if (result.exitCode !== 0) {
      const error = JSON.parse(result.stderr);
      expect(error.code).not.toBe("VALIDATION_ERROR");
    }
  });
});
