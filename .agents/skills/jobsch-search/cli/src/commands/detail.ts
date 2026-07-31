import { htmlFetch, parseJobDetail, writeError } from "../helpers.js"

const BASE_URL = "https://www.jobs.ch"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a raw job UUID or a full jobs.ch vacancy detail URL. */
function normalizeUrl(input: string): string | null {
  if (/^https?:\/\//.test(input)) return input
  const uuid = input.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  if (uuid) return `${BASE_URL}/en/vacancies/detail/${input}/`
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const url = normalizeUrl(opts.id)
  if (!url) {
    writeError(`Could not parse a job ID or URL from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(url)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html)
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
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
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
