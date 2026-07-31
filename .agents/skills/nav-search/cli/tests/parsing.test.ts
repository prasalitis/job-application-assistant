import { describe, test, expect } from "bun:test";
import { toCard, decodeNextFlightStream, extractHtmlTextChunks, parseDetailPage } from "../src/helpers";

function esSource(overrides: Record<string, unknown> = {}) {
  return {
    title: "Seniorrådgiver Data Governance",
    businessName: "Kartverket",
    locationList: [{ city: "OSLO", municipal: "OSLO", county: "OSLO" }],
    published: "2026-07-21T00:00:00+02:00",
    ...overrides,
  };
}

describe("toCard", () => {
  test("maps all fields from a well-formed ES hit source", () => {
    const card = toCard("0be9cd3a-219a-455f-9c54-2fded012f84d", esSource());
    expect(card).toEqual({
      id: "0be9cd3a-219a-455f-9c54-2fded012f84d",
      title: "Seniorrådgiver Data Governance",
      company: "Kartverket",
      location: "OSLO",
      date: "2026-07-21T00:00:00+02:00",
      url: "https://arbeidsplassen.nav.no/stillinger/stilling/0be9cd3a-219a-455f-9c54-2fded012f84d",
    });
  });

  test("notes additional locations when more than one is present", () => {
    const card = toCard("id", esSource({ locationList: [{ city: "OSLO" }, { city: "HØNEFOSS" }] }));
    expect(card.location).toBe("OSLO (+1 more)");
  });

  test("falls back to employer.name when businessName is absent", () => {
    const card = toCard("id", esSource({ businessName: undefined, employer: { name: "Fallback Corp" } }));
    expect(card.company).toBe("Fallback Corp");
  });

  test("handles a missing locationList gracefully", () => {
    expect(toCard("id", esSource({ locationList: undefined })).location).toBeNull();
  });
});

// The React Flight stream format: self.__next_f.push([1,"<id>:T<hexLen>,<content>"])
// where content length in bytes is exactly hexLen (hex-encoded).
function flightChunk(id: string, content: string): string {
  const hexLen = content.length.toString(16);
  const raw = `${id}:T${hexLen},${content}`;
  const jsEscaped = JSON.stringify(raw).slice(1, -1); // escape as a JS string literal body
  return `self.__next_f.push([1,"${jsEscaped}"])`;
}

describe("decodeNextFlightStream + extractHtmlTextChunks", () => {
  test("decodes and extracts a single HTML text chunk", () => {
    const html = `<html><body><script>${flightChunk("2c", "<h2>Om stillingen</h2><p>Description text.</p>")}</script></body></html>`;
    const stream = decodeNextFlightStream(html);
    const chunks = extractHtmlTextChunks(stream);
    expect(chunks).toEqual(["<h2>Om stillingen</h2><p>Description text.</p>"]);
  });

  test("extracts multiple HTML chunks and skips non-HTML ones", () => {
    const html = [
      "<script>",
      flightChunk("20", "M26.26 34.98"), // SVG path data, not HTML - should be skipped
      flightChunk("2c", "<h2>About the job</h2><p>Job text.</p>"),
      flightChunk("2d", "<p>Company blurb.</p>"),
      "</script>",
    ].join("");
    const stream = decodeNextFlightStream(html);
    const chunks = extractHtmlTextChunks(stream);
    expect(chunks).toEqual(["<h2>About the job</h2><p>Job text.</p>", "<p>Company blurb.</p>"]);
  });

  test("returns an empty stream when no push calls are present", () => {
    expect(decodeNextFlightStream("<html><body>no data</body></html>")).toBe("");
  });

  test("skips a chunk with invalid escape sequences rather than throwing", () => {
    const html = `self.__next_f.push([1,"2c:T5,valid"]) self.__next_f.push([1,"bad\\`;
    expect(() => decodeNextFlightStream(html)).not.toThrow();
  });
});

describe("parseDetailPage", () => {
  test("extracts title and joins stripped HTML description chunks", () => {
    const html = [
      "<html><head><title>Seniorrådgiver Data Governance - arbeidsplassen.no</title></head><body><script>",
      flightChunk("2c", "<h2>Om stillingen</h2><p>Job description text.</p>"),
      flightChunk("2d", "<p>Company blurb.</p>"),
      "</script></body></html>",
    ].join("");
    const job = parseDetailPage(html, "0be9cd3a-219a-455f-9c54-2fded012f84d")!;
    expect(job.title).toBe("Seniorrådgiver Data Governance");
    expect(job.description).toContain("Om stillingen");
    expect(job.description).toContain("Job description text.");
    expect(job.description).toContain("Company blurb.");
    expect(job.description).not.toContain("<p>");
  });

  test("returns a job with null description when no HTML chunks are found", () => {
    const html = `<html><head><title>Some Job - arbeidsplassen.no</title></head><body></body></html>`;
    const job = parseDetailPage(html, "id")!;
    expect(job.title).toBe("Some Job");
    expect(job.description).toBeNull();
  });

  test("returns null when there is no <title> tag at all", () => {
    expect(parseDetailPage("<html><body>no title</body></html>", "id")).toBeNull();
  });
});
