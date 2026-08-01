import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

// All cases fail schema validation before any network request, so the suite
// is network-free. Regression context: a bare z.coerce.number() accepted
// --limit=-1, and slice(0, -1) then silently dropped the last result instead
// of erroring.

describe("Jobindex CLI flag validation", () => {
  test("--limit=-1 is rejected instead of silently dropping the last result", async () => {
    const result = await runCLI(["search", "--query", "test", "--limit=-1"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.error).toContain("positive integer");
  });

  test("--limit=0 is rejected", async () => {
    const result = await runCLI(["search", "--query", "test", "--limit=0"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.error).toContain("positive integer");
  });

  test("--limit=1.5 is rejected as non-integer", async () => {
    const result = await runCLI(["search", "--query", "test", "--limit=1.5"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.error).toContain("integer");
  });

  test("--page=0 is rejected on the 1-indexed portal", async () => {
    const result = await runCLI(["search", "--query", "test", "--page=0"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.error).toContain("positive integer");
  });

  test("valid numeric flags pass schema validation", async () => {
    const result = await runCLI(["search", "--query", "test", "--page=2", "--limit=5"]);

    // Should not fail validation, but may fail for other reasons (no network)
    // The key is it doesn't hang and doesn't fail with VALIDATION_ERROR
    expect(result.exitCode).not.toBe(0); // Will fail because no network, but not validation
    const error = JSON.parse(result.stderr);
    expect(error.code).not.toBe("VALIDATION_ERROR");
  });
});
