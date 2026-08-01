// Data source: the Bundesagentur für Arbeit (German Federal Employment Agency)
// "Jobsuche" REST API - rest.arbeitsagentur.de/jobboerse/jobsuche-service. Search
// hits a real JSON API using the well-known public `X-API-Key: jobboerse-jobsuche`
// header (this is the same key the arbeitsagentur.de website itself uses for its
// public job search - not a secret, widely documented in community projects using
// this API). The search response does NOT include a full description or a
// detail-lookup endpoint that works reliably, so `detail` instead fetches the public
// job-detail webpage and parses the embedded Angular "ng-state" JSON blob (the
// server-side-rendered state Angular Universal transfers to the client for
// hydration) - same idea as pracuj.pl's Next.js `__NEXT_DATA__`, just Angular's
// equivalent mechanism.
//
// No Cloudflare or bot-detection encountered on either the API host or the
// webpage host - Bun's native `fetch()` works fine, zero runtime dependencies.

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const API_BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4"
const API_KEY = "jobboerse-jobsuche"
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

async function fetchWithBackoff(url: string, headers: Record<string, string>): Promise<Response | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
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
  fullTime: boolean | null
}

interface ApiJob {
  refnr: string
  titel?: string
  arbeitgeber?: string
  arbeitsort?: { ort?: string; region?: string; land?: string }
  aktuelleVeroeffentlichungsdatum?: string
}

function detailUrl(refnr: string): string {
  return `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`
}

function formatLocation(ort: ApiJob["arbeitsort"]): string | null {
  if (!ort) return null
  if (ort.ort && ort.region) return `${ort.ort}, ${ort.region}`
  return ort.ort ?? ort.region ?? null
}

export function toCard(job: ApiJob): JobCard {
  return {
    id: job.refnr,
    title: job.titel ?? "(untitled)",
    company: job.arbeitgeber ?? null,
    location: formatLocation(job.arbeitsort),
    date: job.aktuelleVeroeffentlichungsdatum ?? null,
    url: detailUrl(job.refnr),
  }
}

export interface SearchParams {
  query?: string
  page: number
  size: number
}

/** Query the /jobs search endpoint. Returns the parsed cards and the API's reported total. */
export async function search(params: SearchParams): Promise<{ cards: JobCard[]; total: number }> {
  const qs = new URLSearchParams()
  if (params.query) qs.set("was", params.query)
  qs.set("page", String(params.page))
  qs.set("size", String(params.size))

  const res = await fetchWithBackoff(`${API_BASE}/jobs?${qs.toString()}`, { "X-API-Key": API_KEY })
  if (!res) return { cards: [], total: 0 }
  const data = (await res.json()) as { stellenangebote?: ApiJob[]; maxErgebnisse?: number }
  return { cards: (data.stellenangebote ?? []).map(toCard), total: data.maxErgebnisse ?? 0 }
}

interface NgStateJobDetail {
  stellenangebotsTitel?: string
  stellenangebotsBeschreibung?: string
  firma?: string
  arbeitszeitVollzeit?: boolean
  datumErsteVeroeffentlichung?: string
  referenznummer?: string
  stellenlokationen?: Array<{ adresse?: { ort?: string; region?: string } }>
}

/** Extract and parse the Angular "ng-state" JSON blob embedded in a job-detail page. */
export function extractNgState(html: string): unknown | null {
  const m = html.match(/<script id="ng-state"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

/** Map the ng-state blob's `jobdetail` object to a JobDetail. */
export function toDetail(ngState: unknown, refnr: string): JobDetail | null {
  const jd = (ngState as { jobdetail?: NgStateJobDetail } | null)?.jobdetail
  if (!jd) return null
  const loc = jd.stellenlokationen?.[0]?.adresse
  return {
    id: jd.referenznummer ?? refnr,
    title: jd.stellenangebotsTitel ?? "(untitled)",
    company: jd.firma ?? null,
    location: loc ? formatLocation({ ort: loc.ort, region: loc.region }) : null,
    date: jd.datumErsteVeroeffentlichung ?? null,
    url: detailUrl(jd.referenznummer ?? refnr),
    description: jd.stellenangebotsBeschreibung ?? null,
    fullTime: jd.arbeitszeitVollzeit ?? null,
  }
}

/** Fetch a job-detail page's HTML with a realistic browser UA. */
export async function fetchDetailPage(refnr: string): Promise<string | null> {
  const res = await fetchWithBackoff(detailUrl(refnr), { "User-Agent": UA, Accept: "text/html" })
  if (!res) return null
  return res.text()
}
