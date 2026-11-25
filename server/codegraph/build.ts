import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, isAbsolute, join, posix, relative } from "node:path";
import { Language, Parser } from "web-tree-sitter";
import type { CodeGraph, CodeGraphFile } from "../../shared/model.ts";
import { extract, type FileFacts, type Lang, moduleId } from "./extract.ts";
import { type PathConfig, resolveGraph } from "./resolve.ts";
import { queryEdges, sqlTables } from "./sql.ts";
import { detectStack } from "./stack.ts";

export interface BuildOptions {
  root: string;
  projectId: string;
  /** Directory for `<projectId>-<commit>.json`. */
  cacheDir: string;
  /** Directory with tree-sitter-<lang>.wasm. */
  grammarDir: string;
  /** Path of web-tree-sitter.wasm. */
  runtimeWasm: string;
}

/** Same ideas as the file map in code.ts: bounded file count and file size. */
export const MAX_SCANNED = 5_000;
const MAX_BYTES = 512 * 1024;
const CACHE_VERSION = 2;
const KEEP_CACHES = 3;

const BY_EXT: Record<string, { lang: Lang; name: string }> = {
  ".ts": { lang: "typescript", name: "TypeScript" },
  ".mts": { lang: "typescript", name: "TypeScript" },
  ".cts": { lang: "typescript", name: "TypeScript" },
  ".tsx": { lang: "tsx", name: "TypeScript" },
  ".js": { lang: "javascript", name: "JavaScript" },
  ".jsx": { lang: "javascript", name: "JavaScript" },
  ".mjs": { lang: "javascript", name: "JavaScript" },
  ".cjs": { lang: "javascript", name: "JavaScript" },
  ".py": { lang: "python", name: "Python" },
  ".go": { lang: "go", name: "Go" },
};
const IGNORED_DIR =
  /(^|\/)(node_modules|dist|build|vendor|\.git|\.next|\.nuxt|out|target|coverage|__pycache__|\.venv|venv|site-packages)\//;
const SKIPPED_NAME =
  /\.d\.ts$|\.min\.(js|mjs|cjs)$|\.bundle\.js$|\.(pb|gen)\.go$|_generated\.|\.generated\./;
const GENERATED_HEAD = /@generated|DO NOT EDIT|Code generated|auto-?generated/i;

interface CacheFile {
  version: number;
  commit: string | null;
  files: Record<string, { sig: string; facts: FileFacts }>;
}

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-c", "core.quotepath=off", ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 30_000,
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/** Paths git reports as changed, added or untracked relative to HEAD. */
function dirtyPaths(root: string): Set<string> {
  const out = new Set<string>();
  const parts = (git(root, ["status", "--porcelain=v1", "-z"]) ?? "").split("\0");
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    out.add(e.slice(3));
    if (e[0] === "R" || e[0] === "C") i++; // the next entry is the rename source
  }
  return out;
}

let ready: Promise<void> | null = null;
const languages = new Map<Lang, Language>();

function readCache(file: string): CacheFile | null {
  try {
    const c = JSON.parse(readFileSync(file, "utf8")) as CacheFile;
    return c.version === CACHE_VERSION ? c : null;
  } catch {
    return null;
  }
}

function cachesOf(dir: string, projectId: string) {
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${projectId}-`) && f.endsWith(".json"))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
}

/** Newest cache of the project from another commit: its unchanged files are reused. */
function seedCache(dir: string, projectId: string, exclude: string): CacheFile | null {
  try {
    const newest = cachesOf(dir, projectId).find((c) => c.f !== exclude);
    return newest ? readCache(join(dir, newest.f)) : null;
  } catch {
    return null;
  }
}

function pruneCaches(dir: string, projectId: string) {
  try {
    for (const { f } of cachesOf(dir, projectId).slice(KEEP_CACHES))
      rmSync(join(dir, f), { force: true });
  } catch {
    // The cache is an optimisation; failing to prune is harmless.
  }
}

function readText(root: string, path: string): string | null {
  try {
    const abs = realpathSync(join(root, path));
    const rel = relative(realpathSync(root), abs);
    if (rel.startsWith("..") || isAbsolute(rel)) return null;
    return statSync(abs).size <= MAX_BYTES ? readFileSync(abs, "utf8") : null;
  } catch {
    return null;
  }
}

function readJsonLoose(text: string): Record<string, unknown> | null {
  // tsconfig allows comments and trailing commas.
  const clean = text
    .replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (_m, str) => str ?? "")
    .replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

function pathConfigs(root: string, all: string[]): PathConfig[] {
  const out: PathConfig[] = [];
  for (const p of all.filter((x) => /(^|\/)(ts|js)config\.json$/.test(x)).slice(0, 100)) {
    const opts = readJsonLoose(readText(root, p) ?? "")?.compilerOptions as
      | { baseUrl?: unknown; paths?: unknown }
      | undefined;
    if (!opts || (typeof opts.baseUrl !== "string" && !opts.paths)) continue;
    const dir = posix.dirname(p) === "." ? "" : posix.dirname(p);
    const paths: Record<string, string[]> = {};
    if (opts.paths && typeof opts.paths === "object")
      for (const [k, v] of Object.entries(opts.paths))
        if (Array.isArray(v)) paths[k] = v.filter((x): x is string => typeof x === "string");
    out.push({ dir, baseUrl: typeof opts.baseUrl === "string" ? opts.baseUrl : null, paths });
  }
  return out;
}

/** Minified bundles and long data lines: not code worth mapping. */
function looksGenerated(text: string): boolean {
  if (GENERATED_HEAD.test(text.slice(0, 400))) return true;
  return text.length > 2000 && text.length / (1 + (text.match(/\n/g)?.length ?? 0)) > 300;
}

/** Builds the code graph for a repository: parse (or reuse cached facts), then resolve. */
export async function buildCodeGraph(o: BuildOptions): Promise<CodeGraph> {
  const started = Date.now();
  const commit = git(o.root, ["rev-parse", "HEAD"])?.trim() || null;
  const listed = (git(o.root, ["ls-files", "-co", "--exclude-standard", "-z"]) ?? "")
    .split("\0")
    .filter(Boolean);
  const blobs = new Map<string, string>();
  for (const e of (git(o.root, ["ls-files", "-s", "-z"]) ?? "").split("\0")) {
    const m = /^\d+ ([0-9a-f]+) \d\t(.*)$/s.exec(e);
    if (m) blobs.set(m[2], m[1]);
  }
  const dirty = dirtyPaths(o.root);

  const candidates = listed.filter(
    (p) => BY_EXT[extname(p).toLowerCase()] && !IGNORED_DIR.test(p) && !SKIPPED_NAME.test(p),
  );
  const scanned = candidates.slice(0, MAX_SCANNED);

  const cacheName = `${o.projectId}-${commit ?? "none"}.json`;
  const cachePath = join(o.cacheDir, cacheName);
  const previous = readCache(cachePath) ?? seedCache(o.cacheDir, o.projectId, cacheName);
  const next: CacheFile = { version: CACHE_VERSION, commit, files: {} };

  const facts: FileFacts[] = [];
  let parsed = 0;
  let cached = 0;
  let skipped = candidates.length - scanned.length;
  const todo: { path: string; sig: string; text: string; lang: Lang }[] = [];

  for (const path of scanned) {
    let sig: string;
    try {
      const st = statSync(join(o.root, path));
      if (st.size > MAX_BYTES) {
        skipped++;
        continue;
      }
      // A clean tracked file is identified by its blob, so a new commit reuses unchanged files;
      // anything else (edited, new) by modification time and size.
      const blob = blobs.get(path);
      sig = blob && !dirty.has(path) ? blob : `m${st.mtimeMs}:${st.size}`;
    } catch {
      continue; // listed but deleted in the working tree
    }
    const hit = previous?.files[path];
    if (hit && hit.sig === sig) {
      next.files[path] = hit;
      facts.push(hit.facts);
      cached++;
      continue;
    }
    const text = readText(o.root, path);
    if (text === null || looksGenerated(text)) {
      skipped++;
      continue;
    }
    todo.push({ path, sig, text, lang: BY_EXT[extname(path).toLowerCase()].lang });
  }

  if (todo.length) {
    ready ??= Parser.init({ locateFile: () => o.runtimeWasm });
    await ready;
    const parser = new Parser();
    todo.sort((a, b) => a.lang.localeCompare(b.lang));
    let current: Lang | null = null;
    for (const t of todo) {
      if (t.lang !== current) {
        let lang = languages.get(t.lang);
        if (!lang) {
          lang = await Language.load(join(o.grammarDir, `tree-sitter-${t.lang}.wasm`));
          languages.set(t.lang, lang);
        }
        parser.setLanguage(lang);
        current = t.lang;
      }
      const tree = parser.parse(t.text);
      if (!tree) {
        skipped++;
        continue;
      }
      try {
        const f = extract(t.lang, t.path, t.text, tree.rootNode);
        next.files[t.path] = { sig: t.sig, facts: f };
        facts.push(f);
        parsed++;
      } finally {
        tree.delete();
      }
    }
    parser.delete();
  }

  const files: CodeGraphFile[] = facts.map((f) => ({
    path: f.path,
    language: BY_EXT[extname(f.path).toLowerCase()]?.name ?? "",
    lines: f.lines,
  }));

  const goModules = listed
    .filter((p) => p === "go.mod" || p.endsWith("/go.mod"))
    .slice(0, 50)
    .flatMap((p) => {
      const module = /^module\s+(\S+)/m.exec(readText(o.root, p) ?? "")?.[1];
      return module ? [{ dir: posix.dirname(p) === "." ? "" : posix.dirname(p), module }] : [];
    });
  const { edges, modules, routes } = resolveGraph({
    files: facts,
    pathConfigs: pathConfigs(o.root, listed),
    goModules,
  });

  const sqlCandidates = listed.filter((p) => p.endsWith(".sql") && !IGNORED_DIR.test(p));
  const sqlFiles = sqlCandidates.slice(0, MAX_SCANNED);
  const tables = facts.flatMap((f) => f.tables);
  for (const path of sqlFiles) {
    const text = readText(o.root, path);
    if (text === null) {
      skipped++;
      continue;
    }
    tables.push(...sqlTables(text, path));
    files.push({ path, language: "SQL", lines: text.split("\n").length });
  }
  edges.push(
    ...queryEdges(
      facts.map((f) => ({ file: f.path, queries: f.queries })),
      tables,
    ),
  );
  const symbols = facts.flatMap((f) => f.symbols);
  for (const edge of edges) if (edge.from.endsWith("#<module>")) modules.add(edge.from);
  for (const id of modules) {
    const path = id.slice(0, id.lastIndexOf("#"));
    symbols.push({
      id: moduleId(path),
      file: path,
      name: "<module>",
      qualifiedName: "<module>",
      kind: "module",
      startLine: 1,
      endLine: facts.find((x) => x.path === path)?.lines ?? 1,
      exported: false,
    });
  }

  if (
    parsed > 0 ||
    !previous ||
    Object.keys(previous.files).length !== Object.keys(next.files).length
  ) {
    try {
      mkdirSync(o.cacheDir, { recursive: true });
      const tmp = `${cachePath}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(next));
      renameSync(tmp, cachePath);
      pruneCaches(o.cacheDir, o.projectId);
    } catch {
      // Read-only home: the graph is still returned, just not cached.
    }
  }

  const calls = edges.filter((e) => e.kind === "call");
  return {
    commit,
    generatedAt: new Date().toISOString(),
    stack: detectStack(listed, (p) => readText(o.root, p)),
    files,
    symbols,
    edges,
    routes,
    tables,
    truncated: candidates.length > MAX_SCANNED || sqlCandidates.length > MAX_SCANNED,
    stats: {
      files: files.length,
      symbols: symbols.length,
      imports: edges.filter((e) => e.kind === "import").length,
      calls: calls.filter((e) => e.certainty === "resolved").length,
      possibleCalls: calls.filter((e) => e.certainty === "possible").length,
      parsed,
      cached,
      skipped,
      ms: Date.now() - started,
    },
  };
}
