// Data source: NAV's "Arbeidsplassen" (Norway's Public Employment Service job board)
// public Elasticsearch-backed search API - arbeidsplassen.nav.no/stillinger/api/search.
// No authentication required, real JSON, no scraping needed for search.
//
// The detail page has no classic `__NEXT_DATA__` or ld+json block - it's a Next.js
// App Router page using React Server Components, which stream their data as
// JS-string-escaped chunks via `self.__next_f.push([1, "..."])` calls rather than one
// upfront JSON blob. Investigation confirmed this is still reliably parseable: once
// all pushed strings are unescaped and concatenated, the combined stream contains
// React "Flight" wire-format text chunks shaped `<chunkId>:T<hexLength>,<content>`,
// where `<content>` is exactly `hexLength` (hex-encoded) bytes long. The job
// description and company blurb both show up as such chunks, each starting with an
// HTML tag (e.g. `<h2>Om stillingen</h2><p>...`). This is more fragile than a plain
// `__NEXT_DATA__`/JSON-LD block (it depends on Next.js's internal Flight protocol,
// which could change between Next.js versions) - if this skill stops returning
// descriptions, re-investigate with a fresh page fetch before assuming the API split
// is broken.

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

async function fetchWithBackoff(url: string, headers: Record<string, string>): Promise<Response | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, { headers })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    return response
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  deadline: string | null
}

function detailUrl(uuid: string): string {
  return `https://arbeidsplassen.nav.no/stillinger/stilling/${uuid}`
}

interface EsHitSource {
  title?: string
  businessName?: string
  employer?: { name?: string }
  locationList?: Array<{ city?: string; municipal?: string; county?: string }>
  published?: string
  expires?: string
}

function formatLocation(locations: EsHitSource["locationList"]): string | null {
  if (!locations || locations.length === 0) return null
  const first = locations[0]
  const place = first.city ?? first.municipal
  if (!place) return null
  return locations.length > 1 ? `${place} (+${locations.length - 1} more)` : place
}

/** Pure mapping from a raw Elasticsearch hit's `_source` to a JobCard - unit-testable. */
export function toCard(uuid: string, source: EsHitSource): JobCard {
  return {
    id: uuid,
    title: source.title ?? "(untitled)",
    company: source.businessName ?? source.employer?.name ?? null,
    location: formatLocation(source.locationList),
    date: source.published ?? null,
    url: detailUrl(uuid),
  }
}

export interface SearchParams {
  query?: string
  from: number
}

/**
 * Query the Elasticsearch-backed /search endpoint.
 *
 * NOTE: a `size` query parameter is accepted but silently ignored by this API -
 * confirmed live, `size=5` still returns 25 hits. Page size is a fixed 25; use
 * `from` for pagination and apply any `--limit` cap client-side (the command layer
 * does this, consistent with the "cap results emitted (client-side)" contract every
 * other portal skill in this repo already follows for --limit).
 */
export async function search(params: SearchParams): Promise<{ cards: JobCard[]; total: number }> {
  const qs = new URLSearchParams()
  if (params.query) qs.set("q", params.query)
  qs.set("from", String(params.from))

  const res = await fetchWithBackoff(`https://arbeidsplassen.nav.no/stillinger/api/search?${qs.toString()}`, { Accept: "application/json" })
  if (!res) return { cards: [], total: 0 }
  const data = (await res.json()) as { hits?: { total?: { value?: number }; hits?: Array<{ _id: string; _source: EsHitSource }> } }
  const hits = data.hits?.hits ?? []
  return { cards: hits.map((h) => toCard(h._id, h._source)), total: data.hits?.total?.value ?? 0 }
}

function stripTags(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Decode and concatenate every `self.__next_f.push([1, "..."])` string from the page,
 * unescaping the JS string literal content. Pure function - unit-testable on a
 * synthetic HTML fixture.
 */
export function decodeNextFlightStream(html: string): string {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g
  let combined = ""
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      combined += JSON.parse(`"${m[1]}"`)
    } catch {
      // skip a chunk that doesn't decode cleanly rather than aborting the whole page
    }
  }
  return combined
}

/**
 * Extract every React Flight text-type chunk (`<id>:T<hexLength>,<content>`) whose
 * content looks like an HTML fragment (starts with a tag), strip tags, and join them
 * - this is the job description plus any company blurb section on the page.
 */
export function extractHtmlTextChunks(flightStream: string): string[] {
  const chunkRe = /\w+:T([0-9a-f]+),/g
  const results: string[] = []
  let m: RegExpExecArray | null
  while ((m = chunkRe.exec(flightStream)) !== null) {
    const len = parseInt(m[1], 16)
    const start = m.index + m[0].length
    const content = flightStream.slice(start, start + len)
    if (content.startsWith("<")) results.push(content)
  }
  return results
}

/** Fetch a job-detail page and extract title/deadline plus the parsed description. */
export function parseDetailPage(html: string, uuid: string): JobDetail | null {
  const titleMatch = html.match(/<title>([^<]*?)(?:\s*-\s*arbeidsplassen\.no)?<\/title>/)
  if (!titleMatch) return null

  const flightStream = decodeNextFlightStream(html)
  const htmlChunks = extractHtmlTextChunks(flightStream)
  const description = htmlChunks.length > 0 ? htmlChunks.map(stripTags).join("\n\n") : null

  return {
    id: uuid,
    title: titleMatch[1].trim(),
    company: null, // not reliably present in the visible <title>/meta tags alone
    location: null,
    date: null,
    url: detailUrl(uuid),
    description,
    deadline: null,
  }
}

export async function fetchDetailPage(uuid: string): Promise<string | null> {
  const res = await fetchWithBackoff(detailUrl(uuid), { "User-Agent": UA, Accept: "text/html" })
  if (!res) return null
  return res.text()
}
