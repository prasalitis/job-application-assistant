import { describe, test, expect } from "bun:test";
import { toCard, extractNgState, toDetail } from "../src/helpers";

function apiJob(overrides: Record<string, unknown> = {}) {
  return {
    refnr: "10001-1003474294-S",
    titel: "Manager IT-Governance (m/w/d)",
    arbeitgeber: "M.M.Warburg & CO (AG & Co.) KGaA",
    arbeitsort: { ort: "Hamburg", region: "Hamburg" },
    aktuelleVeroeffentlichungsdatum: "2026-07-31",
    ...overrides,
  };
}

describe("toCard", () => {
  test("maps all fields from a well-formed API job", () => {
    const card = toCard(apiJob());
    expect(card).toEqual({
      id: "10001-1003474294-S",
      title: "Manager IT-Governance (m/w/d)",
      company: "M.M.Warburg & CO (AG & Co.) KGaA",
      location: "Hamburg, Hamburg",
      date: "2026-07-31",
      url: "https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1003474294-S",
    });
  });

  test("URL-encodes a refnr containing a slash", () => {
    const card = toCard(apiJob({ refnr: "13319-886497/1_618044LS-S" }));
    expect(card.url).toBe("https://www.arbeitsagentur.de/jobsuche/jobdetail/13319-886497%2F1_618044LS-S");
  });

  test("uses '(untitled)' when titel is missing", () => {
    expect(toCard(apiJob({ titel: undefined })).title).toBe("(untitled)");
  });

  test("handles a missing arbeitsort gracefully", () => {
    expect(toCard(apiJob({ arbeitsort: undefined })).location).toBeNull();
  });
});

describe("extractNgState", () => {
  test("parses a well-formed ng-state script tag", () => {
    const html = `<script id="ng-state" type="application/json">${JSON.stringify({ jobdetail: { stellenangebotsTitel: "X" } })}</script>`;
    const data = extractNgState(html) as any;
    expect(data.jobdetail.stellenangebotsTitel).toBe("X");
  });

  test("returns null when the script tag is missing", () => {
    expect(extractNgState("<html><body>no data</body></html>")).toBeNull();
  });

  test("returns null on malformed JSON", () => {
    expect(extractNgState(`<script id="ng-state">{not valid</script>`)).toBeNull();
  });
});

describe("toDetail", () => {
  function ngState(jobdetail: Record<string, unknown>) {
    return { jobdetail };
  }

  test("maps all fields from a well-formed jobdetail object", () => {
    const job = toDetail(
      ngState({
        stellenangebotsTitel: "Manager IT-Governance (m/w/d)",
        stellenangebotsBeschreibung: "Full description text.",
        firma: "M.M.Warburg & CO (AG & Co.) KGaA",
        arbeitszeitVollzeit: true,
        datumErsteVeroeffentlichung: "2026-07-31",
        referenznummer: "10001-1003474294-S",
        stellenlokationen: [{ adresse: { ort: "Hamburg", region: "Hamburg" } }],
      }),
      "10001-1003474294-S",
    )!;
    expect(job.title).toBe("Manager IT-Governance (m/w/d)");
    expect(job.description).toBe("Full description text.");
    expect(job.company).toBe("M.M.Warburg & CO (AG & Co.) KGaA");
    expect(job.location).toBe("Hamburg, Hamburg");
    expect(job.fullTime).toBe(true);
  });

  test("returns null when jobdetail is missing from the state", () => {
    expect(toDetail({ somethingElse: true }, "id")).toBeNull();
  });

  test("falls back to the passed-in refnr when referenznummer is absent", () => {
    const job = toDetail(ngState({ stellenangebotsTitel: "X" }), "fallback-id")!;
    expect(job.id).toBe("fallback-id");
  });

  test("handles a missing stellenlokationen gracefully", () => {
    const job = toDetail(ngState({ stellenangebotsTitel: "X", referenznummer: "id" }), "id")!;
    expect(job.location).toBeNull();
  });
});
