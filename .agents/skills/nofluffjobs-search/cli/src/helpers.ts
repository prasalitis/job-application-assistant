// Data source: No Fluff Jobs public HTML search and detail pages.
// Search returns an HTML page with Angular SSR-rendered job cards; detail returns a single job's HTML.
// We parse both with regex against the server-rendered HTML.

const BASE_URL = "https://nofluffjobs.com";
export const SEARCH_URL = `${BASE_URL}/job`;
export const DETAIL_URL_BASE = `${BASE_URL}/job`;

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n");
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6;
  let delay = 500;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
      }
      const jitter = Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, delay + jitter));
      delay = Math.min(delay * 2, 8000);
      continue;
    }
    if (response.status === 404) return "";
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }
  throw new Error("Request failed after max retries");
}

export interface JobCard {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  date: string | null;
  salary: string | null;
  url: string;
}

export interface JobDetail extends JobCard {
  description: string | null;
  requirements: string | null;
  benefits: string | null;
  employmentType: string | null;
  seniority: string | null;
  category: string | null;
  applyUrl: string | null;
}

/**
 * Decode HTML entities to plain text.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      const cp = parseInt(dec, 10);
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => {
      const cp = parseInt(hex, 16);
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(/&nbsp;/g, " ");
}

/**
 * Strip HTML tags and clean up whitespace.
 */
function clean(html: string | null | undefined): string | null {
  if (!html) return null;
  return decodeHtmlEntities(
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/**
 * Strip HTML tags but preserve paragraph/line breaks.
 */
function cleanWithBreaks(html: string | null | undefined): string | null {
  if (!html) return null;
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|article|section|aside|header)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(
    withBreaks
      .replace(/\s+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

/**
 * Extract the slug from a No Fluff Jobs URL.
 * URLs are like: /job/lead-fullstack-developer-ai-coding-moveli-remote
 * The slug is the path after /job/
 */
export function extractSlugFromUrl(url: string): string | null {
  // Remove leading/trailing slashes and query parameters
  const cleanUrl = url.replace(/^\//, "").replace(/\?.*$/, "");
  const match = cleanUrl.match(/^job\/([^\/]+)/);
  if (match) {
    return match[1];
  }
  // If it's already a slug (no /job/ prefix)
  if (url.startsWith("job/")) {
    return url.slice(4);
  }
  // If it's just a path like /job/slug
  const pathMatch = cleanUrl.match(/\/job\/([^\/]+)/);
  if (pathMatch) {
    return pathMatch[1];
  }
  return null;
}

/**
 * Normalize a job identifier - accept URL, slug, or full path.
 * Returns the slug (path after /job/) which can be used to construct the detail URL.
 */
export function normalizeId(input: string): string | null {
  // If it's already looks like a slug (no slashes, not a full URL)
  if (!input.includes("/") && !input.includes("http")) {
    return input;
  }
  // Try to extract slug from URL
  return extractSlugFromUrl(input);
}

/**
 * Parse job cards from the search results HTML.
 * No Fluff Jobs Angular SSR renders job cards as:
 * <a nfj-postings-item class="posting-list-item" href="/job/...-ID">
 *   <nfj-posting-item-title>
 *     <header>
 *       <h3 class="posting-title__position" data-cy="title position on the job offer listing">TITLE</h3>
 *     </header>
 *   </nfj-posting-item-title>
 *   <nfj-posting-item-salary>
 *     <span data-cy="salary ranges on the job offer listing">SALARY</span>
 *   </nfj-posting-item-salary>
 *   ...
 * </a>
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = [];

  // Split by the job posting anchor tags
  // Each job is in: <a ... nfj-postings-item ... href="...">...</a>
  const postingPattern = /<a\s+[^>]*nfj-postings-item[^>]*href="(\/job\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = postingPattern.exec(html)) !== null) {
    const url = match[1];
    const cardHtml = match[2];

    // Extract slug from URL to use as ID
    // No Fluff Jobs uses slug-based URLs like /job/lead-fullstack-developer-ai-coding-moveli-remote
    const slug = extractSlugFromUrl(url);
    const id = slug || "unknown";
    const fullUrl = BASE_URL + url;

    // Extract title from h3 with class posting-title__position
    let title: string | null = null;
    const titleMatch = cardHtml.match(
      /<h3[^>]*class="[^"]*posting-title__position[^"]*"[^>]*>([\s\S]*?)<\/h3>/i,
    );
    if (titleMatch) {
      title = clean(titleMatch[1]);
    }
    // Alternative: h3 with data-cy
    if (!title) {
      const altTitleMatch = cardHtml.match(
        /<h3[^>]*data-cy="title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i,
      );
      if (altTitleMatch) {
        title = clean(altTitleMatch[1]);
      }
    }
    if (!title) continue;

    // Extract salary
    let salary: string | null = null;
    const salaryMatch = cardHtml.match(
      /<span[^>]*data-cy="salary[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
    );
    if (salaryMatch) {
      salary = clean(salaryMatch[1]);
    }

    // Extract company - look for h4 with class company-name
    let company: string | null = null;
    const companyMatch = cardHtml.match(
      /<h4[^>]*class="[^"]*company-name[^"]*"[^>]*>([\s\S]*?)<\/h4>/i,
    );
    if (companyMatch) {
      company = clean(companyMatch[1]);
    }

    // Extract location - look for nfj-posting-item-city component
    // The location text is after the inline-icon inside this component
    let location: string | null = null;
    const cityMatch = cardHtml.match(
      /<nfj-posting-item-city[^>]*>([\s\S]*?)<\/nfj-posting-item-city>/i,
    );
    if (cityMatch) {
      // Extract text after the inline-icon
      const cityHtml = cityMatch[1];
      const textAfterIcon = cityHtml.match(/<\/inline-icon>([\s\S]*)/i);
      if (textAfterIcon) {
        location = clean(textAfterIcon[1]);
      } else {
        // Fallback: extract all text
        location = clean(cityHtml);
      }
    }
    // Alternative: look for data-cy="location on the job offer listing"
    if (!location) {
      const locMatch = cardHtml.match(
        /<[^>]+data-cy="location[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i,
      );
      if (locMatch) {
        location = clean(locMatch[1]);
      }
    }

    // Extract date - look for NEW or date indicators
    let date: string | null = null;
    if (cardHtml.includes("NEW") || cardHtml.includes("NOWA")) {
      date = "New";
    }
    // Look for date pattern
    const dateMatch = cardHtml.match(/(?:posted|Posted|Opublikowano)\s+(\d+)\s+days?\s+ago/i);
    if (dateMatch) {
      date = `${dateMatch[1]} days ago`;
    }

    results.push({
      id,
      title,
      company,
      location,
      date,
      salary,
      url: fullUrl,
    });
  }

  return results;
}

/**
 * Parse the single-job detail page.
 */
export function parseJobDetail(html: string, id: string): JobDetail {
  // Extract title
  let title: string | null = null;
  const titleMatch = html.match(
    /<h1[^>]*class="[^"]*posting-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
  );
  if (titleMatch) {
    title = clean(titleMatch[1]);
  }
  // Alternative patterns
  if (!title) {
    const altTitleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (altTitleMatch) {
      title = clean(altTitleMatch[1]);
    }
  }

  // Extract company
  let company: string | null = null;
  let companyUrl: string | null = null;
  const companyMatch = html.match(
    /<a[^>]*class="[^"]*posting-company[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
  );
  if (companyMatch) {
    companyUrl = companyMatch[1];
    company = clean(companyMatch[2]);
  }
  // Alternative: look for company name in h2 or similar
  if (!company) {
    const altCompanyMatch = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (altCompanyMatch) {
      company = clean(altCompanyMatch[1]);
    }
  }

  // Extract location
  let location: string | null = null;
  const locMatch = html.match(
    /<span[^>]*data-cy="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  );
  if (locMatch) {
    location = clean(locMatch[1]);
  }
  // Alternative: look for posting-location class
  if (!location) {
    const altLocMatch = html.match(
      /<[^>]+class="[^"]*posting-location[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i,
    );
    if (altLocMatch) {
      location = clean(altLocMatch[1]);
    }
  }

  // Extract salary
  let salary: string | null = null;
  const salaryMatch = html.match(
    /<span[^>]*data-cy="[^"]*salary[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  );
  if (salaryMatch) {
    salary = clean(salaryMatch[1]);
  }
  // Alternative: look for salary patterns in the HTML
  if (!salary) {
    const altSalaryMatch = html.match(
      /(\d{1,3}\s*\d{3}\s*[–-]\s*\d{1,3}\s*\d{3}\s*(?:PLN|EUR|USD|zł))/,
    );
    if (altSalaryMatch) {
      salary = clean(altSalaryMatch[1]);
    }
  }

  // Extract description - look for main content sections
  let description: string | null = null;
  // Try to find the main posting description content - skip script and style tags
  // First, remove script and style tags from the HTML
  const htmlWithoutScripts = html.replace(/<script[^>]*>.*?<\/script>/gsi, "");
  const htmlClean = htmlWithoutScripts.replace(/<style[^>]*>.*?<\/style>/gsi, "");
  
  const descMatch = htmlClean.match(
    /<div[^>]*class="[^"]*posting-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  );
  if (descMatch) {
    description = cleanWithBreaks(descMatch[1]);
  }
  // Alternative: look for content in sections with specific classes
  if (!description) {
    // Look for a large text block that's likely the description
    const contentMatch = htmlClean.match(
      /<div[^>]*class="[^"]*(posting-content|posting-body|description)[^"]*"[^>]*>([\s\S]{500,})<\/div>/i,
    );
    if (contentMatch) {
      description = cleanWithBreaks(contentMatch[1].slice(0, 5000));
    }
  }

  // Extract requirements
  let requirements: string | null = null;
  const reqMatch = html.match(
    /<[^>]+class="[^"]*requirements[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i,
  );
  if (reqMatch) {
    requirements = cleanWithBreaks(reqMatch[0]);
  }
  // Alternative: look for "Must have" or "Requirements" sections
  if (!requirements) {
    const altReqMatch = html.match(
      /<[^>]+(?:Must have|Requirements)[^>]*>([\s\S]*?)<\/[^>]+>/i,
    );
    if (altReqMatch) {
      requirements = cleanWithBreaks(altReqMatch[0]);
    }
  }

  // Extract benefits
  let benefits: string | null = null;
  const benefitsMatch = html.match(
    /<[^>]+class="[^"]*benefits[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i,
  );
  if (benefitsMatch) {
    benefits = cleanWithBreaks(benefitsMatch[0]);
  }
  // Alternative: look for "Benefits" section
  if (!benefits) {
    const altBenefitsMatch = html.match(
      /<[^>]+(?:Benefits|Perks)[^>]*>([\s\S]*?)<\/[^>]+>/i,
    );
    if (altBenefitsMatch) {
      benefits = cleanWithBreaks(altBenefitsMatch[0]);
    }
  }

  // Extract employment type
  let employmentType: string | null = null;
  const empMatch = html.match(
    /(?:Contract type|Employment type|Typ umowy)[:\s]+([^\n<]+)/i,
  );
  if (empMatch) {
    employmentType = clean(empMatch[1]);
  }

  // Extract seniority
  let seniority: string | null = null;
  const senMatch = html.match(
    /(?:Seniority|Doświadczenie|Experience level)[:\s]+([^\n<]+)/i,
  );
  if (senMatch) {
    seniority = clean(senMatch[1]);
  }

  // Extract category
  let category: string | null = null;
  const catMatch = html.match(
    /(?:Category|Kategoria|Specialization)[:\s]+([^\n<]+)/i,
  );
  if (catMatch) {
    category = clean(catMatch[1]);
  }

  // Extract apply URL
  let applyUrl: string | null = null;
  const applyMatch = html.match(/href="([^"]*apply[^"]*)"/i);
  if (applyMatch) {
    applyUrl = applyMatch[1];
    if (!applyUrl.startsWith("http")) {
      applyUrl = BASE_URL + applyUrl;
    }
  }

  // Extract date
  let date: string | null = null;
  const dateMatch = html.match(
    /(?:Offer valid until|Valid until|Ważna do|Posted on|Opublikowano)[:\s]+([\d.\s]+)/i,
  );
  if (dateMatch) {
    date = clean(dateMatch[1]);
  }

  // Construct the URL from the slug
  const url = id.startsWith("http") ? id : `${BASE_URL}/job/${id}`;
  
  return {
    id,
    title: title || "(untitled)",
    company,
    location,
    date,
    salary,
    url,
    description,
    requirements,
    benefits,
    employmentType,
    seniority,
    category,
    applyUrl,
  };
}
