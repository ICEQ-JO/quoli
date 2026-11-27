import assert from "node:assert/strict";
import { test } from "node:test";
import { searchEvents } from "../server/search.ts";
import type { CodeGraph, CodeSymbol, SessionDetail } from "../shared/model.ts";
import { editedSymbols } from "../web/src/lenses/map/edits.ts";
import {
  EXPLORATION_LIMIT,
  neighbours,
  revealNodes,
  visibleRelationships,
} from "../web/src/lenses/map/exploration.ts";
import { focusOf, indexGraph } from "../web/src/lenses/map/graph.ts";
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

test("exploration preserves node positions and every visible cross-link and cycle", () => {
  const g = {
    ...graph,
    edges: [...graph.edges, call("db", "handler"), call("handler", "OrderService.save")],
  };
  const idx = indexGraph(g);
  const initial = revealNodes([], [id("handler")]);
  const next = revealNodes(initial, neighbours(idx, id("handler"), "out"), id("handler"));
  const expanded = revealNodes(next, [id("db")], id("OrderService.save"));
  assert.deepEqual(expanded[0], initial[0], "expansion must not recenter existing nodes");
  const edges = visibleRelationships(idx, expanded);
  assert.ok(
    edges.some((e) => e.from === id("db") && e.to === id("handler")),
    "cycle remains visible",
  );
  assert.ok(
    edges.some((e) => e.from === id("handler") && e.to === id("OrderService.save")),
    "cross-link remains visible",
  );
  assert.ok(!edges.some((e) => e.kind === "import"));
  assert.equal(new Set(expanded.map((n) => n.id)).size, expanded.length);
  assert.equal(
    revealNodes(
      [],
      Array.from({ length: 200 }, (_, i) => String(i)),
    ).length,
    EXPLORATION_LIMIT,
  );
});

test("a file exposes its functions and a route/table remains a selectable node", () => {
  const idx = indexGraph(graph);
  assert.deepEqual(
    new Set(focusOf(idx, { kind: "file", id: "orders.ts" })),
    new Set([id("OrderService.create"), id("OrderService.save")]),
  );
  assert.deepEqual(focusOf(idx, { kind: "route", id: "route:GET /orders" }), ["route:GET /orders"]);
  assert.deepEqual(neighbours(idx, "table:orders", "in"), [id("OrderService.save")]);
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
