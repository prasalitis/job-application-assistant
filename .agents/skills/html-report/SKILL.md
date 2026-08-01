---
name: html-report
version: 1.0.0
description: >
  Generate a self-contained HTML dashboard from job_search_tracker.csv and application archives.
  Use this when the user wants a visual summary of their job applications, wants to see
  statistics about their job search, or asks for a dashboard/report. Trigger phrases include:
  generate report, html report, dashboard, application tracker, job search stats, statistics,
  summary, visualize applications, show me my applications, application overview.
context: fork
allowed-tools: Bash(bun run .agents/skills/html-report/cli/src/cli.ts *)
---

# HTML Report Skill

Generate a self-contained HTML dashboard from `job_search_tracker.csv` and the application archives under `documents/applications/`. The output is a single `.html` file that can be opened directly in a browser with no server or dependencies.

## When to use this skill

Invoke this skill when the user wants to:

- Generate a visual dashboard of their job applications
- See statistics about their job search progress
- Get an overview of all applications in one place
- Track application status across multiple companies
- Visualize funnel metrics (applied -> interview -> offer -> hired)

## Commands

### Generate report

```bash
bun run .agents/skills/html-report/cli/src/cli.ts [path] [--open]
```

- No argument → output to `reports/application-dashboard.html`
- A path argument (e.g. `/html-report ~/Desktop/report.html`) → use that path
- `--open` flag → after writing, tell the user to open the file

Create `reports/` if it does not exist.

## Output

A self-contained HTML file with:

- Summary statistics (total applications, by status, by sector, by channel)
- Status breakdown doughnut chart
- By sector bar chart
- By channel bar chart
- Application funnel (horizontal bar chart)
- Filterable table of all applications
- Responsive design (works at 900px+)

All charts are inline SVG with no external dependencies.

## Notes

- Data is read from `job_search_tracker.csv` and `documents/applications/*/outcome.md`
- All personal data in the report comes from these files (which are gitignored)
- The report is self-contained and can be opened offline
- Client-side filtering allows users to search and filter applications
