import type { CommandRun, ReviewFile, SessionReview } from "./model.ts";

const MAX_FILES = 40;
const tick = (s: string) => `\`${s.replace(/`/g, "'")}\``;
const lines = (f: ReviewFile) =>
  f.added === null && f.removed === null ? "binary" : `+${f.added ?? 0} -${f.removed ?? 0}`;

/** "main → feature/x · 2 commits · 5 uncommitted · 1 unpushed"; unknown parts are left out. */
export function branchLine(b: SessionReview["branch"]): string {
  if (!b) return "";
  const parts: string[] = [];
  const head = b.head ?? "detached HEAD";
  parts.push(b.base ? `${b.base} → ${head}` : head);
  if (b.commits) parts.push(`${b.commits.length} ${b.commits.length === 1 ? "commit" : "commits"}`);
  if (b.uncommitted !== null) parts.push(`${b.uncommitted} uncommitted`);
  if (b.unpushed !== null) parts.push(`${b.unpushed} unpushed`);
  return parts.join(" · ");
}

/**
 * A pull request description drafted from the review: title from the first prompt, what changed
 * per file, commands run with their recorded result, and review notes. It states what was
 * recorded, never that anything works.
 */
export function prSummary(title: string, review: SessionReview, commands: CommandRun[]): string {
  const out: string[] = [`# ${title.replace(/\s+/g, " ").trim() || "Untitled change"}`, ""];
  const bl = branchLine(review.branch);
  if (bl) out.push(bl, "");

  out.push("## What changed", "");
  if (review.files.length === 0) out.push("No files changed.", "");
  else {
    const where = review.source === "git" ? "from Git" : "from the agent's recorded edits";
    out.push(
      `${review.files.length} ${review.files.length === 1 ? "file" : "files"}, +${review.added} -${review.removed} (${where}).`,
      "",
    );
    for (const f of review.files.slice(0, MAX_FILES)) {
      const status = f.status && f.status !== "modified" ? `${f.status}, ` : "";
      out.push(`- ${tick(f.path)} (${status}${lines(f)})`);
    }
    if (review.files.length > MAX_FILES) out.push(`- and ${review.files.length - MAX_FILES} more`);
    out.push("");
  }

  out.push("## Commands run", "");
  if (commands.length === 0) out.push("No commands were recorded.", "");
  else {
    for (const c of commands.slice(0, 20)) {
      out.push(
        `- ${c.status === "failed" ? "failed" : c.status === "ok" ? "ok" : "running"}: ${tick(c.command.split("\n")[0].slice(0, 100))}`,
      );
    }
    if (commands.length > 20) out.push(`- and ${commands.length - 20} more`);
    out.push("");
  }

  out.push("## Review notes", "");
  const notes: string[] = [];
  if (!review.tests.ran) notes.push("No test command was run.");
  else if (review.tests.lastRun === "failed") notes.push("The last test run failed.");
  for (const f of review.files.filter((x) => x.level !== "low").slice(0, 15)) {
    notes.push(`${tick(f.path)}: ${f.reasons.map((r) => r.label).join(", ")}`);
  }
  if (review.source === "edits" && review.note) notes.push(review.note);
  out.push(...(notes.length ? notes.map((n) => `- ${n}`) : ["Nothing flagged."]), "");
  return out.join("\n");
}
