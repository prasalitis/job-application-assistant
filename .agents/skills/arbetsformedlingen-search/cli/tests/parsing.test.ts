import { describe, test, expect } from "bun:test";
import { toCard, toDetail, formatLocation } from "../src/helpers";

function apiHit(overrides: Record<string, unknown> = {}) {
  return {
    id: "30624866",
    headline: "Power Platform Governance-konsult",
    webpage_url: "https://arbetsformedlingen.se/platsbanken/annonser/30624866",
    employer: { name: "B3 Consulting Group AB (publ)" },
    workplace_address: { municipality: "Göteborg", region: "Västra Götalands län" },
    publication_date: "2026-02-17T15:03:58",
    application_deadline: "2026-08-16T23:59:59",
    employment_type: { label: "Vanlig anställning" },
    description: { text: "Full job description text here." },
    application_details: { url: "https://bli.b3.se/jobs/7244583/applications/new" },
    ...overrides,
  };
}

describe("formatLocation", () => {
  test("combines municipality and region when both present and distinct", () => {
    expect(formatLocation({ municipality: "Göteborg", region: "Västra Götalands län" })).toBe("Göteborg, Västra Götalands län");
  });

  test("returns municipality only when region matches it", () => {
    expect(formatLocation({ municipality: "Stockholm", region: "Stockholm" })).toBe("Stockholm");
  });

  test("falls back to region when municipality is missing", () => {
    expect(formatLocation({ region: "Skåne län" })).toBe("Skåne län");
  });

  test("returns null for an undefined address", () => {
    expect(formatLocation(undefined)).toBeNull();
  });
});

describe("toCard", () => {
  test("maps all fields from a well-formed hit", () => {
    const card = toCard(apiHit());
    expect(card).toEqual({
      id: "30624866",
      title: "Power Platform Governance-konsult",
      company: "B3 Consulting Group AB (publ)",
      location: "Göteborg, Västra Götalands län",
      date: "2026-02-17T15:03:58",
      url: "https://arbetsformedlingen.se/platsbanken/annonser/30624866",
    });
  });

  test("falls back to a constructed URL when webpage_url is missing", () => {
    const card = toCard(apiHit({ webpage_url: undefined }));
    expect(card.url).toBe("https://arbetsformedlingen.se/platsbanken/annonser/30624866");
  });

  test("uses '(untitled)' when headline is missing", () => {
    const card = toCard(apiHit({ headline: undefined }));
    expect(card.title).toBe("(untitled)");
  });

  test("handles a hit with no employer or workplace_address", () => {
    const card = toCard(apiHit({ employer: undefined, workplace_address: undefined }));
    expect(card.company).toBeNull();
    expect(card.location).toBeNull();
  });
});

describe("toDetail", () => {
  test("maps all detail-only fields alongside the card fields", () => {
    const job = toDetail(apiHit());
    expect(job.title).toBe("Power Platform Governance-konsult");
    expect(job.description).toBe("Full job description text here.");
    expect(job.deadline).toBe("2026-08-16T23:59:59");
    expect(job.employmentType).toBe("Vanlig anställning");
    expect(job.applyUrl).toBe("https://bli.b3.se/jobs/7244583/applications/new");
  });

  test("returns null fields gracefully when detail data is absent", () => {
    const job = toDetail(apiHit({ description: undefined, application_deadline: undefined, employment_type: undefined, application_details: undefined }));
    expect(job.description).toBeNull();
    expect(job.deadline).toBeNull();
    expect(job.employmentType).toBeNull();
    expect(job.applyUrl).toBeNull();
  });
});
