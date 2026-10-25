import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Node as SyntaxNode, Parser as SyntaxParser } from "@vscode/tree-sitter-wasm";
import type {
  SymbolGroup,
  SymbolGrouping,
  SymbolGroupLine,
  SymbolKind,
} from "../../schema/src/changes";
import type { RepositoryFile } from "../../schema/src/repository";
import type { DiffLine, FileChange, LineDiff } from "./diff";

/**
 * Bounded TypeScript/JavaScript symbol grouping derived from captured text.
 *
 * Tree-sitter produces recoverable syntax trees, so a malformed file keeps its
 * file diff and claims no symbols. The walk is bounded by input bytes, node
 * count and symbol count. Parsing establishes syntax ranges in sanitized
 * evidence; it never establishes runtime impact, authorship or a semantic
 * rename.
 */

const MAX_PARSE_BYTES = 512 * 1024;
const MAX_NODES = 100_000;
const MAX_SYMBOLS = 500;
const MAX_GROUPS = 200;
const MAX_NAME = 200;
const MAX_QUALIFIED = 300;
const RULE = "tree-sitter-symbol-group/v1";
const UNCERTAINTY =
  "Derived from parsed captured text; this does not establish runtime impact, authorship or a semantic rename. Duplicate names are matched in source order.";

type Grammar = "typescript" | "tsx";
type Language = NonNullable<SymbolGrouping["language"]>;

type Parsers = Record<Grammar, SyntaxParser>;
type TreeSitter = typeof import("@vscode/tree-sitter-wasm");

/**
 * Load the Emscripten runtime from the same directory as its WASM file. A
 * bundled copy cannot locate its script URL, so the runtime stays a copied
 * asset in both development and release builds.
 */
async function runtimeAt(directory: string): Promise<TreeSitter> {
  const imported = (await import(pathToFileURL(join(directory, "tree-sitter.js")).href)) as
    | TreeSitter
    | { default: TreeSitter };
  return "default" in imported ? imported.default : imported;
}

function wasmDirectory(): string {
  const runtime = join(import.meta.dirname, "wasm");
  if (existsSync(join(runtime, "tree-sitter.wasm")) && existsSync(join(runtime, "tree-sitter.js")))
    return runtime;
  const resolved = createRequire(import.meta.url).resolve(
    "@vscode/tree-sitter-wasm/wasm/tree-sitter.wasm",
  );
  return dirname(resolved);
}

async function loadParsers(): Promise<Parsers> {
  const directory = wasmDirectory();
  const treeSitter = await runtimeAt(directory);
  await treeSitter.Parser.init({
    locateFile: () => join(directory, "tree-sitter.wasm"),
  });
  const language = (file: string) => treeSitter.Language.load(readFileSync(join(directory, file)));
  const typescript = new treeSitter.Parser();
  typescript.setLanguage(await language("tree-sitter-typescript.wasm"));
  const tsx = new treeSitter.Parser();
  tsx.setLanguage(await language("tree-sitter-tsx.wasm"));
  return { typescript, tsx };
}

const loaded = await loadParsers().then(
  (parsers) => ({ parsers, error: null }),
  (error: unknown) => ({
    parsers: null,
    error: error instanceof Error ? error.message : "The parser could not be loaded.",
  }),
);

function languageOf(path: string): { grammar: Grammar; language: Language } | null {
  const extension = extname(path).toLowerCase();
  if (extension === ".ts" || extension === ".mts" || extension === ".cts")
    return { grammar: "typescript", language: "typescript" };
  if (extension === ".tsx") return { grammar: "tsx", language: "tsx" };
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs")
    return { grammar: "typescript", language: "javascript" };
  if (extension === ".jsx") return { grammar: "tsx", language: "jsx" };
  return null;
}

function sideText(file: RepositoryFile | null): string | null {
  if (file?.status !== "present") return null;
  if (file.content.state !== "present" || file.content.text === null) return null;
  return file.content.text;
}

function empty(
  state: SymbolGrouping["state"],
  language: Language | null,
  reason: string | null,
): SymbolGrouping {
  return { state, language, groups: [], unattributed: 0, omitted: 0, reason };
}

type Side = "before" | "after";

type RawSymbol = {
  name: string;
  qualified: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
};

type Extracted = {
  symbols: RawSymbol[];
  errors: boolean;
  bounded: boolean;
};

function nameOf(node: SyntaxNode): string | null {
  const name = node.childForFieldName("name")?.text.trim();
  return name && name.length <= MAX_NAME ? name : null;
}

function qualify(parent: string | null, name: string): string {
  const qualified = parent ? `${parent}.${name}` : name;
  return qualified.length <= MAX_QUALIFIED ? qualified : qualified.slice(0, MAX_QUALIFIED);
}

function symbolAt(
  node: SyntaxNode,
  parent: string | null,
): { name: string; qualified: string; kind: SymbolKind } | null {
  if (
    node.type === "function_declaration" ||
    node.type === "generator_function_declaration" ||
    node.type === "class_declaration" ||
    node.type === "abstract_class_declaration" ||
    node.type === "method_definition"
  ) {
    const name = nameOf(node);
    if (!name) return null;
    const kind: SymbolKind =
      node.type === "class_declaration" || node.type === "abstract_class_declaration"
        ? "class"
        : node.type === "method_definition"
          ? "method"
          : "function";
    return { name, qualified: qualify(parent, name), kind };
  }
  if (node.type === "variable_declarator") {
    const value = node.childForFieldName("value");
    if (
      !value ||
      !["arrow_function", "function_expression", "function", "class"].includes(value.type)
    )
      return null;
    const nameNode = node.childForFieldName("name");
    if (nameNode?.type !== "identifier") return null;
    const name = nameNode.text.trim();
    if (!name || name.length > MAX_NAME) return null;
    return {
      name,
      qualified: qualify(parent, name),
      kind: value.type === "class" ? "class" : "function",
    };
  }
  return null;
}

function extract(text: string, parser: SyntaxParser): Extracted {
  const tree = parser.parse(text);
  if (!tree) return { symbols: [], errors: true, bounded: false };
  const symbols: RawSymbol[] = [];
  const seen = new Map<string, number>();
  const stack: { node: SyntaxNode; parent: string | null }[] = [
    { node: tree.rootNode, parent: null },
  ];
  let nodes = 0;
  let bounded = false;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    nodes += 1;
    if (nodes > MAX_NODES) {
      bounded = true;
      break;
    }
    const found = symbolAt(current.node, current.parent);
    let parent = current.parent;
    if (found) {
      const key = `${found.kind}:${found.qualified}`;
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      const qualified = count === 1 ? found.qualified : `${found.qualified}#${count}`;
      const symbol: RawSymbol = {
        name: found.name,
        qualified,
        kind: found.kind,
        startLine: current.node.startPosition.row + 1,
        endLine: current.node.endPosition.row + 1,
      };
      symbols.push(symbol);
      parent = qualified;
      if (symbols.length > MAX_SYMBOLS) {
        bounded = true;
        break;
      }
    }
    // Named children only: punctuation and comments cannot declare symbols.
    for (let index = current.node.namedChildCount - 1; index >= 0; index -= 1) {
      const child = current.node.namedChild(index);
      if (child) stack.push({ node: child, parent });
    }
  }
  const errors = tree.rootNode.hasError;
  tree.delete();
  return { symbols, errors, bounded };
}

function innermost(symbols: RawSymbol[], line: number): RawSymbol | null {
  let found: RawSymbol | null = null;
  for (const symbol of symbols) {
    if (line < symbol.startLine || line > symbol.endLine) continue;
    if (
      !found ||
      symbol.startLine > found.startLine ||
      (symbol.startLine === found.startLine && symbol.endLine < found.endLine)
    )
      found = symbol;
  }
  return found;
}

function attribute(
  symbols: RawSymbol[],
  lines: DiffLine[],
  side: Side,
): { attributed: Map<RawSymbol, SymbolGroupLine[]>; unattributed: number } {
  const attributed = new Map<RawSymbol, SymbolGroupLine[]>();
  let unattributed = 0;
  for (const line of lines) {
    const number = side === "before" ? line.beforeLine : line.afterLine;
    if (number === null) continue;
    const owner = innermost(symbols, number);
    if (!owner) {
      unattributed += 1;
      continue;
    }
    const list = attributed.get(owner) ?? [];
    list.push({
      kind: line.kind,
      beforeLine: line.beforeLine,
      afterLine: line.afterLine,
    });
    attributed.set(owner, list);
  }
  return { attributed, unattributed };
}

function byKey(symbols: RawSymbol[]): Map<string, RawSymbol[]> {
  const map = new Map<string, RawSymbol[]>();
  for (const symbol of symbols) {
    const key = `${symbol.kind}:${symbol.qualified}`;
    const list = map.get(key) ?? [];
    list.push(symbol);
    map.set(key, list);
  }
  return map;
}

function groupId(
  change: FileChange,
  symbol: RawSymbol,
  before: RawSymbol | null,
  after: RawSymbol | null,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        change.id,
        symbol.kind,
        symbol.qualified,
        before?.startLine ?? null,
        after?.startLine ?? null,
      ]),
    )
    .digest("hex");
}

function group(
  change: FileChange,
  before: RawSymbol | null,
  after: RawSymbol | null,
  lines: SymbolGroupLine[],
): SymbolGroup {
  const symbol = (after ?? before) as RawSymbol;
  const status = before && after ? "modified" : after ? "added" : "deleted";
  return {
    id: groupId(change, symbol, before, after),
    name: symbol.name,
    qualified: symbol.qualified,
    kind: symbol.kind,
    status,
    before: before ? { startLine: before.startLine, endLine: before.endLine } : null,
    after: after ? { startLine: after.startLine, endLine: after.endLine } : null,
    lines: lines.sort(
      (a, b) =>
        (a.afterLine ?? Number.MAX_SAFE_INTEGER) - (b.afterLine ?? Number.MAX_SAFE_INTEGER) ||
        (a.beforeLine ?? Number.MAX_SAFE_INTEGER) - (b.beforeLine ?? Number.MAX_SAFE_INTEGER),
    ),
    basis: "derived",
    rule: RULE,
    uncertainty: UNCERTAINTY,
  };
}

/**
 * Group a complete (unpaged) diff by parsed symbols. Pass the result of
 * `diffAll`; a paged diff would silently group only the visible lines.
 */
export function groupFileSymbols(change: FileChange, diff: LineDiff): SymbolGrouping {
  const detected = languageOf(change.path);
  if (!detected)
    return empty(
      "unsupported",
      null,
      "Only TypeScript and JavaScript paths are grouped; the file diff remains available.",
    );
  if (diff.state === "unavailable")
    return empty("unavailable", detected.language, diff.reason ?? "The file diff is unavailable.");
  if (diff.state === "bounded")
    return empty("bounded", detected.language, diff.reason ?? "The file diff is bounded.");
  if (!loaded.parsers)
    return empty(
      "unavailable",
      detected.language,
      `The TypeScript/JavaScript parser is unavailable: ${loaded.error ?? "unknown error"}.`,
    );

  const beforeText = sideText(change.before);
  const afterText = sideText(change.after);
  const needsBefore = change.status !== "added";
  const needsAfter = change.status !== "deleted";
  if ((needsBefore && beforeText === null) || (needsAfter && afterText === null))
    return empty(
      "unavailable",
      detected.language,
      "One side of this comparison has no complete sanitized text, so symbols are not grouped.",
    );
  for (const text of [beforeText, afterText])
    if (text !== null && Buffer.byteLength(text) > MAX_PARSE_BYTES)
      return empty(
        "bounded",
        detected.language,
        `Files above ${MAX_PARSE_BYTES} bytes per side are not parsed for symbols.`,
      );

  const changed = diff.lines.filter((line) => line.kind !== "context");
  if (changed.length === 0) return empty("available", detected.language, null);

  const parser = loaded.parsers[detected.grammar];
  const before = beforeText === null ? null : extract(beforeText, parser);
  const after = afterText === null ? null : extract(afterText, parser);
  if (before?.bounded || after?.bounded)
    return empty(
      "bounded",
      detected.language,
      `Symbol extraction stops above ${MAX_SYMBOLS} symbols or ${MAX_NODES} syntax nodes.`,
    );

  const errors = [before?.errors ? "before" : null, after?.errors ? "after" : null].filter(
    (side): side is string => side !== null,
  );
  if (errors.length > 0)
    return {
      ...empty(
        "partial",
        detected.language,
        `Tree-sitter reported syntax errors in the ${errors.join(" and ")} side; no symbols are claimed and the file diff remains available.`,
      ),
      unattributed: changed.length,
    };

  const beforeSymbols = before?.symbols ?? [];
  const afterSymbols = after?.symbols ?? [];
  const beforeAttr = attribute(beforeSymbols, changed, "before");
  const afterAttr = attribute(afterSymbols, changed, "after");
  const beforeByKey = byKey(beforeSymbols);
  const afterByKey = byKey(afterSymbols);
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);
  const groups: SymbolGroup[] = [];
  for (const key of keys) {
    const beforeList = beforeByKey.get(key) ?? [];
    const afterList = afterByKey.get(key) ?? [];
    const count = Math.max(beforeList.length, afterList.length);
    for (let index = 0; index < count; index += 1) {
      const beforeSymbol = beforeList[index] ?? null;
      const afterSymbol = afterList[index] ?? null;
      const lines = [
        ...(beforeSymbol ? (beforeAttr.attributed.get(beforeSymbol) ?? []) : []),
        ...(afterSymbol ? (afterAttr.attributed.get(afterSymbol) ?? []) : []),
      ];
      if (lines.length === 0) continue;
      groups.push(group(change, beforeSymbol, afterSymbol, lines));
    }
  }
  groups.sort(
    (a, b) =>
      (a.after?.startLine ?? a.before?.startLine ?? 0) -
        (b.after?.startLine ?? b.before?.startLine ?? 0) || a.qualified.localeCompare(b.qualified),
  );
  const omitted = Math.max(0, groups.length - MAX_GROUPS);
  if (groups.length > MAX_GROUPS) groups.length = MAX_GROUPS;
  return {
    state: "available",
    language: detected.language,
    groups,
    unattributed: beforeAttr.unattributed + afterAttr.unattributed,
    omitted,
    reason: null,
  };
}
