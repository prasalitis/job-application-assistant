#!/usr/bin/env bun
import { defineCommand, option } from "@bunli/core"
import { z } from "zod"
import { parse } from "node-html-parser"
import { existsSync, mkdirSync } from "fs"
import { readFile, writeFile } from "fs/promises"

export const report = defineCommand({
  name: "report",
  description: "Generate HTML application tracker dashboard",
  options: {
    open: option(z.boolean().default(false), {
      description: "Tell user to open the file after writing",
    }),
  },
  handler: async ({ flags, positional, signal }) => {
    if (signal.aborted) return

    // Determine output path
    let outputPath: string
    if (positional.length > 0) {
      outputPath = positional[0]
    } else {
      if (!existsSync("reports")) {
        mkdirSync("reports", { recursive: true })
      }
      outputPath = "reports/application-dashboard.html"
    }

    try {
      // Read tracker CSV
      let trackerCsv: string
      try {
        trackerCsv = await readFile("job_search_tracker.csv", "utf-8")
      } catch {
        process.stderr.write(JSON.stringify({ error: "job_search_tracker.csv not found", code: "NOT_FOUND" }) + "\n")
        process.exit(1)
      }

      // Parse CSV
      const applications = parseTrackerCsv(trackerCsv)

      // Read outcome files
      const outcomes = await readOutcomes(applications)

      // Merge outcomes with applications
      const merged = mergeWithOutcomes(applications, outcomes)

      // Compute stats
      const stats = computeStats(merged)

      // Generate HTML
      const html = generateHtml(merged, stats)

      // Write output
      await writeFile(outputPath, html)

      if (flags.open) {
        console.log(`Report generated: ${outputPath}`)
        console.log("Please open this file in your browser to view the dashboard.")
      } else {
        console.log(outputPath)
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      process.stderr.write(JSON.stringify({ error, code: "INTERNAL_ERROR" }) + "\n")
      process.exit(1)
    }
  },
})

interface Application {
  date: string
  company: string
  sector: string
  role: string
  role_type: string
  channel: string
  status: string
  contact_person: string
  fit_rating: string
  notes: string
  cv_file: string
  cover_letter_file: string
  source: string
}

interface Outcome {
  company: string
  role: string
  stages: string[]
  notes: string
}

interface MergedApplication extends Application {
  outcomeStages: string[]
  outcomeNotes: string
}

interface Stats {
  total: number
  byStatus: Record<string, number>
  bySector: Record<string, number>
  byChannel: Record<string, number>
  funnel: {
    applied: number
    interview: number
    offer: number
    hired: number
  }
}

function parseTrackerCsv(csv: string): Application[] {
  const lines = csv.split("\n")
  if (lines.length < 2) return []

  const headers = lines[0].split(",").map(h => h.trim())
  const applications: Application[] = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const values = lines[i].split(",")
    const app: Partial<Application> = {}
    for (let j = 0; j < Math.min(headers.length, values.length); j++) {
      const header = headers[j].toLowerCase().replace(/\s+/g, "_")
      const value = values[j]?.trim() ?? ""
      if (header in app) {
        // Handle duplicate headers
        continue
      }
      app[header as keyof Application] = value
    }
    applications.push(app as Application)
  }

  return applications
}

async function readOutcomes(applications: Application[]): Promise<Outcome[]> {
  const outcomes: Outcome[] = []

  for (const app of applications) {
    const folderName = sanitizeFolderName(`${app.company}_${app.role}`)
    const outcomePath = `documents/applications/${folderName}/outcome.md`

    try {
      const content = await readFile(outcomePath, "utf-8")
      const stages = extractStages(content)
      const notes = extractNotes(content)
      outcomes.push({
        company: app.company,
        role: app.role,
        stages,
        notes,
      })
    } catch {
      // outcome.md doesn't exist, skip
    }
  }

  return outcomes
}

function sanitizeFolderName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
}

function extractStages(content: string): string[] {
  const stages: string[] = []
  const stagePattern = /- \[(x|X|✓|✔)\]\s*(.+?)(?=\n|$)/g
  let match
  while ((match = stagePattern.exec(content)) !== null) {
    if (match[1]) {
      stages.push(match[2].trim())
    }
  }
  return stages
}

function extractNotes(content: string): string {
  // Extract notes after stages
  const notesMatch = content.match(/## Notes\n\n([\s\S]*)/i)
  if (notesMatch) {
    return notesMatch[1].trim()
  }
  return ""
}

function mergeWithOutcomes(applications: Application[], outcomes: Outcome[]): MergedApplication[] {
  return applications.map(app => {
    const outcome = outcomes.find(o => 
      o.company.toLowerCase() === app.company.toLowerCase() &&
      o.role.toLowerCase() === app.role.toLowerCase()
    )
    return {
      ...app,
      outcomeStages: outcome?.stages ?? [],
      outcomeNotes: outcome?.notes ?? "",
    }
  })
}

function normalizeStatus(status: string): string {
  const lower = status.toLowerCase()
  if (lower.includes("applied")) return "Active"
  if (lower.includes("interview")) return "Interview"
  if (lower.includes("offer")) return "Offer"
  if (lower.includes("hired")) return "Hired"
  return "Rejected/Closed"
}

function computeStats(applications: MergedApplication[]): Stats {
  const byStatus: Record<string, number> = {}
  const bySector: Record<string, number> = {}
  const byChannel: Record<string, number> = {}

  let applied = 0
  let interview = 0
  let offer = 0
  let hired = 0

  for (const app of applications) {
    const status = normalizeStatus(app.status)
    byStatus[status] = (byStatus[status] || 0) + 1

    if (app.sector) {
      bySector[app.sector] = (bySector[app.sector] || 0) + 1
    }

    if (app.channel) {
      byChannel[app.channel] = (byChannel[app.channel] || 0) + 1
    }

    // Funnel tracking
    applied++
    if (status === "Interview" || status === "Offer" || status === "Hired") {
      interview++
    }
    if (status === "Offer" || status === "Hired") {
      offer++
    }
    if (status === "Hired") {
      hired++
    }
  }

  return {
    total: applications.length,
    byStatus,
    bySector,
    byChannel,
    funnel: { applied, interview, offer, hired },
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function generateHtml(applications: MergedApplication[], stats: Stats): string {
  const statusColors: Record<string, string> = {
    "Active": "#3b82f6",
    "Interview": "#f59e0b",
    "Offer": "#8b5cf6",
    "Hired": "#22c55e",
    "Rejected/Closed": "#ef4444",
  }

  const statusOrder = ["Active", "Interview", "Offer", "Hired", "Rejected/Closed"]
  const sortedStatuses = Object.entries(stats.byStatus)
    .sort(([a], [b]) => statusOrder.indexOf(a) - statusOrder.indexOf(b))

  // Generate stat cards
  const statCards = `
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-value">${stats.total}</div>
        <div class="stat-label">Total Applications</div>
      </div>
      ${sortedStatuses.map(([status, count]) => `
        <div class="stat-card" style="--status-color: ${statusColors[status] || "#666"}">
          <div class="stat-value">${count}</div>
          <div class="stat-label">${status}</div>
        </div>
      `).join("")}
    </div>
  `

  // Generate doughnut chart
  const doughnutChart = generateDoughnutChart(sortedStatuses, statusColors)

  // Generate sector bar chart
  const sectorChart = generateBarChart("By Sector", Object.entries(stats.bySector))

  // Generate channel bar chart
  const channelChart = generateBarChart("By Channel", Object.entries(stats.byChannel))

  // Generate funnel chart
  const funnelChart = generateFunnelChart(stats.funnel)

  // Generate table
  const table = generateTable(applications)

  const date = new Date().toISOString().split("T")[0]

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Job Search Dashboard</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
      --radius: 8px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 2rem;
    }

    .container { max-width: 1400px; margin: 0 auto; }
    h1 { font-size: 1.875rem; font-weight: 700; margin-bottom: 1rem; }
    .subtitle { color: var(--text-muted); margin-bottom: 2rem; }

    .stat-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: var(--card-bg);
      border-radius: var(--radius);
      padding: 1.25rem;
      box-shadow: var(--shadow);
      border-left: 4px solid var(--status-color, #666);
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }

    .stat-label {
      font-size: 0.875rem;
      color: var(--text-muted);
    }

    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .chart-card {
      background: var(--card-bg);
      border-radius: var(--radius);
      padding: 1.5rem;
      box-shadow: var(--shadow);
    }

    .chart-card h3 {
      font-size: 1.125rem;
      font-weight: 600;
      margin-bottom: 1rem;
    }

    .table-container {
      background: var(--card-bg);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .table-filters {
      padding: 1.5rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .table-filters input, .table-filters select {
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 0.875rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    th {
      background: #f1f5f9;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    tr:hover { background: #f8fafc; }
    tr:nth-child(even) { background: #f8fafc; }
    tr:hover { background: #f1f5f9; }

    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
      color: white;
    }

    .status-active { background: #3b82f6; }
    .status-interview { background: #f59e0b; }
    .status-offer { background: #8b5cf6; }
    .status-hired { background: #22c55e; }
    .status-rejected { background: #ef4444; }

    .empty-cell { color: var(--text-muted); font-style: italic; }

    .footer {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      font-size: 0.875rem;
      color: var(--text-muted);
      text-align: center;
    }

    @media (max-width: 768px) {
      .charts-grid { grid-template-columns: 1fr; }
      .stat-cards { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Job Search Dashboard</h1>
    <p class="subtitle">Generated: ${date}</p>

    ${statCards}

    <div class="charts-grid">
      <div class="chart-card">
        <h3>Status Breakdown</h3>
        ${doughnutChart}
      </div>
      <div class="chart-card">
        <h3>By Sector</h3>
        ${sectorChart}
      </div>
      <div class="chart-card">
        <h3>By Channel</h3>
        ${channelChart}
      </div>
      <div class="chart-card">
        <h3>Application Funnel</h3>
        ${funnelChart}
      </div>
    </div>

    <div class="table-container">
      <div class="table-filters">
        <input type="text" id="searchInput" placeholder="Search applications..." oninput="filterTable()">
        <select id="statusFilter" onchange="filterTable()">
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Interview">Interview</option>
          <option value="Offer">Offer</option>
          <option value="Hired">Hired</option>
          <option value="Rejected/Closed">Rejected/Closed</option>
        </select>
        <select id="sectorFilter" onchange="filterTable()">
          <option value="">All Sectors</option>
          ${Object.keys(stats.bySector).map(sector => `
            <option value="${escapeHtml(sector)}">${escapeHtml(sector)}</option>
          `).join("")}
        </select>
      </div>
      <table id="applicationsTable">
        <thead>
          <tr>
            <th>Date</th>
            <th>Company</th>
            <th>Sector</th>
            <th>Role</th>
            <th>Status</th>
            <th>Channel</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${table}
        </tbody>
      </table>
    </div>

    <div class="footer">
      Generated by Mistral Vibe · ai-job-search · ${date}
    </div>
  </div>

  <script>
    function filterTable() {
      const search = document.getElementById('searchInput').value.toLowerCase();
      const status = document.getElementById('statusFilter').value;
      const sector = document.getElementById('sectorFilter').value;

      document.querySelectorAll('#applicationsTable tbody tr').forEach(row => {
        const text = row.textContent.toLowerCase();
        const rowStatus = row.dataset.status || '';
        const rowSector = row.dataset.sector || '';

        const matchesSearch = !search || text.includes(search);
        const matchesStatus = !status || rowStatus === status;
        const matchesSector = !sector || rowSector === sector;

        row.style.display = matchesSearch && matchesStatus && matchesSector ? '' : 'none';
      });
    }
  </script>
</body>
</html>`
}

function generateDoughnutChart(statuses: [string, number][], colors: Record<string, string>): string {
  const total = statuses.reduce((sum, [, count]) => sum + count, 0)
  if (total === 0) return "<p>No data</p>"

  const center = { x: 100, y: 100 }
  const radius = 80
  let currentAngle = -Math.PI / 2 // Start at top

  const paths: string[] = []
  const labels: string[] = []

  for (const [status, count] of statuses) {
    if (count === 0) continue
    const percentage = count / total
    const angle = percentage * 2 * Math.PI
    const color = colors[status] || "#666"

    const x1 = center.x + radius * Math.cos(currentAngle)
    const y1 = center.y + radius * Math.sin(currentAngle)
    currentAngle += angle
    const x2 = center.x + radius * Math.cos(currentAngle)
    const y2 = center.y + radius * Math.sin(currentAngle)

    const largeArc = angle > Math.PI ? 1 : 0
    const path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${center.x} ${center.y} Z`

    paths.push(`<path d="${path}" fill="${color}" stroke="#fff" stroke-width="2"/>`)
    labels.push(`<div class="legend-item"><span style="background:${color}"></span> ${escapeHtml(status)}: ${count}</div>`)
  }

  return `
    <svg width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="Status breakdown: ${statuses.map(([s, c]) => `${c} ${s}`).join(', ')}">
      ${paths.join("")}
    </svg>
    <div class="legend">${labels.join("")}</div>
    <style>
      .legend { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
      .legend-item { display: flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; }
      .legend-item span { display: inline-block; width: 12px; height: 12px; border-radius: 2px; }
    </style>
  `
}

function generateBarChart(title: string, data: [string, number][]): string {
  if (data.length === 0) return "<p>No data</p>"

  const max = Math.max(...data.map(([_, count]) => count))
  const barHeight = 20
  const gap = 5
  const width = 300

  const bars = data
    .sort(([_, a], [__, b]) => b - a)
    .map(([label, count]) => {
      const barWidth = (count / max) * (width - 40)
      return `
        <g transform="translate(0, ${barHeight + gap})">
          <text x="0" y="${barHeight / 2}" dominant-baseline="middle" text-anchor="end">${escapeHtml(label)}</text>
          <rect x="100" y="0" width="${barWidth}" height="${barHeight}" fill="#3b82f6"/>
          <text x="${100 + barWidth + 5}" y="${barHeight / 2}" dominant-baseline="middle">${count}</text>
        </g>
      `
    })
    .join("")

  const height = (barHeight + gap) * data.length

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}: ${data.map(([l, c]) => `${c} ${l}`).join(', ')}">
      ${bars}
    </svg>
  `
}

function generateFunnelChart(funnel: { applied: number; interview: number; offer: number; hired: number }): string {
  const stages = [
    { label: "Applied", count: funnel.applied, color: "#3b82f6" },
    { label: "Interview", count: funnel.interview, color: "#f59e0b" },
    { label: "Offer", count: funnel.offer, color: "#8b5cf6" },
    { label: "Hired", count: funnel.hired, color: "#22c55e" },
  ]

  const max = Math.max(funnel.applied, 1)
  const barHeight = 25
  const gap = 5
  const width = 300

  const bars = stages
    .map((stage) => {
      const barWidth = (stage.count / max) * (width - 100)
      return `
        <g transform="translate(0, ${barHeight + gap})">
          <text x="0" y="${barHeight / 2}" dominant-baseline="middle" text-anchor="end">${escapeHtml(stage.label)}</text>
          <rect x="100" y="0" width="${barWidth}" height="${barHeight}" fill="${stage.color}"/>
          <text x="${100 + barWidth + 5}" y="${barHeight / 2}" dominant-baseline="middle">${stage.count}</text>
        </g>
      `
    })
    .join("")

  const height = (barHeight + gap) * stages.length

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Funnel: ${stages.map(s => `${s.count} ${s.label}`).join(', ')}">
      ${bars}
    </svg>
  `
}

function generateTable(applications: MergedApplication[]): string {
  const statusClasses: Record<string, string> = {
    "Active": "status-active",
    "Interview": "status-interview",
    "Offer": "status-offer",
    "Hired": "status-hired",
    "Rejected/Closed": "status-rejected",
  }

  return applications
    .sort((a, b) => {
      // Sort by date descending
      if (a.date && b.date) {
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      }
      return 0
    })
    .map(app => {
      const status = normalizeStatus(app.status)
      const statusClass = statusClasses[status] || ""
      return `
        <tr data-status="${status}" data-sector="${escapeHtml(app.sector)}">
          <td>${escapeHtml(app.date || "–")}</td>
          <td>${escapeHtml(app.company || "–")}</td>
          <td>${escapeHtml(app.sector || "–")}</td>
          <td>${escapeHtml(app.role || "–")}</td>
          <td><span class="status-badge ${statusClass}">${escapeHtml(status)}</span></td>
          <td>${escapeHtml(app.channel || "–")}</td>
          <td>${escapeHtml(app.notes || app.outcomeNotes || "–")}</td>
        </tr>
      `
    })
    .join("")
}

export default report
