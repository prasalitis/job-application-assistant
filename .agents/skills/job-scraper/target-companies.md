# Target Company List

<!-- SETUP: Build your own target company list based on your target sectors and locations. -->
<!-- PERSONAL DATA: if `personal/job-scraper-target-companies.md` exists in this workspace
     (it is gitignored - a contributor's own real data, kept out of git), read it and use
     it as the actual source of truth for the company list, ATS types, and careers URLs. -->

## How to Use
- **ATS column**: determines scrape method
  - `Workday` / `SuccessFactors` / `Taleo` → requires Chrome automation (JS-rendered)
  - `Greenhouse` / `Lever` / `SmartRecruiters` / `Jobvite` / `HTML` → direct page-fetch works
  - `?` → discover on first visit
- **Search method**: during scrape, navigate to careers URL, search relevant terms from search-queries.md priority categories
- **Salary gate**: mark any salary-gated locations (per your search-queries.md Location Filter) for manual salary check before applying

---

## Example Sector Group

| Company | HQ | Target Locations | WC Size | ATS | Careers URL |
|---------|-----|-----------------|---------|-----|-------------|
| [EXAMPLE_COMPANY] | [HQ_COUNTRY] | [YOUR_CITY] | [SIZE] | [ATS_TYPE] | [CAREERS_URL] |

Add one table per sector relevant to your target roles (e.g. industry verticals, IT services/consulting, specialist firms in your domain). Group companies by sector so scrape priority can be tuned per run.

---

## SCRAPE STRATEGY NOTES

### How to search company career pages

Direct page-fetch of career pages often returns empty JS shells for modern ATS platforms. A reliable fallback is a **web search with the `site:` operator** against the company's careers URL, which surfaces Google's indexed copy of the job listing pages.

**Example query pattern:**
```
site:[careers-url] "[YOUR_PRIMARY_JOB_TITLE]" OR "[YOUR_KEY_SKILL]"
```

For Greenhouse ATS companies, the board can often be reached directly:
```
site:job-boards.greenhouse.io/[company-slug] "[YOUR_KEY_SKILL]"
```
Confirm the slug first - if the direct URL 404s, the company isn't on Greenhouse.