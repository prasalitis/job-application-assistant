import {
  SEARCH_URL,
  htmlFetch,
  parseJobCards,
  writeError,
  type JobCard,
} from "../helpers.js";

export interface SearchOpts {
  query?: string;
  location?: string;
  page: number;
  limit?: number;
  format: "json" | "table" | "plain";
}

function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams();
  if (opts.query) {
    params.set("criteria", opts.query);
  }
  // Note: No Fluff Jobs doesn't have a direct location parameter in the search
  // Location filtering happens on the results page via filters, or we can
  // include it in the query
  if (opts.location) {
    // If query exists, append location to it
    if (opts.query) {
      params.set("criteria", `${opts.query} ${opts.location}`);
    } else {
      params.set("criteria", opts.location);
    }
  }
  // Page parameter - No Fluff Jobs uses lazy loading, so page might not work
  // For now, we'll just use the query parameter
  const url = `${SEARCH_URL}?${params.toString()}`;
  return url;
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results.";
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40);
    const company = (c.company || "—").slice(0, 25).padEnd(25);
    const loc = (c.location || "—").slice(0, 20).padEnd(20);
    const salary = (c.salary || "—").slice(0, 15).padEnd(15);
    return `${c.id.padEnd(10)} ${title} ${company} ${loc} ${salary}`;
  });
  const header =
    "ID".padEnd(10) +
    " " +
    "TITLE".padEnd(40) +
    " " +
    "COMPANY".padEnd(25) +
    " " +
    "LOCATION".padEnd(20) +
    " SALARY";
  return [header, "-".repeat(header.length), ...rows].join("\n");
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const url = buildUrl(opts);
    const html = await htmlFetch(url);
    let cards = parseJobCards(html);

    // Filter by location if provided (client-side filtering)
    if (opts.location) {
      const locLower = opts.location.toLowerCase();
      cards = cards.filter(
        (c) =>
          c.location?.toLowerCase().includes(locLower) ||
          c.title?.toLowerCase().includes(locLower) ||
          c.company?.toLowerCase().includes(locLower),
      );
    }

    if (opts.limit !== undefined && opts.limit >= 0) {
      cards = cards.slice(0, opts.limit);
    }

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n");
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.salary || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      );
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, page: opts.page }, results: cards },
          null,
          2,
        ) + "\n",
      );
    }
    return 0;
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED");
    return 1;
  }
}
