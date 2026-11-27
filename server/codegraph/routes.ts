import type { Node } from "web-tree-sitter";
import type { CodeRoute } from "../../shared/model.ts";
import type { FileFacts } from "./extract.ts";

export interface RouterFact {
  name: string;
  framework: string;
  prefix: string | null;
}
export interface MountFact {
  parent: string;
  child: string;
  prefix: string | null;
}
export interface RouteFact extends CodeRoute {
  receiver: string;
}

/** Only literal strings: interpolated, escaped and computed paths stay unresolved. */
export function literal(n: Node | null | undefined): string | null {
  if (!n || !["string", "template_string"].includes(n.type)) return null;
  if (
    n.text.includes("\\") ||
    n.namedChildren.some((c) => /substitution|interpolation/.test(c.type))
  )
    return null;
  const quote = n.text.startsWith('"""') ? '"""' : n.text.startsWith("'''") ? "'''" : n.text[0];
  if (!['"', "'", "`", '"""', "'''"].includes(quote) || !n.text.endsWith(quote)) return null;
  return n.text.slice(quote.length, -quote.length);
}

const HTTP = new Set(["get", "post", "put", "patch", "delete", "head", "options", "all"]);
const FN = new Set(["arrow_function", "function_expression", "function"]);
const SCOPES = new Set([
  "program",
  "statement_block",
  "arrow_function",
  "function_expression",
  "function_declaration",
  "method_definition",
  "function",
  "module",
  "block",
  "function_definition",
]);
function scopeOf(node: Node): Node | null {
  let scope = node.parent;
  while (scope && !SCOPES.has(scope.type)) scope = scope.parent;
  return scope;
}

/** Find declared routers and routes before the symbol walk assigns ownership to handlers. */
export function routeFacts(root: Node, file: string, python: boolean) {
  const routers: RouterFact[] = [];
  const mounts: MountFact[] = [];
  const routes: RouteFact[] = [];
  const inline = new Map<number, string>();
  const refs: { owner: string; name: string; object?: string; line: number; kind: "route" }[] = [];
  const constructors = new Map<string, string>();
  if (!python) {
    for (const imp of root.descendantsOfType("import_statement")) {
      const spec = literal(imp.childForFieldName("source"));
      if (spec !== "hono" && spec !== "express") continue;
      const clause = imp.namedChildren.find((n) => n.type === "import_clause");
      for (const c of clause?.namedChildren ?? []) {
        if (c.type === "identifier" && spec === "express") constructors.set(c.text, "express");
        for (const s of c.type === "named_imports" ? c.namedChildren : []) {
          const name = s.childForFieldName("name")?.text;
          if ((spec === "hono" && name === "Hono") || (spec === "express" && name === "Router"))
            constructors.set(s.childForFieldName("alias")?.text ?? name, spec);
        }
      }
    }
    if (!constructors.size) return { routers, mounts, routes, inline, refs };
    const declarations = root.descendantsOfType("variable_declarator");
    const routerBindings = new Map<number, RouterFact>();
    for (const decl of declarations) {
      const name = decl.childForFieldName("name");
      let value = decl.childForFieldName("value");
      if (name?.type !== "identifier" || !value) continue;
      let prefix: string | null = "";
      if (value.type === "call_expression") {
        const fn = value.childForFieldName("function");
        if (
          fn?.type === "member_expression" &&
          fn.childForFieldName("property")?.text === "basePath"
        ) {
          prefix = literal(value.childForFieldName("arguments")?.namedChild(0));
          value = fn.childForFieldName("object");
        }
      }
      if (!value) continue;
      const fn = value.childForFieldName(
        value.type === "new_expression" ? "constructor" : "function",
      );
      const factory = fn?.text ?? "";
      const base = factory.replace(/\.Router$/, "");
      const framework =
        constructors.get(factory) ??
        (factory.endsWith(".Router") ? constructors.get(base) : undefined);
      if (framework && ["call_expression", "new_expression"].includes(value.type)) {
        const router = { name: name.text, framework, prefix };
        routers.push(router);
        routerBindings.set(decl.startIndex, router);
      }
    }
    for (const n of root.descendantsOfType("call_expression")) {
      const fn = n.childForFieldName("function");
      if (fn?.type !== "member_expression") continue;
      const receiver = fn.childForFieldName("object");
      const method = fn.childForFieldName("property")?.text ?? "";
      if (receiver?.type !== "identifier") continue;
      let router: RouterFact | undefined;
      for (let scope = scopeOf(n); scope; scope = scopeOf(scope)) {
        const declaration = declarations.find(
          (d) => d.childForFieldName("name")?.text === receiver.text && scopeOf(d)?.id === scope.id,
        );
        if (declaration) {
          router = routerBindings.get(declaration.startIndex);
          break;
        }
        const parameters =
          scope.childForFieldName("parameters") ?? scope.childForFieldName("parameter");
        if (
          parameters &&
          [parameters, ...parameters.descendantsOfType("identifier")].some(
            (p) => p.type === "identifier" && p.text === receiver.text,
          )
        )
          break;
      }
      if (!router) continue;
      const args = n.childForFieldName("arguments")?.namedChildren ?? [];
      if (method === "route" || method === "use") {
        if (args.length === 2 && args[1].type === "identifier")
          mounts.push({ parent: router.name, child: args[1].text, prefix: literal(args[0]) });
        continue;
      }
      const path = literal(args[0]);
      if (!HTTP.has(method) || path === null || !path.startsWith("/") || args.length < 2) continue;
      const handler = args.at(-1) as Node;
      const line = n.startPosition.row + 1;
      const id = `${file}#route:${method.toUpperCase()}:${line}:${n.startPosition.column}`;
      let handlerId: string | null = null;
      if (FN.has(handler.type)) {
        const name = `${method.toUpperCase()} ${path} handler @${line}:${n.startPosition.column}`;
        handlerId = `${file}#${name}`;
        inline.set(handler.startIndex, name);
        refs.push({ owner: id, name, line, kind: "route" });
      } else if (handler.type === "identifier")
        refs.push({ owner: id, name: handler.text, line, kind: "route" });
      else if (handler.type === "member_expression") {
        const object = handler.childForFieldName("object");
        const name = handler.childForFieldName("property")?.text;
        if (object?.type === "identifier" && name)
          refs.push({ owner: id, name, object: object.text, line, kind: "route" });
      }
      routes.push({
        id,
        receiver: router.name,
        method: method.toUpperCase(),
        path,
        framework: router.framework,
        file,
        line,
        handler: handlerId,
      });
    }
  } else {
    // Python constructors must come from the framework, including explicit import aliases.
    for (const imp of root.descendantsOfType("import_from_statement")) {
      const spec = imp.childForFieldName("module_name")?.text;
      if (spec !== "fastapi" && spec !== "flask") continue;
      for (const n of imp.childrenForFieldName("name")) {
        const name = n.type === "aliased_import" ? n.childForFieldName("name")?.text : n.text;
        if (name && ["FastAPI", "APIRouter", "Flask", "Blueprint"].includes(name))
          constructors.set(n.childForFieldName("alias")?.text ?? name, spec);
      }
    }
    const assignments = root.descendantsOfType("assignment");
    const routerBindings = new Map<number, RouterFact>();
    for (const n of assignments) {
      const name = n.childForFieldName("left");
      const value = n.childForFieldName("right");
      const fw = constructors.get(value?.childForFieldName("function")?.text ?? "");
      if (name?.type !== "identifier" || !fw || !value) continue;
      const prefix = value
        .childForFieldName("arguments")
        ?.namedChildren.find(
          (a) =>
            a.type === "keyword_argument" &&
            ["prefix", "url_prefix"].includes(a.childForFieldName("name")?.text ?? ""),
        );
      const router = {
        name: name.text,
        framework: fw,
        prefix: prefix ? literal(prefix.childForFieldName("value")) : "",
      };
      routers.push(router);
      routerBindings.set(n.startIndex, router);
    }
    for (const n of root.descendantsOfType("decorated_definition")) {
      const handler = n.namedChildren.find((c) => c.type === "function_definition");
      const name = handler?.childForFieldName("name")?.text;
      if (!name) continue;
      for (const dec of n.namedChildren.filter((c) => c.type === "decorator")) {
        const call = dec.namedChild(0);
        const fn = call?.childForFieldName("function");
        const receiver = fn?.childForFieldName("object")?.text;
        let router: RouterFact | undefined;
        for (let scope = scopeOf(n); scope; scope = scopeOf(scope)) {
          const assignment = assignments.find(
            (a) => a.childForFieldName("left")?.text === receiver && scopeOf(a)?.id === scope.id,
          );
          if (assignment) {
            router = routerBindings.get(assignment.startIndex);
            break;
          }
          const parameters = scope.childForFieldName("parameters");
          if (parameters?.descendantsOfType("identifier").some((p) => p.text === receiver)) break;
        }
        const method = fn?.childForFieldName("attribute")?.text ?? "";
        const args = call?.childForFieldName("arguments")?.namedChildren ?? [];
        const path = literal(args[0]);
        if (!router || path === null || !path.startsWith("/")) continue;
        let methods = HTTP.has(method) ? [method.toUpperCase()] : [];
        if (method === "route" || method === "api_route") {
          const option = args.find(
            (n) => n.type === "keyword_argument" && n.childForFieldName("name")?.text === "methods",
          );
          methods = option
            ? (option.childForFieldName("value")?.namedChildren ?? []).flatMap(
                (n) => literal(n)?.toUpperCase() ?? [],
              )
            : ["GET"];
        }
        for (const method of methods.filter((m) => HTTP.has(m.toLowerCase()))) {
          const line = dec.startPosition.row + 1;
          const id = `${file}#route:${method.toUpperCase()}:${line}:${n.startPosition.column}`;
          routes.push({
            id,
            receiver: router.name,
            method: method.toUpperCase(),
            path,
            framework: router.framework,
            file,
            line,
            handler: `${file}#${name}`,
          });
          refs.push({ owner: id, name, line, kind: "route" });
        }
      }
    }
  }
  return { routers, mounts, routes, inline, refs };
}

/** Expand literal mounts through the same import-file resolver used by the call graph. */
export function mountedRoutes(
  facts: FileFacts[],
  importedFiles: (f: FileFacts, spec: string) => string[],
): CodeRoute[] {
  const byPath = new Map(facts.map((f) => [f.path, f]));
  const key = (file: string, name: string) => `${file}#${name}`;
  const parents = new Map<string, { parent: string; prefix: string | null }[]>();
  for (const f of facts)
    for (const m of f.mounts) {
      let child = f.routers.some((r) => r.name === m.child) ? key(f.path, m.child) : null;
      if (!child)
        for (const imp of f.imports) {
          const binding = imp.bindings.find((b) => b.local === m.child);
          if (!binding) continue;
          for (const path of importedFiles(f, imp.spec)) {
            const target = byPath.get(path);
            const name = target?.exports[binding.name ?? "default"];
            if (name && target?.routers.some((r) => r.name === name)) child = key(path, name);
          }
        }
      if (child)
        parents.set(child, [
          ...(parents.get(child) ?? []),
          { parent: key(f.path, m.parent), prefix: m.prefix },
        ]);
    }
  const routers = new Map(
    facts.flatMap((f) => f.routers.map((r) => [key(f.path, r.name), r] as const)),
  );
  const prefixes = (
    id: string,
    seen = new Set<string>(),
    budget = { left: 200 },
  ): (string | null)[] => {
    if (--budget.left < 0 || seen.size >= 32 || seen.has(id)) return [null];
    const own = routers.get(id)?.prefix;
    if (own === null || own === undefined) return [null];
    const up = parents.get(id);
    if (!up) return [own];
    const next = new Set(seen).add(id);
    return up
      .slice(0, 20)
      .flatMap((p) =>
        prefixes(p.parent, next, budget).map((pre) =>
          pre === null || p.prefix === null ? null : `${pre}${p.prefix}${own}`,
        ),
      );
  };
  return facts.flatMap((f) =>
    f.routes.flatMap(({ receiver, ...route }) => {
      const paths = prefixes(key(f.path, receiver));
      return paths.map((pre, i) => ({
        ...route,
        id: i ? `${route.id}:mount${i}` : route.id,
        path: pre === null ? route.path : `${pre}${route.path}`.replace(/\/{2,}/g, "/"),
        pathResolved: pre !== null,
      }));
    }),
  );
}
