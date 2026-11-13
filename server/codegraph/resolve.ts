import { posix } from "node:path";
import type { CodeEdge, CodeSymbol } from "../../shared/model.ts";
import type { Binding, FileFacts } from "./extract.ts";

/** tsconfig/jsconfig `compilerOptions`, as far as import resolution needs them. */
export interface PathConfig {
  /** Directory of the config file, repo-relative ("" for the root). */
  dir: string;
  baseUrl: string | null;
  paths: Record<string, string[]>;
}

export interface ResolveContext {
  files: FileFacts[];
  pathConfigs: PathConfig[];
  /** go.mod files: directory (repo-relative, "" for root) and module path. */
  goModules: { dir: string; module: string }[];
}

/** A call has at most this many name-only candidates before it is dropped as noise. */
const MAX_POSSIBLE = 3;
const JS_EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const JS_INDEX = ["/index.ts", "/index.tsx", "/index.js", "/index.jsx"];

interface Target {
  /** Repo files the import points at (several for a Go package). */
  files: string[];
  /** Imported name; null when the binding is the module (or package) itself. */
  name: string | null;
}

export function resolveGraph(ctx: ResolveContext): { edges: CodeEdge[]; modules: Set<string> } {
  const byPath = new Map(ctx.files.map((f) => [f.path, f]));
  const symbolsOf = new Map<string, Map<string, CodeSymbol>>();
  const methodsByName = new Map<string, CodeSymbol[]>();
  const goDirs = new Map<string, string[]>();
  for (const f of ctx.files) {
    symbolsOf.set(f.path, new Map(f.symbols.map((s) => [s.qualifiedName, s])));
    for (const s of f.symbols)
      if (s.kind === "method") methodsByName.set(s.name, [...(methodsByName.get(s.name) ?? []), s]);
    if (f.lang === "go") {
      const dir = posix.dirname(f.path);
      goDirs.set(dir, [...(goDirs.get(dir) ?? []), f.path]);
    }
  }
  const pySuffix = new Map<string, string[]>();
  for (const f of ctx.files) {
    if (f.lang !== "python") continue;
    const parts = f.path.split("/");
    for (let i = 0; i < parts.length; i++) {
      const key = parts.slice(i).join("/");
      pySuffix.set(key, [...(pySuffix.get(key) ?? []), f.path]);
    }
  }

  const firstKnown = (bases: string[], exts: string[]) => {
    for (const b of bases) for (const e of exts) if (byPath.has(b + e)) return b + e;
    return null;
  };

  function jsFile(from: string, spec: string): string | null {
    const dir = posix.dirname(from);
    const bases: string[] = [];
    if (spec.startsWith(".")) bases.push(posix.normalize(posix.join(dir, spec)));
    else {
      const cfg = ctx.pathConfigs
        .filter((c) => c.dir === "" || from.startsWith(`${c.dir}/`))
        .sort((a, b) => b.dir.length - a.dir.length)[0];
      if (!cfg) return null;
      for (const [pattern, targets] of Object.entries(cfg.paths)) {
        const star = pattern.indexOf("*");
        const hit =
          star < 0
            ? spec === pattern
              ? ""
              : null
            : spec.startsWith(pattern.slice(0, star)) && spec.endsWith(pattern.slice(star + 1))
              ? spec.slice(star, spec.length - (pattern.length - star - 1))
              : null;
        if (hit === null) continue;
        for (const t of targets)
          bases.push(posix.normalize(posix.join(cfg.dir, cfg.baseUrl ?? "", t.replace("*", hit))));
      }
      if (cfg.baseUrl !== null) bases.push(posix.normalize(posix.join(cfg.dir, cfg.baseUrl, spec)));
    }
    const stripped = bases.map((b) => b.replace(/\.(m|c)?jsx?$/, ""));
    return (
      firstKnown([...bases, ...stripped], JS_EXT) ?? firstKnown([...bases, ...stripped], JS_INDEX)
    );
  }

  function pyModule(from: string, spec: string): string | null {
    const dots = spec.match(/^\.*/)?.[0].length ?? 0;
    const rest = spec.slice(dots).split(".").filter(Boolean).join("/");
    if (dots > 0) {
      let dir = posix.dirname(from);
      for (let i = 1; i < dots; i++) dir = posix.dirname(dir);
      const base = rest ? posix.join(dir, rest) : dir;
      return firstKnown([base], [".py", "/__init__.py"]);
    }
    if (!rest) return null;
    const candidates = [
      ...(pySuffix.get(`${rest}.py`) ?? []),
      ...(pySuffix.get(`${rest}/__init__.py`) ?? []),
    ];
    // Prefer the candidate nearest to the importing file, then the shortest path.
    const near = (p: string) => {
      const a = from.split("/");
      const b = p.split("/");
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      return i;
    };
    return candidates.sort((a, b) => near(b) - near(a) || a.length - b.length)[0] ?? null;
  }

  function goPackage(spec: string): string[] {
    const mod = ctx.goModules
      .filter((m) => spec === m.module || spec.startsWith(`${m.module}/`))
      .sort((a, b) => b.module.length - a.module.length)[0];
    if (!mod) return [];
    const dir = posix.normalize(posix.join(mod.dir, spec.slice(mod.module.length + 1)) || ".");
    return (goDirs.get(dir === "" ? "." : dir) ?? []).filter((p) => !p.endsWith("_test.go")).sort();
  }

  /** Files a spec points at, from `from`. */
  function files(from: FileFacts, spec: string): string[] {
    if (from.lang === "go") return goPackage(spec);
    const hit = from.lang === "python" ? pyModule(from.path, spec) : jsFile(from.path, spec);
    return hit && hit !== from.path ? [hit] : [];
  }

  /** Top-level symbol of a file by name, following re-exports for JS/TS. */
  function exportedSymbol(file: string, name: string, depth = 0): CodeSymbol | null {
    const f = byPath.get(file);
    if (!f || depth > 4) return null;
    const local = f.exports[name];
    const own = local ? symbolsOf.get(file)?.get(local) : undefined;
    if (own) return own;
    for (const r of f.reexports) {
      const pick = r.names === null ? name : r.names.find((x) => x.as === name)?.name;
      if (!pick || (r.names === null && name === "default")) continue;
      const target = files(f, r.spec)[0];
      const hit = target ? exportedSymbol(target, pick, depth + 1) : null;
      if (hit) return hit;
    }
    return null;
  }

  /** Python and Go reach any top-level name of a module or package, exported or not. */
  function member(target: string[], name: string, lang: string): CodeSymbol | null {
    for (const file of target) {
      const hit =
        lang === "python" || lang === "go"
          ? symbolsOf.get(file)?.get(name)
          : exportedSymbol(file, name);
      if (hit) return hit;
    }
    return null;
  }

  const edges = new Map<string, CodeEdge>();
  const add = (
    from: string,
    to: string,
    kind: CodeEdge["kind"],
    certainty: CodeEdge["certainty"],
  ) => {
    if (kind === "import" && from === to) return;
    const key = `${kind}|${certainty}|${from}|${to}`;
    if (
      !edges.has(key) &&
      !(certainty === "possible" && edges.has(`${kind}|resolved|${from}|${to}`))
    )
      edges.set(key, { from, to, kind, certainty });
  };

  const possibleByName = (owner: string, name: string) => {
    const named = (methodsByName.get(name) ?? []).filter((s) => s.id !== owner);
    if (named.length >= 1 && named.length <= MAX_POSSIBLE)
      for (const s of named) add(owner, s.id, "call", "possible");
  };

  for (const f of ctx.files) {
    const scope = new Map<string, Target>();
    // Names bound to something outside the repository (libraries, the standard library).
    const external = new Set<string>();
    const bind = (b: Binding, imported: string[]) => {
      if (imported.length === 0) external.add(b.local);
      else scope.set(b.local, { files: imported, name: b.name });
    };
    for (const imp of f.imports) {
      const targets = files(f, imp.spec);
      let direct = imp.bindings.length === 0;
      for (const b of imp.bindings) {
        if (f.lang === "go") {
          const local = b.local || byPath.get(targets[0])?.pkg || imp.spec.split("/").pop() || "";
          bind({ ...b, local }, targets);
          direct = true;
        } else if (f.lang === "python" && b.name) {
          // `from pkg import name`: name may be a submodule of pkg or a symbol in it.
          const sub = pyModule(
            f.path,
            imp.spec.endsWith(".") ? imp.spec + b.name : `${imp.spec}.${b.name}`,
          );
          if (sub) {
            add(f.path, sub, "import", "resolved");
            bind({ local: b.local, name: null }, [sub]);
          } else {
            bind(b, targets);
            direct = true;
          }
        } else {
          bind(b, targets);
          direct = true;
        }
      }
      if (direct) for (const t of targets.slice(0, 8)) add(f.path, t, "import", "resolved");
    }

    const mine = symbolsOf.get(f.path) ?? new Map<string, CodeSymbol>();
    const byId = new Map(f.symbols.map((s) => [s.id, s]));
    const pkgFiles = f.lang === "go" ? (goDirs.get(posix.dirname(f.path)) ?? []) : [f.path];
    // Go sees every file of its package; other languages only their own file.
    const local = (name: string) => member(pkgFiles, name, "go") ?? mine.get(name) ?? null;
    const methodOf = (cls: CodeSymbol, name: string) =>
      symbolsOf.get(cls.file)?.get(`${cls.qualifiedName}.${name}`) ?? null;

    for (const c of f.calls) {
      let target: CodeSymbol | null = null;
      if (c.object === undefined) {
        const top = local(c.name);
        target = top && !top.qualifiedName.includes(".") ? top : null;
        const b = scope.get(c.name);
        if (!target && b) target = member(b.files, b.name ?? "default", f.lang);
      } else if (c.object === null) {
        possibleByName(c.owner, c.name);
        continue;
      } else {
        const recv = f.receivers[c.owner];
        if (c.object === "this" || c.object === "self" || c.object === recv?.var) {
          const owner = byId.get(c.owner);
          const cls = recv?.type ?? owner?.qualifiedName.split(".").slice(0, -1).join(".");
          // Inherited or dynamic methods are not guessed.
          target = cls ? local(`${cls}.${c.name}`) : null;
        } else {
          const b = scope.get(c.object);
          if (b) {
            if (b.name === null) target = member(b.files, c.name, f.lang);
            else {
              const cls = member(b.files, b.name, f.lang);
              if (cls?.kind === "class" || cls?.kind === "component")
                target = methodOf(cls, c.name);
            }
          } else if (external.has(c.object.split(".")[0])) {
            continue;
          } else {
            const cls = local(c.object);
            if (cls?.kind === "class") target = methodOf(cls, c.name);
            else if (!cls) {
              // A parameter or local variable: only the method name is known.
              possibleByName(c.owner, c.name);
              continue;
            }
          }
        }
      }
      if (target) add(c.owner, target.id, "call", "resolved");
    }
  }

  const modules = new Set<string>();
  for (const e of edges.values()) if (e.from.endsWith("#<module>")) modules.add(e.from);
  return { edges: [...edges.values()], modules };
}
