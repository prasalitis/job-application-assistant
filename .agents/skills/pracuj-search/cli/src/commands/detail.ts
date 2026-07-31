import { htmlFetch, extractNextData, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a raw offer ID or a full pracuj.pl offer URL (ID is the trailing `,oferta,<id>`). */
function normalizeId(input: string): string | null {
  const url = input.match(/,oferta,(\d+)/)
  if (url) return url[1]
  const bare = input.match(/^\d+$/)
  if (bare) return input
  return null
}

/** pracuj.pl does not validate the slug text before ",oferta,<id>" - only the ID matters. */
function detailUrl(id: string): string {
  return `https://www.pracuj.pl/praca/oferta,oferta,${id}`
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse an offer ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(detailUrl(id))
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const nextData = extractNextData(html)
    if (!nextData) {
      writeError("Could not find __NEXT_DATA__ in the response - the page markup may have changed", "PARSE_FAILED")
      return 1
    }
    const job = parseJobDetail(nextData, id)
    if (!job) {
      writeError("Job not found or listing has expired", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"}`,
        "",
        job.deadline ? `Deadline: ${job.deadline.slice(0, 10)}` : "",
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
