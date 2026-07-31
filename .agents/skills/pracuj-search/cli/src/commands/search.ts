import {
  htmlFetch,
  extractNextData,
  parseSearchResults,
  daysSince,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage?: number // filtered client-side from each card's posting date
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts): string {
  let path = "/praca"
  if (opts.query) path += `/${encodeURIComponent(opts.query)};kw`
  if (opts.location) path += `/${encodeURIComponent(opts.location)};wp`
  const params = new URLSearchParams()
  if (opts.page > 1) params.set("pn", String(opts.page))
  const qs = params.toString()
  return `https://www.pracuj.pl${path}${qs ? "?" + qs : ""}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 24).padEnd(24)
    const date = c.date ? c.date.slice(0, 10) : "—"
    return `${c.id.padEnd(11)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(11) +
    " " +
    "TITLE".padEnd(42) +
    " " +
    "COMPANY".padEnd(26) +
    " " +
    "LOCATION".padEnd(24) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    if (!html) {
      writeError("Search page returned no content", "EMPTY_RESPONSE")
      return 1
    }
    const nextData = extractNextData(html)
    if (!nextData) {
      writeError("Could not find __NEXT_DATA__ in the response - the page markup may have changed", "PARSE_FAILED")
      return 1
    }
    const { cards: allCards, totalCount } = parseSearchResults(nextData)

    let cards = allCards
    if (opts.jobage !== undefined) {
      cards = cards.filter((c) => {
        if (!c.date) return true // keep undated results rather than silently dropping them
        const age = daysSince(c.date)
        return age === null || age <= opts.jobage!
      })
    }
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date ? c.date.slice(0, 10) : "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, page: opts.page, totalCount }, results: cards },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
