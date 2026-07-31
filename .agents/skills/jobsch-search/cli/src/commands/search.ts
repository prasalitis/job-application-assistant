import { htmlFetch, parseSearchResults, writeError, type JobCard } from "../helpers.js"

const BASE_URL = "https://www.jobs.ch"

export interface SearchOpts {
  query?: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("term", opts.query)
  if (opts.page > 1) params.set("page", String(opts.page))
  const qs = params.toString()
  return `${BASE_URL}/en/vacancies/${qs ? "?" + qs : ""}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  // The full UUID (36 chars) is shown, not truncated - a truncated ID looks copyable
  // but is not valid input to `detail`, which needs the complete UUID.
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 18).padEnd(18)
    const date = c.date ? c.date.slice(0, 10) : "—"
    return `${c.id.padEnd(36)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(36) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(24) + " " + "LOCATION".padEnd(18) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    if (!html) {
      writeError("Search page returned no content", "EMPTY_RESPONSE")
      return 1
    }
    let cards = parseSearchResults(html)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map((c) => `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date ? c.date.slice(0, 10) : "—"}\n  id: ${c.id}\n  ${c.url}`)
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(JSON.stringify({ meta: { count: cards.length, page: opts.page }, results: cards }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
