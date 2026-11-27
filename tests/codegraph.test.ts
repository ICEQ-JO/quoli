import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { type BuildOptions, buildCodeGraph } from "../server/codegraph/build.ts";
import { codeGraphFor, codeGraphIdle, scopeGraph } from "../server/codegraph/index.ts";
import { sqlReferences } from "../server/codegraph/sql.ts";
import type { CodeGraph } from "../shared/model.ts";

const modules = join(import.meta.dirname, "..", "node_modules");
const wasm = {
  grammarDir: join(modules, "@vscode", "tree-sitter-wasm", "wasm"),
  runtimeWasm: join(modules, "web-tree-sitter", "web-tree-sitter.wasm"),
};

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};

/** A git repository holding `files`, committed. */
function repo(files: Record<string, string>, commit = true) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "quoli-graph-")));
  execFileSync("git", ["init", "-q", dir]);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  if (commit) {
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-qm", "init"], { cwd: dir, env });
  }
  return dir;
}

function options(root: string, cacheDir: string): BuildOptions {
  return { root, projectId: "p1", cacheDir, ...wasm };
}

async function graphOf(files: Record<string, string>): Promise<CodeGraph> {
  const dir = repo(files);
  const cache = mkdtempSync(join(tmpdir(), "quoli-graph-cache-"));
  try {
    return await buildCodeGraph(options(dir, cache));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
}

const symbols = (g: CodeGraph) => g.symbols.map((s) => `${s.kind} ${s.id}`).sort();
const calls = (g: CodeGraph) =>
  g.edges
    .filter((e) => e.kind === "call")
    .map((e) => `${e.from} -> ${e.to} ${e.certainty}`)
    .sort();
const imports = (g: CodeGraph) =>
  g.edges
    .filter((e) => e.kind === "import")
    .map((e) => `${e.from} -> ${e.to}`)
    .sort();

test("TypeScript: class methods, imports, a React component, aliases and no edge to libraries", async () => {
  const g = await graphOf({
    "tsconfig.json": `{ // comment
      "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] }, }, }`,
    "src/util.ts": `export function slug(s: string) { return s.toLowerCase(); }
export const clamp = (n: number) => Math.min(n, 1);
function hidden() {}
`,
    "src/orders.ts": `import axios from "axios";
import { slug, clamp as limit } from "./util";
export class OrderService {
  create(name: string) { this.save(slug(name)); axios.get("/x"); return limit(1); }
  save(id: string) { return id; }
}
export { slug as makeSlug } from "./util";
`,
    "src/index.ts": `export * from "./orders";
`,
    "src/ui/Button.tsx": `import { OrderService } from "@/index";
import { makeSlug } from "@/index";
export const Button = () => <span>{makeSlug("a")}</span>;
export function Page(props: { service: OrderService }) {
  props.service.create("x");
  new OrderService().save("y");
  return <Button />;
}
console.log(makeSlug("top"));
`,
  });
  assert.deepEqual(symbols(g), [
    "class src/orders.ts#OrderService",
    "component src/ui/Button.tsx#Button",
    "component src/ui/Button.tsx#Page",
    "function src/util.ts#hidden",
    "function src/util.ts#slug",
    "method src/orders.ts#OrderService.create",
    "method src/orders.ts#OrderService.save",
    "module src/ui/Button.tsx#<module>",
    "variable-function src/util.ts#clamp",
  ]);
  const byId = new Map(g.symbols.map((s) => [s.id, s]));
  assert.equal(byId.get("src/util.ts#slug")?.exported, true);
  assert.equal(byId.get("src/util.ts#hidden")?.exported, false);
  assert.equal(byId.get("src/orders.ts#OrderService.create")?.exported, true);
  assert.deepEqual(
    [
      byId.get("src/orders.ts#OrderService.create")?.startLine,
      byId.get("src/orders.ts#OrderService.create")?.endLine,
    ],
    [4, 4],
  );
  assert.deepEqual(
    calls(g),
    [
      "src/orders.ts#OrderService.create -> src/orders.ts#OrderService.save resolved",
      "src/orders.ts#OrderService.create -> src/util.ts#clamp resolved",
      "src/orders.ts#OrderService.create -> src/util.ts#slug resolved",
      "src/ui/Button.tsx#<module> -> src/util.ts#slug resolved",
      "src/ui/Button.tsx#Button -> src/util.ts#slug resolved",
      "src/ui/Button.tsx#Page -> src/orders.ts#OrderService.create possible",
      "src/ui/Button.tsx#Page -> src/orders.ts#OrderService.save possible",
      "src/ui/Button.tsx#Page -> src/ui/Button.tsx#Button resolved",
      "src/ui/Button.tsx#Page -> src/orders.ts#OrderService resolved",
    ].sort(),
  );
  assert.deepEqual(imports(g), [
    "src/index.ts -> src/orders.ts",
    "src/orders.ts -> src/util.ts",
    "src/ui/Button.tsx -> src/index.ts",
  ]);
  assert.ok(!g.edges.some((e) => e.to.includes("axios")), "no edge to a library");
});

test("JavaScript: CommonJS require and exports, ESM default export", async () => {
  const g = await graphOf({
    "lib/math.js": `function add(a, b) { return a + b; }
function twice(n) { return add(n, n); }
exports.double = twice;
module.exports.add = add;
`,
    "lib/format.js": `module.exports = function format(n) { return String(n); };
`,
    "main.js": `const { add, double: dbl } = require("./lib/math");
const format = require("./lib/format");
const fs = require("fs");
function run() { fs.readFileSync("x"); return format(add(1, dbl(2))); }
run();
`,
    "esm.mjs": `import render from "./view.mjs";
export default function start() { return render(); }
`,
    "view.mjs": `export default function render() { return 1; }
`,
  });
  assert.deepEqual(calls(g), [
    "esm.mjs#start -> view.mjs#render resolved",
    "lib/math.js#twice -> lib/math.js#add resolved",
    "main.js#<module> -> main.js#run resolved",
    "main.js#run -> lib/math.js#add resolved",
    "main.js#run -> lib/math.js#twice resolved",
  ]);
  assert.deepEqual(imports(g), [
    "esm.mjs -> view.mjs",
    "main.js -> lib/format.js",
    "main.js -> lib/math.js",
  ]);
  assert.ok(g.symbols.find((s) => s.id === "view.mjs#render")?.exported);
  assert.ok(g.symbols.find((s) => s.id === "lib/math.js#twice")?.exported);
});

test("Python: package with relative and absolute imports, classes and methods", async () => {
  const g = await graphOf({
    "pkg/__init__.py": "",
    "pkg/models.py": `class Order:
    def total(self):
        return self._tax() + 1

    def _tax(self):
        return 2

def helper():
    return Order()
`,
    "pkg/service.py": `import os
from .models import Order, helper as make
from . import models
from pkg.utils import shout

class Service:
    def run(self):
        o = Order()
        make()
        models.helper()
        shout()
        os.getcwd()
        o.total()
        return self.done()

    def done(self):
        return 1
`,
    "pkg/utils.py": `def shout():
    return "!"
`,
  });
  assert.deepEqual(
    symbols(g),
    [
      "class pkg/models.py#Order",
      "class pkg/service.py#Service",
      "function pkg/models.py#helper",
      "function pkg/utils.py#shout",
      "method pkg/models.py#Order.total",
      "method pkg/models.py#Order._tax",
      "method pkg/service.py#Service.done",
      "method pkg/service.py#Service.run",
    ].sort(),
  );
  assert.deepEqual(
    calls(g),
    [
      "pkg/models.py#Order.total -> pkg/models.py#Order._tax resolved",
      "pkg/models.py#helper -> pkg/models.py#Order resolved",
      "pkg/service.py#Service.run -> pkg/models.py#Order resolved",
      "pkg/service.py#Service.run -> pkg/models.py#Order.total possible",
      "pkg/service.py#Service.run -> pkg/models.py#helper resolved",
      "pkg/service.py#Service.run -> pkg/service.py#Service.done resolved",
      "pkg/service.py#Service.run -> pkg/utils.py#shout resolved",
    ].sort(),
  );
  assert.deepEqual(
    imports(g),
    ["pkg/service.py -> pkg/models.py", "pkg/service.py -> pkg/utils.py"].sort(),
  );
  assert.ok(!g.symbols.find((s) => s.id === "pkg/models.py#Order._tax")?.exported);
});

test("Go: two packages in one module", async () => {
  const g = await graphOf({
    "go.mod": "module example.com/shop\n\ngo 1.22\n\nrequire github.com/gin-gonic/gin v1.9.1\n",
    "main.go": `package main

import (
	"fmt"
	"example.com/shop/store"
	"github.com/gin-gonic/gin"
)

func main() {
	s := store.New()
	s.Save("x")
	fmt.Println(helper())
	gin.Default()
}

func helper() string { return store.Version() }
`,
    "store/store.go": `package store

type Store struct{}

func New() *Store { return &Store{} }
func Version() string { return "1" }
func (s *Store) Save(v string) { s.audit(v) }
func (s *Store) audit(v string) {}
`,
  });
  assert.deepEqual(symbols(g), [
    "class store/store.go#Store",
    "function main.go#helper",
    "function main.go#main",
    "function store/store.go#New",
    "function store/store.go#Version",
    "method store/store.go#Store.Save",
    "method store/store.go#Store.audit",
  ]);
  assert.deepEqual(calls(g), [
    "main.go#helper -> store/store.go#Version resolved",
    "main.go#main -> main.go#helper resolved",
    "main.go#main -> store/store.go#New resolved",
    "main.go#main -> store/store.go#Store.Save possible",
    "store/store.go#Store.Save -> store/store.go#Store.audit resolved",
  ]);
  assert.deepEqual(imports(g), ["main.go -> store/store.go"]);
  assert.equal(g.symbols.find((s) => s.id === "store/store.go#Store.audit")?.exported, false);
  assert.equal(g.symbols.find((s) => s.id === "store/store.go#New")?.exported, true);
  assert.ok(g.stack.frameworks.some((f) => f.name === "gin" && f.evidence === "go.mod"));
});

test("stack detection reads manifests and says which one", async () => {
  const g = await graphOf({
    "package.json": JSON.stringify({
      name: "root",
      workspaces: ["apps/*"],
      devDependencies: { prisma: "^5.0.0" },
    }),
    "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    "apps/web/package.json": JSON.stringify({
      name: "@acme/web",
      dependencies: { next: "15.0.0", react: "19.0.0" },
    }),
    "apps/web/app.ts": "export const a = 1;\n",
    "apps/api/package.json": JSON.stringify({
      name: "@acme/api",
      dependencies: { hono: "4.1.0", "drizzle-orm": "0.3" },
    }),
    "apps/api/main.ts": "export const b = 1;\n",
    "svc/pyproject.toml": `[project]
name = "svc"
dependencies = ["fastapi>=0.110", "SQLAlchemy[asyncio]==2.0.1"]
`,
    "svc/main.py": "x = 1\n",
    "app/requirements.txt": "Flask==3.0.0\nrequests\n",
    "rs/Cargo.toml": `[package]
name = "rs"
[dependencies]
axum = "0.7"
`,
    "java/pom.xml":
      "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>",
    "rb/Gemfile": "gem 'rails', '~> 7.1'\n",
    "php/composer.json": JSON.stringify({
      name: "acme/php",
      require: { "laravel/framework": "^11.0" },
    }),
  });
  const found = Object.fromEntries(g.stack.frameworks.map((f) => [f.name, f]));
  assert.deepEqual(Object.keys(found).sort(), [
    "Drizzle",
    "FastAPI",
    "Flask",
    "Hono",
    "Laravel",
    "Next.js",
    "Prisma",
    "Rails",
    "React",
    "SQLAlchemy",
    "Spring",
    "axum",
  ]);
  assert.equal(found["Next.js"].version, "15.0.0");
  assert.equal(found["Next.js"].package, "@acme/web");
  assert.equal(found["Next.js"].evidence, "apps/web/package.json");
  assert.equal(found.FastAPI.evidence, "svc/pyproject.toml");
  assert.equal(found.Flask.version, "3.0.0");
  assert.equal(found.axum.evidence, "rs/Cargo.toml");
  assert.equal(found.Rails.evidence, "rb/Gemfile");
  assert.equal(found.Laravel.evidence, "php/composer.json");
  assert.equal(found.Spring.evidence, "java/pom.xml");
  assert.deepEqual(g.stack.packages.map((p) => `${p.name}@${p.path}`).sort(), [
    "@acme/api@apps/api",
    "@acme/web@apps/web",
    "acme/php@php",
    "root@.",
    "rs@rs",
    "svc@svc",
  ]);
  assert.equal(g.stack.packages.find((p) => p.name === "@acme/web")?.framework, "Next.js");
  assert.deepEqual(
    g.stack.languages.map((l) => l.name),
    ["TypeScript", "Python"],
  );
  assert.ok(g.stack.languages.every((l) => l.share > 0 && l.share <= 1));
});

test("skips node_modules, generated and minified files, and answers path scopes", async () => {
  const g = await graphOf({
    ".gitignore": "ignored/\n",
    "node_modules/x/index.js": "function nope() {}\n",
    "vendor/lib.go": "package v\nfunc V() {}\n",
    "gen/api.ts": "// @generated\nexport function made() {}\n",
    "dist/out.js": "function built() {}\n",
    "bundle.js": `var a=${"1,".repeat(2000)}0;`,
    "src/a.ts": "export function a() { b(); }\nimport { b } from './b';\n",
    "src/b.ts": "export function b() {}\n",
    "other/c.ts": "export function c() {}\n",
  });
  assert.deepEqual(g.files.map((f) => f.path).sort(), ["other/c.ts", "src/a.ts", "src/b.ts"]);
  assert.ok(g.stats.skipped >= 2);
  const scoped = scopeGraph(g, "src/");
  assert.deepEqual(scoped.files.map((f) => f.path).sort(), ["src/a.ts", "src/b.ts"]);
  assert.ok(scoped.edges.length > 0 && scoped.symbols.every((s) => s.file.startsWith("src/")));
  assert.equal(scopeGraph(g, "other/").edges.length, 0);
});

test("the cache is per commit: reused when unchanged, only edited files are parsed again", async () => {
  const dir = repo({
    "a.ts": "export function a() { return b(); }\nimport { b } from './b';\n",
    "b.ts": "export function b() { return 1; }\n",
  });
  const cache = mkdtempSync(join(tmpdir(), "quoli-graph-cache-"));
  try {
    const first = await buildCodeGraph(options(dir, cache));
    assert.equal(first.stats.parsed, 2);
    assert.equal(first.stats.cached, 0);
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
    }).trim();
    assert.equal(first.commit, commit);
    assert.ok(existsSync(join(cache, `p1-${commit}.json`)));

    const second = await buildCodeGraph(options(dir, cache));
    assert.equal(second.stats.parsed, 0);
    assert.equal(second.stats.cached, 2);
    assert.deepEqual(second.edges, first.edges);

    // An uncommitted edit and a new file are parsed on top of the cached commit.
    writeFileSync(
      join(dir, "b.ts"),
      "export function b() { return c(); }\nimport { c } from './c';\n",
    );
    writeFileSync(join(dir, "c.ts"), "export function c() { return 1; }\n");
    const third = await buildCodeGraph(options(dir, cache));
    assert.equal(third.stats.parsed, 2);
    assert.equal(third.stats.cached, 1);
    assert.ok(calls(third).includes("b.ts#b -> c.ts#c resolved"));

    // A new commit starts a new cache file but reuses facts of unchanged files.
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-qm", "two"], { cwd: dir, env });
    const fourth = await buildCodeGraph(options(dir, cache));
    // Edited files had modification-time signatures; now they are identified by their blob.
    assert.equal(fourth.stats.parsed + fourth.stats.cached, 3);
    assert.equal(fourth.stats.cached >= 1, true);
    assert.equal((await buildCodeGraph(options(dir, cache))).stats.parsed, 0);
    assert.equal(readdirSync(cache).filter((f) => f.endsWith(".json")).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test("codeGraphFor builds in a worker thread and then serves the graph", async () => {
  const dir = repo({ "a.ts": "export function a() { return 1; }\n" });
  const home = mkdtempSync(join(tmpdir(), "quoli-graph-home-"));
  const previous = process.env.QUOLI_HOME;
  process.env.QUOLI_HOME = home;
  try {
    const first = codeGraphFor("worker-test", dir);
    assert.equal(first.graph, null);
    assert.equal(first.building, true);
    await codeGraphIdle("worker-test");
    const done = codeGraphFor("worker-test", dir);
    assert.equal(done.error, null);
    assert.deepEqual(
      done.graph?.symbols.map((s) => s.id),
      ["a.ts#a"],
    );
    assert.ok(existsSync(join(home, "codegraph")));
  } finally {
    if (previous === undefined) delete process.env.QUOLI_HOME;
    else process.env.QUOLI_HOME = previous;
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("real Hono route -> inline handler -> service -> SQL table, with source evidence", async () => {
  const g = await graphOf({
    "api.ts": `import { Hono as Router } from "hono";
import { createOrder } from "./orders";
export const app = new Router();
app.post("/orders", async (c) => c.json(createOrder()));`,
    "orders.ts": `import { db } from "./db";
export function createOrder() {
  return db.prepare("INSERT INTO orders (total) VALUES (?)").run(100);
}`,
    "db.ts": `export const db = {} as any;`,
    "schema.sql": `-- CREATE TABLE fake (x text);
create table orders (id integer primary key, total integer not null, user_id integer references users(id));`,
  });
  assert.equal(g.routes?.length, 1);
  const route = g.routes?.[0];
  assert.equal(route?.path, "/orders");
  assert.ok(route?.handler);
  assert.ok(
    g.edges.some((e) => e.from === route?.id && e.to === route?.handler && e.kind === "route"),
  );
  assert.ok(g.edges.some((e) => e.from === route?.handler && e.to === "orders.ts#createOrder"));
  assert.equal(g.tables?.length, 1);
  const table = g.tables?.[0];
  assert.equal(table?.name, "orders");
  assert.equal(table?.line, 2);
  assert.equal(table?.columns[0].pk, true);
  assert.deepEqual(table?.columns[2].references, { table: "users", column: "id" });
  const write = g.edges.find((e) => e.from === "orders.ts#createOrder" && e.to === table?.id);
  assert.equal(write?.access, "write");
  assert.equal(write?.file, "orders.ts");
  assert.equal(write?.line, 3);
});

test("mounted routers and named imported handlers resolve without treating arbitrary get calls as routes", async () => {
  const g = await graphOf({
    "main.ts": `import { Hono } from "hono"; import { routes } from "./routes";
const app = new Hono().basePath("/v1"); app.route("/api", routes);`,
    "routes.ts": `import { Hono } from "hono"; import { handler } from "./handler";
export const routes = new Hono();
routes.get("/orders", handler); routes.get("/other", handler);
routes.get(dynamic, handler);
const cache = new Map(); cache.get("/not-an-endpoint");`,
    "handler.ts": `export function handler() { return "ok"; }`,
  });
  assert.deepEqual(g.routes?.map((r) => r.path).sort(), ["/v1/api/orders", "/v1/api/other"]);
  assert.ok(g.routes?.every((r) => r.handler === "handler.ts#handler"));
  assert.equal(new Set(g.routes?.map((r) => r.id)).size, 2);
});

test("a router name shadowed by a parameter or local variable does not invent endpoints", async () => {
  const g = await graphOf({
    "api.ts": `import { Hono } from "hono";
const app = new Hono();
function fallback() {}
app.get("/real", fallback);
function helper(app: Map<string,string>) { app.get("/fake", fallback); }
function other() { const app = new Map(); app.get("/also-fake", fallback); }
function setup() { const nested = new Hono(); nested.get("/nested", fallback); }`,
  });
  assert.deepEqual(g.routes?.map((r) => r.path).sort(), ["/nested", "/real"]);
});

test("Express named routers, dynamic mount disclosure and FastAPI route handlers", async () => {
  const g = await graphOf({
    "server.ts": `import express, { Router as MakeRouter } from "express";
const app = express(); const router = MakeRouter();
function handle() { return true; }
router.get("/things", handle); app.use(prefix, router);`,
    "api.py": `from fastapi import FastAPI as API
app = API()
@app.get("/users/{id}")
def read_user(id):
    return lookup(id)
def lookup(id):
    return id
`,
  });
  const express = g.routes?.find((r) => r.framework === "express");
  assert.equal(express?.path, "/things");
  assert.equal(express?.pathResolved, false);
  assert.equal(express?.handler, "server.ts#handle");
  const python = g.routes?.find((r) => r.framework === "fastapi");
  assert.equal(python?.handler, "api.py#read_user");
  assert.ok(g.edges.some((e) => e.from === python?.handler && e.to === "api.py#lookup"));
});

test("SQL literals do not turn comments, string values, dynamic queries or duplicate table names into resolved links", async () => {
  const g = await graphOf({
    "db.ts": `declare const db: any;
export function read() { return db.query("SELECT * FROM orders JOIN users ON users.id = orders.user_id"); }
export function remove() { return db.query("DELETE FROM users WHERE id = ?"); }
export function dynamic(name: string) { return db.query(\`SELECT * FROM \${name}\`); }
export function prose() { return "CREATE TABLE fake (x text)"; }`,
    "a.sql": `create table orders (id integer); create table users (id integer);`,
    "b.sql": `create table orders (id integer); -- create table fake(x int);`,
  });
  assert.equal(g.tables?.length, 3);
  const queries = g.edges.filter((e) => e.kind === "query");
  assert.equal(queries.length, 2);
  assert.ok(queries.every((e) => e.to.includes("table:users:")));
  assert.ok(queries.some((e) => e.access === "read"));
  assert.ok(queries.some((e) => e.access === "write"));
  assert.ok(!queries.some((e) => e.from.endsWith("#dynamic")));
});

test("nested functions keep their lexical call path, and SQL values never enter the facts cache", async () => {
  const dir = repo({
    "app.ts": `declare const db: any;
export function api() {
  function save() { return db.prepare("INSERT INTO notes (value) VALUES ('SYNTHETIC_PRIVATE_VALUE')").run(); }
  return save();
}`,
    "schema.sql": "create table notes (value text);",
  });
  const cache = mkdtempSync(join(tmpdir(), "quoli-entity-cache-"));
  try {
    const g = await buildCodeGraph(options(dir, cache));
    assert.ok(g.edges.some((e) => e.from === "app.ts#api" && e.to === "app.ts#api.save"));
    assert.ok(g.edges.some((e) => e.from === "app.ts#api.save" && e.kind === "query"));
    const cached = readdirSync(cache)
      .map((f) => readFileSync(join(cache, f), "utf8"))
      .join("");
    assert.ok(!cached.includes("SYNTHETIC_PRIVATE_VALUE"));
    assert.ok(!cached.includes("INSERT INTO"));
    assert.equal((await buildCodeGraph(options(dir, cache))).stats.parsed, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test("SQL conflict updates and quoted values do not create extra table writes", () => {
  const refs = sqlReferences(
    "INSERT INTO notes(value) VALUES ('FROM private') ON CONFLICT DO UPDATE SET value = 'UPDATE private'; UPDATE users SET name = 'FROM notes'",
    "api.ts#save",
    2,
  );
  assert.deepEqual(
    refs.map((r) => [r.name, r.access]),
    [
      ["notes", "write"],
      ["users", "write"],
    ],
  );
});

test("Python triple-quoted CTEs and shadowed router parameters stay unresolved", async () => {
  const g = await graphOf({
    "api.py": `from flask import Flask
app = Flask(__name__)
@app.route("/real", methods=["POST"])
def handler():
    db.execute("""WITH orders AS (SELECT * FROM archive) SELECT * FROM orders""")
def setup(app):
    @app.get("/fake")
    def fake():
        return True
`,
    "schema.sql": "create table orders(id integer); create table archive(id integer);",
  });
  assert.deepEqual(
    g.routes?.map((r) => [r.method, r.path]),
    [["POST", "/real"]],
  );
  assert.equal(g.edges.filter((e) => e.kind === "query").length, 0);
});

test("code discovery does not follow source or SQL symlinks outside the project", {
  skip: process.platform === "win32",
}, async () => {
  const dir = repo({ "app.ts": "export function local() {}" });
  const outside = mkdtempSync(join(tmpdir(), "quoli-outside-"));
  const cache = mkdtempSync(join(tmpdir(), "quoli-symlink-cache-"));
  try {
    writeFileSync(join(outside, "secret.ts"), "export function privateCode() {}");
    writeFileSync(join(outside, "secret.sql"), "create table private_table(id integer);");
    symlinkSync(join(outside, "secret.ts"), join(dir, "linked.ts"));
    symlinkSync(join(outside, "secret.sql"), join(dir, "linked.sql"));
    const g = await buildCodeGraph(options(dir, cache));
    assert.ok(!g.files.some((f) => f.path.startsWith("linked")));
    assert.ok(!g.symbols.some((s) => s.name === "privateCode"));
    assert.ok(!g.tables?.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});
