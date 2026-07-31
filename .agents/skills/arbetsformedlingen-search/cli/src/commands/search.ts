import { search, writeError, type JobCard } from "../helpers.js"

export interface SearchOpts {
  query?: string
  jobage?: number // converted to a published-after date
  remote?: boolean
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 20).padEnd(20)
    const date = c.date ? c.date.slice(0, 10) : "—"
    return `${c.id.padEnd(10)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(10) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(26) + " " + "LOCATION".padEnd(20) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const pageSize = opts.limit ?? 20
    let publishedAfter: string | undefined
    if (opts.jobage !== undefined) {
      const d = new Date(Date.now() - opts.jobage * 86400000)
      publishedAfter = d.toISOString().slice(0, 10)
    }

    const { cards, total } = await search({
      query: opts.query,
      publishedAfter,
      remote: opts.remote,
      offset: (opts.page - 1) * pageSize,
      limit: pageSize,
    })

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map((c) => `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date ? c.date.slice(0, 10) : "—"}\n  id: ${c.id}\n  ${c.url}`)
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(JSON.stringify({ meta: { count: cards.length, page: opts.page, totalCount: total }, results: cards }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
