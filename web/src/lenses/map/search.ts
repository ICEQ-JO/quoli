import type { CodeGraph } from "../../../../shared/model.ts";

export interface GraphHit {
  group: "Symbols" | "Routes" | "Tables" | "Files";
  kind: "symbol" | "route" | "table" | "file";
  id: string;
  label: string;
  detail: string;
  score: number;
}

/** How well `text` matches the query: exact, prefix, word start, substring, then loose subsequence. */
export function matchScore(text: string, q: string): number {
  const t = text.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - Math.min(t.length - q.length, 100);
  const at = t.indexOf(q);
  if (at >= 0) {
    const boundary =
      at === 0 ||
      /[^a-z0-9]/.test(t[at - 1]) ||
      (/[a-z]/.test(text[at - 1]) && /[A-Z]/.test(text[at]));
    return (boundary ? 600 : 400) - Math.min(at, 100);
  }
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  return i === q.length && q.length >= 3 ? 40 : 0;
}

/**
 * Ranks symbols (by qualified name), routes, tables and files. Name matches beat path matches;
 * exported code beats the rest at equal match quality.
 */
export function searchGraph(graph: CodeGraph, raw: string, limit = 24): GraphHit[] {
  const q = raw.trim().toLowerCase();
  if (!q) return [];
  const hits: GraphHit[] = [];
  // `bonus` only ranks real matches; it never turns a miss into a hit.
  const add = (h: GraphHit, bonus = 0) =>
    h.score > 0 && hits.push({ ...h, score: h.score + bonus });
  for (const s of graph.symbols) {
    if (s.kind === "module") continue;
    const name = matchScore(s.qualifiedName, q);
    add(
      {
        group: "Symbols",
        kind: "symbol",
        id: s.id,
        label: s.qualifiedName,
        detail: `${s.kind} · ${s.file}:${s.startLine}`,
        score: name || matchScore(s.file, q) / 4,
      },
      s.exported ? 8 : 0,
    );
  }
  for (const r of graph.routes ?? []) {
    add(
      {
        group: "Routes",
        kind: "route",
        id: r.id,
        label: `${r.method} ${r.path}`,
        detail: `${r.framework} · ${r.file}:${r.line}`,
        score: Math.max(matchScore(`${r.method} ${r.path}`, q), matchScore(r.path, q)),
      },
      10,
    );
  }
  for (const t of graph.tables ?? []) {
    add(
      {
        group: "Tables",
        kind: "table",
        id: t.id,
        label: t.name,
        detail: `${t.source} · ${t.columns.length} columns`,
        score: matchScore(t.name, q),
      },
      10,
    );
  }
  for (const f of graph.files) {
    const name = f.path.slice(f.path.lastIndexOf("/") + 1);
    add({
      group: "Files",
      kind: "file",
      id: f.path,
      label: name,
      detail: f.path,
      score: Math.max(matchScore(name, q), matchScore(f.path, q) / 2),
    });
  }
  hits.sort(
    (a, b) => b.score - a.score || a.label.length - b.label.length || a.id.localeCompare(b.id),
  );
  return hits.slice(0, limit);
}
