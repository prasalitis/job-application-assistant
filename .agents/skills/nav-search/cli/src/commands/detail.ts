import { fetchDetailPage, parseDetailPage, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a raw ad UUID or a full arbeidsplassen.nav.no stilling URL. */
function normalizeId(input: string): string | null {
  const url = input.match(/\/stilling\/([0-9a-f-]{36})/i)
  if (url) return url[1]
  const uuid = input.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  if (uuid) return input
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse an ad ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await fetchDetailPage(id)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseDetailPage(html, id)
    if (!job) {
      writeError("Could not parse the job-detail page - the page markup may have changed", "PARSE_FAILED")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        "(company, location, and date come from search results, not this command)",
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
