import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { CodeGraph } from "../../shared/model.ts";
import { home } from "../db.ts";
import type { BuildOptions } from "./build.ts";

const here = dirname(fileURLToPath(import.meta.url));
const bundled = process.env.QUOLI_BUNDLED === "1";
/** A graph younger than this is served as is; an older one is served while a rebuild runs. */
const FRESH_MS = 5_000;

interface Entry {
  graph: CodeGraph | null;
  builtAt: number;
  running: Promise<void> | null;
  error: string | null;
}

const entries = new Map<string, Entry>();

/** Where the worker and the WASM files live: beside the bundle when packaged, else sources and node_modules. */
function locations(): { worker: string; grammarDir: string; runtimeWasm: string } {
  if (bundled) {
    const grammarDir = join(here, "grammars");
    return {
      worker: join(here, "codegraph-worker.mjs"),
      grammarDir,
      runtimeWasm: join(grammarDir, "web-tree-sitter.wasm"),
    };
  }
  const modules = join(here, "..", "..", "node_modules");
  return {
    worker: join(here, "worker.ts"),
    grammarDir: join(modules, "@vscode", "tree-sitter-wasm", "wasm"),
    runtimeWasm: join(modules, "web-tree-sitter", "web-tree-sitter.wasm"),
  };
}

function run(options: BuildOptions, workerFile: string): Promise<CodeGraph> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerFile, {
      workerData: options,
      resourceLimits: { maxOldGenerationSizeMb: 2048 },
    });
    worker.once("message", (m: { graph?: CodeGraph; error?: string }) => {
      if (m.graph) resolve(m.graph);
      else reject(new Error(m.error ?? "Code graph failed"));
      void worker.terminate();
    });
    worker.once("error", reject);
    worker.once("exit", (code) => reject(new Error(`Code graph worker exited (${code})`)));
  });
}

export interface CodeGraphState {
  graph: CodeGraph | null;
  building: boolean;
  error: string | null;
}

/**
 * The project's graph if one is known, starting a background build when there is none or it is
 * stale. Never parses on the calling thread.
 */
export function codeGraphFor(projectId: string, root: string): CodeGraphState {
  let entry = entries.get(projectId);
  if (!entry) {
    entry = { graph: null, builtAt: 0, running: null, error: null };
    entries.set(projectId, entry);
  }
  const e = entry;
  if (!e.running && (!e.graph || Date.now() - e.builtAt > FRESH_MS)) {
    const loc = locations();
    e.running = run(
      {
        root,
        projectId,
        cacheDir: join(home(), "codegraph"),
        grammarDir: loc.grammarDir,
        runtimeWasm: loc.runtimeWasm,
      },
      loc.worker,
    )
      .then((graph) => {
        e.graph = graph;
        e.builtAt = Date.now();
        e.error = null;
      })
      .catch((err) => {
        e.error = err instanceof Error ? err.message : String(err);
      })
      .finally(() => {
        e.running = null;
      });
  }
  return { graph: e.graph, building: e.running !== null, error: e.graph ? null : e.error };
}

/** Resolves when the project's current build, if any, has finished. */
export async function codeGraphIdle(projectId: string): Promise<void> {
  await entries.get(projectId)?.running;
}

/** The graph limited to files under `prefix`; an edge is kept when either end is in scope. */
export function scopeGraph(g: CodeGraph, prefix: string): CodeGraph {
  const inScope = (p: string) => p.startsWith(prefix);
  const fileOf = (id: string) => (id.includes("#") ? id.slice(0, id.lastIndexOf("#")) : id);
  const edges = g.edges.filter((e) => inScope(fileOf(e.from)) || inScope(fileOf(e.to)));
  const related = new Set(edges.flatMap((e) => [e.from, e.to]));
  return {
    ...g,
    files: g.files.filter((f) => inScope(f.path)),
    symbols: g.symbols.filter((s) => inScope(s.file) || related.has(s.id)),
    routes: g.routes?.filter((r) => inScope(r.file) || related.has(r.id)),
    tables: g.tables?.filter((t) => inScope(t.file) || related.has(t.id)),
    edges,
  };
}
