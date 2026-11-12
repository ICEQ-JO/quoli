import { readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import type { CodeFile, CodeMap } from "../shared/model.ts";
import { git } from "./ingest.ts";

/** Paths listed in the map. Beyond this the remainder is only counted in `truncated`. */
export const MAX_LISTED = 50_000;
/** Files whose contents are read for line counts and imports. */
export const MAX_SCANNED = 5_000;
const MAX_BYTES = 512 * 1024;

const LANGUAGES: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".rb": "Ruby",
  ".php": "PHP",
  ".css": "CSS",
  ".html": "HTML",
  ".sql": "SQL",
  ".prisma": "Prisma",
  ".json": "JSON",
  ".yml": "YAML",
  ".yaml": "YAML",
  ".toml": "TOML",
  ".md": "Markdown",
  ".sh": "Shell",
  ".tf": "Terraform",
};

const BINARY =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|mp4|mov|wasm|lock)$|(^|\/)pnpm-lock\.yaml$|package-lock\.json$/i;
const JS_IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g;
const RESOLVE = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", "/index.ts", "/index.tsx", "/index.js"];

export function codeMap(root: string): CodeMap {
  const listed = (git(root, ["ls-files", "-co", "--exclude-standard"]) ?? "")
    .split("\n")
    .filter((p) => p && !BINARY.test(p));
  const status = gitStatus(root);
  const numstat = diffStat(root);
  const paths = listed.slice(0, MAX_LISTED);
  const known = new Set(paths);
  const files: CodeFile[] = [];
  let scans = 0;
  for (const path of paths) {
    const ext = extname(path).toLowerCase();
    const language = LANGUAGES[ext] ?? null;
    let text: string | null = null;
    // Only recognised source/text types are read, and only within the scan budget.
    if (language && scans < MAX_SCANNED) {
      try {
        const abs = join(root, path);
        if (statSync(abs).size <= MAX_BYTES) {
          text = readFileSync(abs, "utf8");
          scans++;
        }
      } catch {
        continue; // listed but gone or unreadable (deleted in the working tree)
      }
    }
    const lines = text === null ? 0 : text.split("\n").length;
    const state = status.get(path) ?? "clean";
    files.push({
      path,
      lines,
      language,
      imports:
        text !== null && /\.(m|c)?[jt]sx?$/.test(path) ? resolveImports(path, text, known) : [],
      scanned: text !== null,
      status: state,
      diff:
        numstat.get(path) ??
        (state === "untracked" && text !== null ? { added: lines, removed: 0 } : null),
    });
  }
  return { root, files, truncated: Math.max(0, listed.length - MAX_LISTED) };
}

export function resolveImports(from: string, text: string, known: Set<string>): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(JS_IMPORT)) {
    const base = normalize(join(dirname(from), m[1])).replace(/\.(m?js)$/, "");
    const hit =
      RESOLVE.map((s) => base + s).find((p) => known.has(p)) ??
      [".js", ".mjs"].map((s) => base + s).find((p) => known.has(p));
    if (hit && hit !== from) out.add(hit);
  }
  return [...out];
}

export function gitStatus(root: string): Map<string, CodeFile["status"]> {
  const out = new Map<string, CodeFile["status"]>();
  for (const line of (git(root, ["status", "--porcelain"]) ?? "").split("\n")) {
    if (!line) continue;
    const code = line.slice(0, 2);
    const path = line.slice(3).split(" -> ").at(-1) ?? "";
    out.set(path, code === "??" ? "untracked" : code.includes("A") ? "added" : "modified");
  }
  return out;
}

/** Uncommitted line counts per path against HEAD; binary files (`-`) are left out. */
export function diffStat(root: string): Map<string, { added: number; removed: number }> {
  const out = new Map<string, { added: number; removed: number }>();
  for (const line of (git(root, ["diff", "--numstat", "HEAD"]) ?? "").split("\n")) {
    const [a, r, ...rest] = line.split("\t");
    const path = rest.join("\t");
    if (!path || a === "-" || r === "-") continue;
    out.set(path.includes(" => ") ? (path.split(" => ").at(-1) ?? path) : path, {
      added: Number(a),
      removed: Number(r),
    });
  }
  return out;
}
