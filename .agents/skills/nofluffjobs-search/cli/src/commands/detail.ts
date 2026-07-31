import {
  DETAIL_URL_BASE,
  htmlFetch,
  parseJobDetail,
  normalizeId,
  writeError,
} from "../helpers.js";

export interface DetailOpts {
  id: string;
  format: "json" | "plain";
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  // Normalize the ID - this will extract the slug from URLs or return the slug as-is
  const slug = normalizeId(opts.id);
  if (!slug) {
    writeError(`Could not parse a job slug from "${opts.id}"`, "BAD_ID");
    return 1;
  }

  // Build the detail URL from the slug
  // No Fluff Jobs uses slug-based URLs like: /job/lead-fullstack-developer-ai-coding-moveli-remote
  let url: string;
  if (opts.id.startsWith("http")) {
    // It's a full URL
    url = opts.id;
  } else if (opts.id.startsWith("/")) {
    // It's a path
    url = `https://nofluffjobs.com${opts.id}`;
  } else {
    // It's just a slug
    url = `https://nofluffjobs.com/job/${slug}`;
  }

  try {
    const html = await htmlFetch(url);
    if (!html) {
      writeError("Job not found", "NOT_FOUND");
      return 1;
    }

    // Use the slug as the ID
    const actualId = slug;
    const job = parseJobDetail(html, actualId);

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"} · ${job.salary || "—"}`,
        "",
        job.category ? `Category: ${job.category}` : "",
        job.seniority ? `Seniority: ${job.seniority}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.date ? `Date: ${job.date}` : "",
        "",
        job.description || "(no description)",
        "",
        job.requirements ? `Requirements:\n${job.requirements}` : "",
        "",
        job.benefits ? `Benefits:\n${job.benefits}` : "",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
      ].filter((l) => l !== "");
      process.stdout.write(lines.join("\n") + "\n");
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n");
    }
    return 0;
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED");
    return 1;
  }
}
