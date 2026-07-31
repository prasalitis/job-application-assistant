import { describe, test, expect } from "bun:test";
import { parseSearchResults, parseJobDetail } from "../src/helpers";

function searchPageHtml(items: unknown[]): string {
  const ldJson = [
    { "@type": "WebSite" },
    { "@type": "ItemList", itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, item })) },
  ];
  return `<html><head><script type="application/ld+json">${JSON.stringify(ldJson)}</script></head></html>`;
}

function jobPosting(overrides: Record<string, unknown> = {}) {
  return {
    "@type": "JobPosting",
    title: "IT Governance Manager",
    identifier: { "@type": "PropertyValue", value: "bb061be9-0583-489d-928c-fb0c3b5f63d2" },
    datePosted: "2026-07-22T10:33:43+02:00",
    hiringOrganization: { name: "Acme AG" },
    jobLocation: { address: { addressLocality: "Zurich", addressCountry: "CH" } },
    url: "https://www.jobs.ch/en/vacancies/detail/bb061be9-0583-489d-928c-fb0c3b5f63d2/",
    ...overrides,
  };
}

describe("parseSearchResults", () => {
  test("extracts all fields from a well-formed ItemList", () => {
    const html = searchPageHtml([jobPosting()]);
    const [c] = parseSearchResults(html);
    expect(c).toEqual({
      id: "bb061be9-0583-489d-928c-fb0c3b5f63d2",
      title: "IT Governance Manager",
      company: "Acme AG",
      location: "Zurich, CH",
      date: "2026-07-22T10:33:43+02:00",
      url: "https://www.jobs.ch/en/vacancies/detail/bb061be9-0583-489d-928c-fb0c3b5f63d2/",
    });
  });

  test("parses multiple items in order", () => {
    const html = searchPageHtml([jobPosting({ title: "Role One" }), jobPosting({ title: "Role Two", identifier: { value: "id-2" } })]);
    const cards = parseSearchResults(html);
    expect(cards.map((c) => c.title)).toEqual(["Role One", "Role Two"]);
  });

  test("skips an item with no identifier", () => {
    const html = searchPageHtml([jobPosting({ identifier: undefined })]);
    expect(parseSearchResults(html)).toHaveLength(0);
  });

  test("falls back to country-only location when locality is missing", () => {
    const html = searchPageHtml([jobPosting({ jobLocation: { address: { addressCountry: "CH" } } })]);
    const [c] = parseSearchResults(html);
    expect(c.location).toBe("CH");
  });

  test("returns an empty list when no ItemList block is present", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "WebSite" })}</script></head></html>`;
    expect(parseSearchResults(html)).toHaveLength(0);
  });

  test("returns an empty list when the ld+json is malformed", () => {
    const html = `<script type="application/ld+json">{not valid</script>`;
    expect(parseSearchResults(html)).toHaveLength(0);
  });
});

describe("parseJobDetail", () => {
  function detailHtml(jp: Record<string, unknown>): string {
    return `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "BreadcrumbList" })}</script><script type="application/ld+json">${JSON.stringify(jp)}</script></head></html>`;
  }

  test("extracts all fields and strips HTML from the description", () => {
    const html = detailHtml(
      jobPosting({
        description: "<p>You will <strong>lead</strong> governance.</p><p>Second paragraph.</p>",
        employmentType: "Permanent position",
        potentialAction: { target: { urlTemplate: "https://www.jobs.ch/en/vacancies/detail/bb061be9-0583-489d-928c-fb0c3b5f63d2/apply" } },
      }),
    );
    const job = parseJobDetail(html)!;
    expect(job.title).toBe("IT Governance Manager");
    expect(job.company).toBe("Acme AG");
    expect(job.employmentType).toBe("Permanent position");
    expect(job.applyUrl).toContain("/apply");
    expect(job.description).toContain("You will");
    expect(job.description).toContain("Second paragraph.");
    expect(job.description).not.toContain("<p>");
  });

  test("returns null when no JobPosting block is present (only BreadcrumbList)", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "BreadcrumbList" })}</script>`;
    expect(parseJobDetail(html)).toBeNull();
  });

  test("returns null on malformed JSON", () => {
    expect(parseJobDetail(`<script type="application/ld+json">{not valid</script>`)).toBeNull();
  });

  test("returns null when the JobPosting has no identifier", () => {
    const html = detailHtml(jobPosting({ identifier: undefined }));
    expect(parseJobDetail(html)).toBeNull();
  });
});
