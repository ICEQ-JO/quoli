import assert from "node:assert/strict";
import { test } from "node:test";
import { searchEvents } from "../server/search.ts";
import type { CodeGraph, CodeSymbol, SessionDetail } from "../shared/model.ts";
import { editedSymbols } from "../web/src/lenses/map/edits.ts";
import { defaultFocus, focusColumns, focusOf, indexGraph } from "../web/src/lenses/map/graph.ts";
import { searchGraph } from "../web/src/lenses/map/search.ts";

const sym = (file: string, name: string, startLine: number, endLine: number): CodeSymbol => ({
  id: `${file}#${name}`,
  file,
  name: name.split(".").at(-1) ?? name,
  qualifiedName: name,
  kind: name.includes(".") ? "method" : "function",
  startLine,
  endLine,
  exported: true,
});

// handler -> create -> save -> db ; cron -> save ; route GET /orders -> handler ; save -> orders table
const symbols = [
  sym("api.ts", "handler", 1, 10),
  sym("orders.ts", "OrderService.create", 5, 20),
  sym("orders.ts", "OrderService.save", 22, 30),
  sym("db.ts", "db", 1, 4),
  sym("jobs.ts", "cron", 1, 6),
];
const id = (n: string) => symbols.find((s) => s.qualifiedName === n)?.id as string;
const call = (a: string, b: string) => ({
  from: id(a),
  to: id(b),
  kind: "call" as const,
  certainty: "resolved" as const,
});
const graph = {
  commit: "abc",
  generatedAt: "",
  stack: {},
  files: [],
  symbols,
  edges: [
    call("handler", "OrderService.create"),
    call("OrderService.create", "OrderService.save"),
    call("OrderService.save", "db"),
    call("cron", "OrderService.save"),
    { from: "route:GET /orders", to: id("handler"), kind: "route", certainty: "resolved" },
    { from: id("OrderService.save"), to: "table:orders", kind: "query", certainty: "resolved" },
    { from: id("handler"), to: id("db"), kind: "import", certainty: "resolved" },
  ],
  routes: [
    {
      id: "route:GET /orders",
      method: "GET",
      path: "/orders",
      framework: "hono",
      file: "api.ts",
      line: 1,
      handler: id("handler"),
    },
  ],
  tables: [
    { id: "table:orders", name: "orders", source: "sql", file: "s.sql", line: 1, columns: [] },
  ],
  truncated: false,
  stats: {},
} as unknown as CodeGraph;

test("focus puts callers left and callees right by hop, without import edges", () => {
  const idx = indexGraph(graph);
  const f = focusColumns(idx, [id("OrderService.save")], 2);
  assert.equal(f.centerColumn, 2);
  assert.deepEqual(f.columns[2], [id("OrderService.save")]);
  assert.deepEqual(new Set(f.columns[1]), new Set([id("OrderService.create"), id("cron")]));
  assert.deepEqual(f.columns[0], [id("handler")]);
  assert.deepEqual(new Set(f.columns[3]), new Set([id("db"), "table:orders"]));
  assert.ok(f.edges.every((e) => (f.hop.get(e.to) ?? 0) - (f.hop.get(e.from) ?? 0) === 1));
  assert.ok(!f.edges.some((e) => e.kind === "import"));
  // One hop out from the route reaches its handler.
  const r = focusColumns(idx, ["route:GET /orders"], 1);
  assert.deepEqual(r.columns[2], [id("handler")]);
});

test("a file focuses its connected functions; nothing selected focuses changes or entry points", () => {
  const idx = indexGraph(graph);
  assert.deepEqual(
    new Set(focusOf(idx, { kind: "file", id: "orders.ts" })),
    new Set([id("OrderService.create"), id("OrderService.save")]),
  );
  assert.deepEqual(defaultFocus(idx, [id("db")]), { ids: [id("db")], why: "changed" });
  const entry = defaultFocus(idx, []);
  assert.equal(entry.why, "entry");
  assert.equal(entry.ids[0], "route:GET /orders", "routes come first");
  assert.ok(entry.ids.includes(id("cron")), "an uncalled function is an entry point");
});

test("search ranks names before paths and finds routes and tables", () => {
  const hits = searchGraph(graph, "save");
  assert.equal(hits[0].id, id("OrderService.save"));
  assert.ok(searchGraph(graph, "/orders").some((h) => h.kind === "route"));
  assert.ok(searchGraph(graph, "orders").some((h) => h.kind === "table"));
  assert.deepEqual(searchGraph(graph, "  "), []);
  assert.deepEqual(searchGraph(graph, "zzz"), [], "exported code that does not match is not a hit");
});

test("an edit marks the innermost function holding its new text", () => {
  const text = ["class A {", "  m() {", "    return 42;", "  }", "}", "function f() {}"].join("\n");
  const syms = [sym("a.ts", "A", 1, 5), sym("a.ts", "A.m", 2, 4), sym("a.ts", "f", 6, 6)];
  assert.deepEqual([...editedSymbols(text, syms, ["return 42;"])], ["a.ts#A.m"]);
  assert.equal(
    editedSymbols(text, syms, ["gone"]).size,
    0,
    "text no longer in the file marks nothing",
  );
});

test("event search finds prompts, commands and errors, newest first, and needs two characters", () => {
  const session = {
    id: "s1",
    title: "Fix orders",
    turns: [
      { prompt: "please fix the orders page", at: "2026-11-13T10:00:00Z", toolCallIds: ["c1"] },
    ],
    toolCalls: [
      {
        id: "c1",
        category: "run",
        input: { command: "pnpm test orders" },
        summary: "",
        status: "failed",
        output: "FAIL orders.test.ts\nexpected 2",
        startedAt: "2026-11-13T10:01:00Z",
      },
    ],
  } as unknown as SessionDetail;
  const hits = searchEvents([session], "orders");
  assert.deepEqual(
    hits.map((h) => [h.kind, h.callId]),
    [
      ["command", "c1"],
      ["error", "c1"],
      ["prompt", "c1"],
    ],
  );
  assert.equal(hits[1].text, "FAIL orders.test.ts", "only the matching line");
  assert.deepEqual(searchEvents([session], "o"), []);
});
