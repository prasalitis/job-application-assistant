// Data source: pracuj.pl's search and offer pages are server-rendered Next.js pages
// that embed their React-Query cache as JSON in a <script id="__NEXT_DATA__"> tag.
// We fetch the page and parse that JSON directly rather than scraping rendered HTML
// markup - it's the exact data the frontend itself reads, already structured, and far
// more stable across markup/CSS changes than class-name scraping.
//
// DEVIATION FROM THE ZERO-DEPENDENCY CONVENTION: pracuj.pl sits behind Cloudflare,
// which fingerprints and blocks Bun's native `fetch()` with a "Just a moment..." bot
// challenge (HTTP 403) - confirmed live: identical URL, identical headers, same
// moment, same IP; `curl` gets HTTP 200 and Bun's `fetch()` gets 403. This is a
// TLS/HTTP-client fingerprint check, not a User-Agent header check, so no amount of
// header tuning on `fetch()` fixes it. `htmlFetch` therefore shells out to the
// system `curl` binary via `Bun.spawn` instead of using `fetch()` directly. `curl`
// ships by default on Windows 10+, macOS, and virtually every Linux distribution,
// so this does not meaningfully weaken the "runs with just `bun`" promise in
// practice, but it is a real dependency - document it if this pattern is reused.

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

const STATUS_MARKER = "\n__HTMLFETCH_STATUS__"

/** Run one curl request, returning its HTTP status and response body. */
async function curlOnce(url: string): Promise<{ status: number; body: string }> {
  const proc = Bun.spawn(
    [
      "curl",
      "-s",
      "-w",
      `${STATUS_MARKER}%{http_code}`,
      "-A",
      UA,
      "-H",
      "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "-H",
      "Accept-Language: pl-PL,pl;q=0.9,en;q=0.8",
      "-L",
      url,
    ],
    { stdout: "pipe", stderr: "pipe" },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(`curl failed (exit ${exitCode}): ${stderr.trim() || "no stderr output"}`)
  }
  const idx = stdout.lastIndexOf(STATUS_MARKER)
  if (idx === -1) throw new Error("curl output missing the expected status marker")
  return { status: parseInt(stdout.slice(idx + STATUS_MARKER.length), 10), body: stdout.slice(0, idx) }
}

/** Fetch HTML via curl with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { status, body } = await curlOnce(url)
    if (status === 429 || status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${status}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (status === 404) return ""
    if (status < 200 || status >= 300) {
      throw new Error(`Request failed: ${status}`)
    }
    return body
  }
  throw new Error("Request failed after max retries")
}

/** Extract and parse the __NEXT_DATA__ JSON blob embedded in a pracuj.pl page. */
export function extractNextData(html: string): unknown | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  description: string | null
  deadline: string | null
  applyUrl: string | null
}

interface ReactQueryEntry {
  queryKey?: unknown[]
  state?: { data?: unknown }
}

function findQuery(nextData: unknown, key: string): unknown {
  const pageProps = (nextData as any)?.props?.pageProps
  const queries: ReactQueryEntry[] = pageProps?.dehydratedState?.queries ?? []
  const match = queries.find((q) => Array.isArray(q.queryKey) && q.queryKey[0] === key)
  return match?.state?.data
}

/**
 * Flatten pracuj.pl's grouped-offers search response into flat job cards.
 * A single posting ("group") can list multiple concrete offers - one per office/city
 * variant of the same role - so we emit one card per (group, offer) pair.
 */
export function parseSearchResults(nextData: unknown): { cards: JobCard[]; totalCount: number } {
  const data = findQuery(nextData, "jobOffers") as
    | { groupedOffers?: any[]; offersTotalCount?: number }
    | undefined
  if (!data) return { cards: [], totalCount: 0 }

  const cards: JobCard[] = []
  for (const group of data.groupedOffers ?? []) {
    const offers = group.offers ?? []
    if (offers.length === 0) continue
    for (const offer of offers) {
      cards.push({
        id: String(offer.partitionId),
        title: group.jobTitle ?? "(untitled)",
        company: group.companyName ?? null,
        location: offer.displayWorkplace ?? null,
        date: group.lastPublicated ?? null,
        url: offer.offerAbsoluteUri,
      })
    }
  }
  return { cards, totalCount: data.offersTotalCount ?? cards.length }
}

/** Parse the single-offer detail response. */
export function parseJobDetail(nextData: unknown, id: string): JobDetail | null {
  const data = findQuery(nextData, "jobOffer") as
    | {
        attributes?: Record<string, any>
        textSections?: Array<{ plainText?: string }>
        publicationDetails?: Record<string, any>
      }
    | undefined
  if (!data) return null

  const attrs = data.attributes ?? {}
  const sections = data.textSections ?? []
  const description =
    sections
      .map((s) => s.plainText)
      .filter((t): t is string => !!t && t.trim().length > 0)
      .join("\n\n") || attrs.description || null

  return {
    id,
    title: attrs.jobTitle ?? "(untitled)",
    company: attrs.displayEmployerName ?? null,
    location: null, // not present on the detail response - carry over from search if needed
    date: data.publicationDetails?.dateOfInitialPublicationUtc ?? null,
    url: attrs.offerAbsoluteUrl ?? `https://www.pracuj.pl/praca/oferta,oferta,${id}`,
    description,
    deadline: data.publicationDetails?.expirationDateUtc ?? null,
    applyUrl: attrs.applying?.applyUrl ?? null,
  }
}

/** Days between an ISO date string and now (fractional, always >= 0 for past dates). */
export function daysSince(isoDate: string): number | null {
  const t = Date.parse(isoDate)
  if (isNaN(t)) return null
  return (Date.now() - t) / 86400000
}
