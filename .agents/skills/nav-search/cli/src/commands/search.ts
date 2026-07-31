import { search, writeError, type JobCard } from "../helpers.js"

export interface SearchOpts {
  query?: string
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
    return `${c.id.padEnd(36)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(36) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(26) + " " + "LOCATION".padEnd(20) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

const API_PAGE_SIZE = 25 // fixed by the API - see the note in helpers.ts's search()

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const { cards: allCards, total } = await search({ query: opts.query, from: (opts.page - 1) * API_PAGE_SIZE })
    const cards = opts.limit !== undefined ? allCards.slice(0, opts.limit) : allCards

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
