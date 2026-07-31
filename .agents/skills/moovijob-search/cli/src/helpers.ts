// Data source: moovijob.com (Belgium/Luxembourg job board). Search results pages are
// server-rendered HTML job cards - we parse them with regex (chunked per card, same
// approach as linkedin-search). Detail pages embed a clean, standard schema.org
// JobPosting block in <script type="application/ld+json">, which we parse as JSON
// directly instead of scraping rendered markup - far more reliable.
//
// DEVIATION FROM THE ZERO-DEPENDENCY CONVENTION: like pracuj.pl, moovijob.com sits
// behind Cloudflare, which blocks Bun's native `fetch()` with a bot-challenge (HTTP
// 403) while `curl` with the same headers gets HTTP 200. `htmlFetch` therefore shells
// out to the system `curl` binary via `Bun.spawn`, exactly as pracuj-search does -
// see that skill's `helpers.ts` for the fuller explanation. `curl` ships by default
// on Windows 10+, macOS, and virtually every Linux distribution.

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

const STATUS_MARKER = "\n__HTMLFETCH_STATUS__"

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
      "Accept-Language: en-US,en;q=0.9,fr;q=0.8",
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
      if (attempt === maxRetries) throw new Error(`Request failed: ${status}`)
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (status === 404) return ""
    if (status < 200 || status >= 300) throw new Error(`Request failed: ${status}`)
    return body
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null // relative text as shown on the site, e.g. "1w ago" - no absolute date on search cards
  url: string
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null // ISO, from datePosted
  url: string
  description: string | null
  deadline: string | null // ISO, from validThrough
  employmentType: string | null
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim()
}

function stripTags(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Parse search-result job cards. Each card is anchored by its link to
 * `<subdomain>.moovijob.com/job-offers/<company-slug>/<title-slug>`, which we split
 * on and parse independently so one malformed card cannot break the rest.
 */
export function parseJobCards(html: string, baseUrl: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<a href="https:\/\/[a-z.]*moovijob\.com\/job-offers\//).slice(1)

  for (const chunk of chunks) {
    const pathMatch = chunk.match(/^([a-z0-9-]+\/[a-z0-9-]+)"/)
    if (!pathMatch) continue
    const path = pathMatch[1]

    const idMatch = chunk.match(/data-id="(\d+)"/)
    if (!idMatch) continue
    const id = idMatch[1]

    const titleMatch = chunk.match(/card-job-offer-new-title[^>]*>\s*([^<]+?)\s*<\/p>/)
    if (!titleMatch) continue
    const title = decodeHtmlEntities(titleMatch[1])

    const companyMatch = chunk.match(/company-name">\s*<small>\s*([^<]+?)\s*<\/small>/)
    const company = companyMatch ? decodeHtmlEntities(companyMatch[1]) || null : null

    const locationMatch = chunk.match(/badge text-white bg-primary-500[^>]*>\s*([^<]+?)\s*<\/small>/)
    const location = locationMatch ? decodeHtmlEntities(locationMatch[1]) || null : null

    const dateMatch = chunk.match(/published_ago[^>]*>\s*<small>\s*([^<]+?)\s*<\/small>/)
    const date = dateMatch ? decodeHtmlEntities(dateMatch[1]) : null

    results.push({ id, title, company, location, date, url: `${baseUrl}/job-offers/${path}` })
  }

  return results
}

interface JsonLdJobPosting {
  title?: string
  datePosted?: string
  validThrough?: string
  employmentType?: string[]
  description?: string
  jobLocation?: { address?: { addressLocality?: string; addressCountry?: string } }
  hiringOrganization?: { name?: string }
}

/** Parse the detail page's schema.org JobPosting JSON-LD block. */
export function parseJobDetail(html: string, id: string, url: string): JobDetail | null {
  const m = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
  if (!m) return null
  let data: JsonLdJobPosting
  try {
    data = JSON.parse(m[1])
  } catch {
    return null
  }

  const locality = data.jobLocation?.address?.addressLocality
  const country = data.jobLocation?.address?.addressCountry
  const location = locality ? (country ? `${locality}, ${country}` : locality) : null

  return {
    id,
    title: data.title ?? "(untitled)",
    company: data.hiringOrganization?.name ?? null,
    location,
    date: data.datePosted ?? null,
    url,
    description: data.description ? stripTags(decodeHtmlEntities(data.description)) : null,
    deadline: data.validThrough ?? null,
    employmentType: data.employmentType?.join(", ") ?? null,
  }
}
