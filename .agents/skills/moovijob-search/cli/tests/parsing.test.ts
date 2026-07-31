import { describe, test, expect } from "bun:test";
import { parseJobCards, parseJobDetail } from "../src/helpers";

const BASE_URL = "https://en.moovijob.com";

function card(companySlug: string, titleSlug: string, id: string, title: string, company: string, location: string, date: string): string {
  return `<li class="mb-3 list-style-none company-item">
    <a href="https://en.moovijob.com/job-offers/${companySlug}/${titleSlug}"
        class="card card-job-offer-new d-flex flex-column flex-lg-row text-body"
        data-id="${id}"
        target='_blank'>
        <div class="company-picture"><img src="x" alt="logo" loading="lazy"></div>
        <div class="content w-100">
            <div class="upper d-flex flex-column w-100">
                <p class="m-0 card-job-offer-new-title dotdotdot">
                    ${title}
                </p>
                <p class="m-0 company-name">
                    <small>
                        ${company}
                    </small>
                </p>
            </div>
            <div class="lower">
                <div>
                    <small class="badge text-white bg-primary-500 mr-1 mb-1">
                        ${location}
                    </small>
                    <small class="badge text-white bg-primary-400 mr-1 mb-1">Permanent contract</small>
                </div>
                <div class="bottom">
                    <div class="published_ago pt-2"><small>${date}</small></div>
                </div>
            </div>
        </div>
    </a>
</li>`;
}

describe("parseJobCards", () => {
  test("extracts all fields from a well-formed card", () => {
    const html = card("advanzia-bank", "junior-ict-governance-officer", "326450", "Junior ICT Governance Officer", "Advanzia Bank", "Munsbach", "1w ago");
    const [c] = parseJobCards(html, BASE_URL);
    expect(c).toEqual({
      id: "326450",
      title: "Junior ICT Governance Officer",
      company: "Advanzia Bank",
      location: "Munsbach",
      date: "1w ago",
      url: "https://en.moovijob.com/job-offers/advanzia-bank/junior-ict-governance-officer",
    });
  });

  test("parses multiple cards independently", () => {
    const html = card("acme", "role-one", "1", "Role One", "Acme", "Luxembourg", "6 h") + card("beta", "role-two", "2", "Role Two", "Beta Corp", "Esch-sur-Alzette", "2d ago");
    const cards = parseJobCards(html, BASE_URL);
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.title)).toEqual(["Role One", "Role Two"]);
  });

  test("decodes HTML entities in the title", () => {
    const html = card("acme", "role", "1", "Ing&eacute;nieur R&amp;D", "Acme", "Luxembourg", "6 h");
    // decodeHtmlEntities in helpers.ts only handles the standard named/numeric set used
    // elsewhere in this repo (amp/lt/gt/quot/#39/nbsp) - &eacute; is not among them,
    // so only &amp; is expected to decode here.
    const [c] = parseJobCards(html, BASE_URL);
    expect(c.title).toBe("Ing&eacute;nieur R&D");
  });

  test("skips a chunk with no recognizable job-offer path", () => {
    const html = `<a href="https://en.moovijob.com/job-offers/malformed">no second segment</a>`;
    expect(parseJobCards(html, BASE_URL)).toHaveLength(0);
  });

  test("returns an empty list for a page with no job cards", () => {
    expect(parseJobCards("<html><body>No results</body></html>", BASE_URL)).toHaveLength(0);
  });
});

describe("parseJobDetail", () => {
  function detailHtml(json: Record<string, unknown>): string {
    return `<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head></html>`;
  }

  test("extracts all fields from a well-formed JobPosting JSON-LD block", () => {
    const html = detailHtml({
      "@type": "JobPosting",
      title: "Junior ICT Governance Officer",
      datePosted: "2026-07-21T09:21:01+02:00",
      validThrough: "2026-09-21T09:21:01+02:00",
      employmentType: ["FULL_TIME"],
      description: "<p>You will support <strong>governance</strong> activities.</p><p>Second paragraph.</p>",
      jobLocation: { address: { addressLocality: "Munsbach", addressCountry: "LU" } },
      hiringOrganization: { name: "Advanzia Bank" },
    });
    const job = parseJobDetail(html, "advanzia-bank/junior-ict-governance-officer", "https://en.moovijob.com/job-offers/advanzia-bank/junior-ict-governance-officer")!;
    expect(job.title).toBe("Junior ICT Governance Officer");
    expect(job.company).toBe("Advanzia Bank");
    expect(job.location).toBe("Munsbach, LU");
    expect(job.date).toBe("2026-07-21T09:21:01+02:00");
    expect(job.deadline).toBe("2026-09-21T09:21:01+02:00");
    expect(job.employmentType).toBe("FULL_TIME");
    expect(job.description).toContain("You will support");
    expect(job.description).toContain("Second paragraph.");
  });

  test("returns null when there is no ld+json script tag", () => {
    expect(parseJobDetail("<html><body>no data</body></html>", "x/y", "https://en.moovijob.com/job-offers/x/y")).toBeNull();
  });

  test("returns null on malformed JSON inside the script tag", () => {
    const html = `<script type="application/ld+json">{not valid</script>`;
    expect(parseJobDetail(html, "x/y", "https://en.moovijob.com/job-offers/x/y")).toBeNull();
  });

  test("handles a missing jobLocation gracefully", () => {
    const html = detailHtml({ title: "Remote Role", hiringOrganization: { name: "Acme" } });
    const job = parseJobDetail(html, "acme/remote-role", "https://en.moovijob.com/job-offers/acme/remote-role")!;
    expect(job.location).toBeNull();
  });
});
