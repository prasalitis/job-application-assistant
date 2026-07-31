import { htmlFetch, parseJobDetail, writeError } from "../helpers.js"

const BASE_URL = "https://en.moovijob.com"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a full moovijob.com job-offers URL, or a "<company-slug>/<title-slug>" path. */
function normalizeUrl(input: string): string | null {
  if (/^https?:\/\//.test(input)) return input
  if (/^[a-z0-9-]+\/[a-z0-9-]+$/.test(input)) return `${BASE_URL}/job-offers/${input}`
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const url = normalizeUrl(opts.id)
  if (!url) {
    writeError(`Could not parse a job URL or "<company>/<title>" path from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(url)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    // moovijob.com has no numeric ID in its detail URL - use the path itself as the id.
    const id = url.replace(/^https?:\/\/[^/]+\/job-offers\//, "")
    const job = parseJobDetail(html, id, url)
    if (!job) {
      writeError("Could not find the JobPosting JSON-LD block - the page markup may have changed", "PARSE_FAILED")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.deadline ? `Deadline: ${job.deadline.slice(0, 10)}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
