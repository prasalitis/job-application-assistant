import { fetchDetailPage, extractNgState, toDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a raw refnr or a full arbeitsagentur.de jobdetail URL. */
function normalizeRefnr(input: string): string | null {
  const url = input.match(/\/jobdetail\/([^/?#]+)/)
  if (url) return decodeURIComponent(url[1])
  if (input.trim().length > 0) return input
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const refnr = normalizeRefnr(opts.id)
  if (!refnr) {
    writeError(`Could not parse a reference number from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await fetchDetailPage(refnr)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const ngState = extractNgState(html)
    if (!ngState) {
      writeError("Could not find the ng-state block - the page markup may have changed", "PARSE_FAILED")
      return 1
    }
    const job = toDetail(ngState, refnr)
    if (!job) {
      writeError("Job detail data missing from the page state", "PARSE_FAILED")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.fullTime !== null ? `Full-time: ${job.fullTime ? "yes" : "no"}` : "",
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
