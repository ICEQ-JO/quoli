import { readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import type { CodeFile, CodeMap } from "../shared/model.ts";
import { git } from "./ingest.ts";

const MAX_FILES = 1500;
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
  const paths = listed.slice(0, MAX_FILES);
  const known = new Set(paths);
  const files: CodeFile[] = [];
  for (const path of paths) {
    let text = "";
    try {
      if (statSync(join(root, path)).size <= MAX_BYTES)
        text = readFileSync(join(root, path), "utf8");
    } catch {
      continue;
    }
    const ext = extname(path).toLowerCase();
    files.push({
      path,
      lines: text ? text.split("\n").length : 0,
      language: LANGUAGES[ext] ?? null,
      imports: /\.(m|c)?[jt]sx?$/.test(path) ? resolveImports(path, text, known) : [],
      status: status.get(path) ?? "clean",
    });
  }
  return { root, files, truncated: Math.max(0, listed.length - MAX_FILES) };
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
