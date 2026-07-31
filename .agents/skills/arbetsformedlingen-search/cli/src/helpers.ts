// Data source: the official "JobTech Dev" open-data API backing arbetsformedlingen.se
// (Sweden's Public Employment Service / "Platsbanken") - jobsearch.api.jobtechdev.se.
// This is a real, documented, government-run public REST API (OpenAPI spec at
// https://jobsearch.api.jobtechdev.se/swagger.json), not a scraped site - no HTML
// parsing, no ToS ambiguity, no bot-detection to work around. The search response
// already embeds the full job description, so a plain search often needs no
// follow-up `detail` call at all.

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const API_BASE = "https://jobsearch.api.jobtechdev.se"

async function apiFetch(path: string): Promise<unknown> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(`${API_BASE}${path}`, { headers: { Accept: "application/json" } })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    return response.json()
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
  employmentType: string | null
  applyUrl: string | null
}

interface TaxonomyLabel {
  label?: string
}

interface ApiHit {
  id: string
  headline?: string
  webpage_url?: string
  employer?: { name?: string }
  workplace_address?: { municipality?: string; region?: string }
  publication_date?: string
  application_deadline?: string
  employment_type?: TaxonomyLabel
  description?: { text?: string }
  application_details?: { url?: string; email?: string }
}

export function formatLocation(addr: ApiHit["workplace_address"]): string | null {
  if (!addr) return null
  if (addr.municipality && addr.region && addr.municipality !== addr.region) return `${addr.municipality}, ${addr.region}`
  return addr.municipality ?? addr.region ?? null
}

/** Pure mapping from a raw API hit object to a JobCard - no network I/O, unit-testable. */
export function toCard(hit: ApiHit): JobCard {
  return {
    id: hit.id,
    title: hit.headline ?? "(untitled)",
    company: hit.employer?.name ?? null,
    location: formatLocation(hit.workplace_address),
    date: hit.publication_date ?? null,
    url: hit.webpage_url ?? `https://arbetsformedlingen.se/platsbanken/annonser/${hit.id}`,
  }
}

/** Pure mapping from a raw /ad/{id} API response to a JobDetail - no network I/O. */
export function toDetail(hit: ApiHit): JobDetail {
  return {
    ...toCard(hit),
    description: hit.description?.text ?? null,
    deadline: hit.application_deadline ?? null,
    employmentType: hit.employment_type?.label ?? null,
    applyUrl: hit.application_details?.url ?? null,
  }
}

export interface SearchParams {
  query?: string
  publishedAfter?: string // YYYY-MM-DD, maps to published-after
  remote?: boolean
  offset: number
  limit: number
}

/** Query the /search endpoint. Returns the parsed cards and the API's reported total. */
export async function search(params: SearchParams): Promise<{ cards: JobCard[]; total: number }> {
  const qs = new URLSearchParams()
  if (params.query) qs.set("q", params.query)
  if (params.publishedAfter) qs.set("published-after", params.publishedAfter)
  if (params.remote !== undefined) qs.set("remote", String(params.remote))
  qs.set("offset", String(params.offset))
  qs.set("limit", String(params.limit))

  const data = (await apiFetch(`/search?${qs.toString()}`)) as { hits?: ApiHit[]; total?: { value?: number } } | null
  if (!data) return { cards: [], total: 0 }
  return { cards: (data.hits ?? []).map(toCard), total: data.total?.value ?? 0 }
}

/** Query the /ad/{id} endpoint for the full detail of a single posting. */
export async function detail(id: string): Promise<JobDetail | null> {
  const hit = (await apiFetch(`/ad/${encodeURIComponent(id)}`)) as ApiHit | null
  if (!hit) return null
  return toDetail(hit)
}
