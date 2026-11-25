import type { CodeEdge, CodeTable } from "../../shared/model.ts";

export interface QueryFact {
  owner: string;
  name: string;
  access: "read" | "write";
  line: number;
}
interface Token {
  word: string;
  at: number;
  quoted: boolean;
}

/** A bounded lexical scan; comments and SQL string values cannot declare tables or queries. */
function tokens(text: string): Token[] {
  const out: Token[] = [];
  const re =
    /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|[A-Za-z_][\w$]*|[^\s]/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    if (raw.startsWith("--") || raw.startsWith("/*") || raw.startsWith("'")) continue;
    const quoted = /^["`[]/.test(raw);
    out.push({
      word: quoted ? raw.slice(1, -1).replace(/""/g, '"').replace(/``/g, "`") : raw.toLowerCase(),
      at: m.index,
      quoted,
    });
  }
  return out;
}
const is = (t: Token | undefined, value: string) => t && !t.quoted && t.word === value;
const identifier = (t: Token | undefined) => t && (t.quoted || /^[a-z_][\w$]*$/i.test(t.word));
function nameAt(ts: Token[], at: number): { name: string; end: number } | null {
  if (!identifier(ts[at])) return null;
  let name = ts[at].word;
  if (ts[at + 1]?.word === "." && identifier(ts[at + 2])) {
    name += `.${ts[at + 2].word}`;
    at += 2;
  }
  return { name, end: at };
}

/** SQL declarations from .sql files or literal database exec/prepare/query arguments. */
export function sqlTables(text: string, file: string, firstLine = 1): CodeTable[] {
  const ts = tokens(text);
  const tables: CodeTable[] = [];
  for (let i = 0; i < ts.length; i++) {
    if (!is(ts[i], "create")) continue;
    let at = i + 1;
    if (is(ts[at], "temp") || is(ts[at], "temporary")) at++;
    if (!is(ts[at++], "table")) continue;
    if (is(ts[at], "if") && is(ts[at + 1], "not") && is(ts[at + 2], "exists")) at += 3;
    const table = nameAt(ts, at);
    if (!table || ts[table.end + 1]?.word !== "(") continue;
    const columns: CodeTable["columns"] = [];
    let depth = 1;
    let start = table.end + 2;
    let end = start;
    const parts: Token[][] = [];
    for (; end < ts.length && depth; end++) {
      const word = ts[end].word;
      if (word === "(") depth++;
      if (word === ")") depth--;
      if ((word === "," && depth === 1) || depth === 0) {
        parts.push(ts.slice(start, end));
        start = end + 1;
      }
    }
    if (depth !== 0) continue;
    for (const part of parts) {
      if (
        !identifier(part[0]) ||
        ["constraint", "primary", "foreign", "unique", "check", "exclude"].some((k) =>
          is(part[0], k),
        )
      )
        continue;
      const ref = part.findIndex((t) => is(t, "references"));
      const target = ref < 0 ? null : nameAt(part, ref + 1);
      const refColumn =
        target && part[target.end + 1]?.word === "(" ? (part[target.end + 2]?.word ?? null) : null;
      columns.push({
        name: part[0].word,
        type: identifier(part[1]) ? part[1].word : null,
        pk: part.some((t, n) => is(t, "primary") && is(part[n + 1], "key")),
        references: target ? { table: target.name, column: refColumn } : null,
      });
    }
    for (const part of parts) {
      const pk = part.findIndex((t, n) => is(t, "primary") && is(part[n + 1], "key"));
      if (pk >= 0 && (is(part[0], "primary") || is(part[0], "constraint"))) {
        const names = part
          .slice(pk + 3)
          .filter(identifier)
          .map((t) => t.word);
        for (const c of columns) if (names.includes(c.name)) c.pk = true;
      }
    }
    const line = firstLine + text.slice(0, ts[i].at).split("\n").length - 1;
    tables.push({
      id: `${file}#table:${table.name}:${line}`,
      name: table.name,
      source: "SQL",
      file,
      line,
      columns,
    });
    i = end - 1;
  }
  return tables;
}

/** Keep identifiers and locations only; SQL values never enter the persistent code cache. */
export function sqlReferences(text: string, owner: string, firstLine: number): QueryFact[] {
  const ts = tokens(text);
  // shortcut: CTE name shadowing is not resolved; skip WITH queries until a SQL AST is available.
  if (is(ts[0], "with")) return [];
  const out: QueryFact[] = [];
  for (let i = 0; i < ts.length; i++) {
    let access: "read" | "write";
    if (is(ts[i], "from") || is(ts[i], "join")) access = is(ts[i - 1], "delete") ? "write" : "read";
    else if (is(ts[i], "into") && (is(ts[i - 1], "insert") || is(ts[i - 1], "replace")))
      access = "write";
    else if (is(ts[i], "update") && (i === 0 || ts[i - 1]?.word === ";")) access = "write";
    else continue;
    const name = nameAt(ts, i + 1);
    if (!name) continue;
    out.push({
      owner,
      name: name.name,
      access,
      line: firstLine + text.slice(0, ts[i].at).split("\n").length - 1,
    });
    i = name.end;
  }
  return out;
}

/** Link only unambiguous, declared table names; a literal query is evidence, not execution. */
export function queryEdges(
  queries: { file: string; queries: QueryFact[] }[],
  tables: CodeTable[],
): CodeEdge[] {
  const edges = new Map<string, CodeEdge>();
  for (const f of queries)
    for (const query of f.queries) {
      const matches = tables.filter((t) => t.name === query.name);
      const local = matches.filter((t) => t.file === f.file);
      const candidates = local.length ? local : matches;
      if (candidates.length !== 1) continue;
      const e: CodeEdge = {
        from: query.owner,
        to: candidates[0].id,
        kind: "query",
        certainty: "resolved",
        file: f.file,
        line: query.line,
        access: query.access,
      };
      edges.set(`${e.from}|${e.to}|${e.access}|${e.line}`, e);
    }
  return [...edges.values()];
}
