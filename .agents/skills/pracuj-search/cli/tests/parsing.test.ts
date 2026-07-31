import { describe, test, expect } from "bun:test";
import { extractNextData, parseSearchResults, parseJobDetail, daysSince } from "../src/helpers";

function nextDataHtml(pageProps: unknown): string {
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps } })}</script></body></html>`;
}

function searchPageProps(groupedOffers: unknown[], offersTotalCount: number) {
  return {
    dehydratedState: {
      queries: [
        { queryKey: ["jobOffers", {}], state: { data: { groupedOffers, offersTotalCount } } },
      ],
    },
  };
}

function detailPageProps(attributes: Record<string, unknown>, textSections: unknown[], publicationDetails: Record<string, unknown>) {
  return {
    dehydratedState: {
      queries: [
        { queryKey: ["jobOffer", "123"], state: { data: { attributes, textSections, publicationDetails } } },
      ],
    },
  };
}

describe("extractNextData", () => {
  test("parses a well-formed __NEXT_DATA__ script tag", () => {
    const html = nextDataHtml({ foo: "bar" });
    const data = extractNextData(html) as any;
    expect(data.props.pageProps.foo).toBe("bar");
  });

  test("returns null when the script tag is missing", () => {
    expect(extractNextData("<html><body>no data here</body></html>")).toBeNull();
  });

  test("returns null on malformed JSON inside the script tag", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{not valid json</script>`;
    expect(extractNextData(html)).toBeNull();
  });
});

describe("parseSearchResults", () => {
  test("flattens one group with a single offer into one card", () => {
    const props = searchPageProps(
      [
        {
          jobTitle: "Example Role",
          companyName: "Example Sp. z o.o.",
          lastPublicated: "2026-07-20T09:00:00Z",
          offers: [{ partitionId: 111, displayWorkplace: "Wrocław", offerAbsoluteUri: "https://www.pracuj.pl/praca/x,oferta,111" }],
        },
      ],
      1,
    );
    const html = nextDataHtml(props);
    const nextData = extractNextData(html);
    const { cards, totalCount } = parseSearchResults(nextData);
    expect(totalCount).toBe(1);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({
      id: "111",
      title: "Example Role",
      company: "Example Sp. z o.o.",
      location: "Wrocław",
      date: "2026-07-20T09:00:00Z",
      url: "https://www.pracuj.pl/praca/x,oferta,111",
    });
  });

  test("flattens one group with multiple location offers into multiple cards", () => {
    const props = searchPageProps(
      [
        {
          jobTitle: "Multi-City Role",
          companyName: "Multi Corp",
          lastPublicated: "2026-07-20T09:00:00Z",
          offers: [
            { partitionId: 1, displayWorkplace: "Warszawa", offerAbsoluteUri: "https://www.pracuj.pl/praca/x,oferta,1" },
            { partitionId: 2, displayWorkplace: "Kraków", offerAbsoluteUri: "https://www.pracuj.pl/praca/x,oferta,2" },
          ],
        },
      ],
      1,
    );
    const { cards } = parseSearchResults(extractNextData(nextDataHtml(props)));
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.location)).toEqual(["Warszawa", "Kraków"]);
  });

  test("returns an empty result set when the jobOffers query is missing", () => {
    const html = nextDataHtml({ dehydratedState: { queries: [] } });
    const { cards, totalCount } = parseSearchResults(extractNextData(html));
    expect(cards).toEqual([]);
    expect(totalCount).toBe(0);
  });

  test("skips a group with no offers rather than emitting a card with no location", () => {
    const props = searchPageProps(
      [{ jobTitle: "Orphan Group", companyName: "Nobody", lastPublicated: null, offers: [] }],
      1,
    );
    const { cards } = parseSearchResults(extractNextData(nextDataHtml(props)));
    expect(cards).toHaveLength(0);
  });
});

describe("parseJobDetail", () => {
  test("joins non-empty textSections into the description, in order", () => {
    const props = detailPageProps(
      { jobTitle: "Detail Role", displayEmployerName: "Detail Co", offerAbsoluteUrl: "https://www.pracuj.pl/praca/x,oferta,123", applying: { applyUrl: "https://www.pracuj.pl/aplikuj/x" } },
      [
        { sectionType: "about-project", plainText: "About the project text." },
        { sectionType: "empty-section", plainText: "" },
        { sectionType: "responsibilities", plainText: "Your responsibilities text." },
      ],
      { dateOfInitialPublicationUtc: "2026-07-01T00:00:00Z", expirationDateUtc: "2026-08-01T00:00:00Z" },
    );
    const job = parseJobDetail(extractNextData(nextDataHtml(props)), "123")!;
    expect(job.description).toBe("About the project text.\n\nYour responsibilities text.");
    expect(job.deadline).toBe("2026-08-01T00:00:00Z");
    expect(job.applyUrl).toBe("https://www.pracuj.pl/aplikuj/x");
  });

  test("falls back to attributes.description when textSections is empty", () => {
    const props = detailPageProps(
      { jobTitle: "Fallback Role", description: "Short fallback description." },
      [],
      {},
    );
    const job = parseJobDetail(extractNextData(nextDataHtml(props)), "999")!;
    expect(job.description).toBe("Short fallback description.");
  });

  test("returns null when the jobOffer query is missing", () => {
    const html = nextDataHtml({ dehydratedState: { queries: [] } });
    expect(parseJobDetail(extractNextData(html), "1")).toBeNull();
  });
});

describe("daysSince", () => {
  test("returns null for an unparseable date", () => {
    expect(daysSince("not-a-date")).toBeNull();
  });

  test("computes a positive day count for a past date", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
    const age = daysSince(tenDaysAgo)!;
    expect(age).toBeGreaterThan(9.9);
    expect(age).toBeLessThan(10.1);
  });
});
