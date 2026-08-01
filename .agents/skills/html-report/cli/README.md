# html-report-cli

CLI for generating a self-contained HTML dashboard from job application tracking data.

**Data sources:**
- `job_search_tracker.csv` - primary source for application data
- `documents/applications/*/outcome.md` - outcome details for each application

**Authentication**: None required. Reads local files only.
**Format**: HTML output (self-contained, no dependencies).

---

## Installation

```bash
cd .agents/skills/html-report/cli
bun install
```

---

## Commands

| Command | Description |
|---------|-------------|
| `report` | Generate HTML application dashboard |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

---

## Usage

### Generate report to default location

```bash
bun run src/cli.ts
```

Outputs to `reports/application-dashboard.html`.

### Generate report to custom path

```bash
bun run src/cli.ts ~/Desktop/my-report.html
```

### Generate and open

```bash
bun run src/cli.ts --open
```

Tells the user to open the generated file.

---

## Output

The generated HTML dashboard includes:

- **Summary statistics**: Total applications, counts by status
- **Status breakdown**: Doughnut chart showing distribution
- **By sector**: Horizontal bar chart
- **By channel**: Horizontal bar chart
- **Application funnel**: Shows progression from Applied → Interview → Offer → Hired
- **Filterable table**: All applications with search and filter controls
- **Responsive design**: Works on desktop and mobile

All charts are inline SVG with no external dependencies.

---

## Notes

- Requires `job_search_tracker.csv` to exist
- Reads outcome details from `documents/applications/*/outcome.md` if available
- Creates `reports/` directory if it doesn't exist
- All personal data comes from gitignored files
