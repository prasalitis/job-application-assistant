// Data source: jobs.ch (Switzerland). Both the search-results page and individual
// detail pages embed clean, standard schema.org structured data in
// <script type="application/ld+json"> tags - a search page embeds a full
// `ItemList` of `JobPosting` objects (one per visible result), and a detail page
// embeds one full `JobPosting` object with the complete description. We parse this
// JSON directly rather than scraping rendered HTML - no regex card-splitting needed.
//
// PERSONAL USE ONLY - see SKILL.md. jobs.ch's robots.txt explicitly disallows the
// individual job-detail page pattern (`/en/vacancies/detail/*/*/*` and the /de/, /fr/
// equivalents) while leaving search/listing pages unrestricted. This skill's `detail`
// command fetches those disallowed pages anyway, on the same personal-use judgment
// call this repo already makes for `linkedin-search` and LinkedIn's Terms of Service:
// a real job-seeker looking up a handful of postings for their own application, not a
// competitor bulk-scraping the site. Keep volume low.
//
// Unlike pracuj.pl and moovijob.com, jobs.ch does NOT block Bun's native `fetch()` -
// confirmed live, no Cloudflare challenge encountered - so this skill has zero
// runtime dependencies (no `curl` shell-out needed).

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,de;q=0.8,fr;q=0.7",
      },
      redirect: "follow",
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    return response.text()
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

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  description: string | null
  employmentType: string | null
  applyUrl: string | null
}

function stripTags(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function formatLocation(address: { addressLocality?: string; addressRegion?: string; addressCountry?: string } | undefined): string | null {
  if (!address) return null
  const parts = [address.addressLocality, address.addressRegion].filter(Boolean)
  const place = parts.length > 0 ? parts[0] : null
  if (place && address.addressCountry) return `${place}, ${address.addressCountry}`
  return place ?? address.addressCountry ?? null
}

interface JsonLdJobPostingLite {
  title?: string
  datePosted?: string
  hiringOrganization?: { name?: string }
  jobLocation?: { address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } }
  identifier?: { value?: string }
  url?: string
}

/** Parse the search-results page's `ItemList` of `JobPosting` objects. */
export function parseSearchResults(html: string): JobCard[] {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
  for (const s of scripts) {
    let data: unknown
    try {
      data = JSON.parse(s[1])
    } catch {
      continue
    }
    if (!Array.isArray(data)) continue
    const itemList = data.find((x): x is { itemListElement?: Array<{ item?: JsonLdJobPostingLite }> } => (x as any)?.["@type"] === "ItemList")
    if (!itemList?.itemListElement) continue

    const cards: JobCard[] = []
    for (const entry of itemList.itemListElement) {
      const item = entry.item
      if (!item?.identifier?.value || !item.url) continue
      cards.push({
        id: item.identifier.value,
        title: item.title ?? "(untitled)",
        company: item.hiringOrganization?.name ?? null,
        location: formatLocation(item.jobLocation?.address),
        date: item.datePosted ?? null,
        url: item.url,
      })
    }
    return cards
  }
  return []
}

interface JsonLdJobPostingFull extends JsonLdJobPostingLite {
  description?: string
  employmentType?: string
  potentialAction?: { target?: { urlTemplate?: string } }
}

/** Parse the detail page's single `JobPosting` JSON-LD block. */
export function parseJobDetail(html: string): JobDetail | null {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
  for (const s of scripts) {
    let data: unknown
    try {
      data = JSON.parse(s[1])
    } catch {
      continue
    }
    if ((data as any)?.["@type"] !== "JobPosting") continue
    const jp = data as JsonLdJobPostingFull
    if (!jp.identifier?.value) continue

    return {
      id: jp.identifier.value,
      title: jp.title ?? "(untitled)",
      company: jp.hiringOrganization?.name ?? null,
      location: formatLocation(jp.jobLocation?.address),
      date: jp.datePosted ?? null,
      url: jp.url ?? "",
      description: jp.description ? stripTags(jp.description) : null,
      employmentType: jp.employmentType ?? null,
      applyUrl: jp.potentialAction?.target?.urlTemplate ?? null,
    }
  }
  return null
}
