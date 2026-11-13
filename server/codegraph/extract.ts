import type { Node } from "web-tree-sitter";
import type { CodeSymbol, SymbolKind } from "../../shared/model.ts";

export type Lang = "typescript" | "tsx" | "javascript" | "python" | "go";

/** A name an import brings into a file. `name` is the imported name, "default", or null for the module itself. */
export interface Binding {
  local: string;
  name: string | null;
}

export interface RawImport {
  spec: string;
  bindings: Binding[];
}

export interface RawCall {
  /** Id of the calling symbol, or `<path>#<module>` for top-level code. */
  owner: string;
  name: string;
  /** undefined: a bare `name()`. string: dotted receiver (`this`, `ns.sub`). null: a receiver that is not a plain name. */
  object: string | null | undefined;
  line: number;
  kind: "call" | "new" | "jsx";
}

/** Everything the resolver needs from one file; contains names and lines only, never source text. */
export interface FileFacts {
  path: string;
  lang: Lang;
  lines: number;
  symbols: CodeSymbol[];
  imports: RawImport[];
  /** `export { a } from "./x"` / `export * from "./x"`: `names` is null for the star form. */
  reexports: { spec: string; names: { name: string; as: string }[] | null }[];
  /** export name to the local top-level symbol name. */
  exports: Record<string, string>;
  calls: RawCall[];
  /** Go: the package name. */
  pkg: string | null;
  /** Go methods: receiver variable and type, by symbol id. */
  receivers: Record<string, { var: string; type: string }>;
}

interface Item {
  n: Node;
  owner: string;
  /** Qualified name of the enclosing class while directly inside its body. */
  cls: string | null;
  exp: "" | "named" | "default";
  /** Node whose range a symbol takes (the export statement around a declaration). */
  outer?: Node;
}

const FUNCTION_VALUES = new Set([
  "arrow_function",
  "function_expression",
  "function",
  "generator_function",
]);

export function moduleId(path: string): string {
  return `${path}#<module>`;
}

/** `a.b.c` for plain name chains, otherwise null. */
function chain(n: Node | null): string | null {
  if (!n) return null;
  switch (n.type) {
    case "identifier":
    case "this":
      return n.text;
    case "member_expression":
    case "attribute":
    case "selector_expression": {
      const o = chain(n.childForFieldName("object") ?? n.childForFieldName("operand"));
      const p = n.childForFieldName("property") ?? n.childForFieldName("attribute");
      const f = p ?? n.childForFieldName("field");
      return o && f ? `${o}.${f.text}` : null;
    }
  }
  return null;
}

const unquote = (s: string) => s.slice(1, -1);

export function extract(lang: Lang, path: string, text: string, root: Node): FileFacts {
  const facts: FileFacts = {
    path,
    lang,
    lines: 1 + (text.match(/\n/g)?.length ?? 0),
    symbols: [],
    imports: [],
    reexports: [],
    exports: {},
    calls: [],
    pkg: null,
    receivers: {},
  };
  const mod = moduleId(path);
  const seen = new Set<string>();
  const js = lang !== "python" && lang !== "go";

  function define(
    qualified: string,
    kind: SymbolKind,
    node: Node,
    name = qualified.split(".").pop() ?? qualified,
  ): string {
    const id = `${path}#${qualified}`;
    if (!seen.has(id)) {
      seen.add(id);
      facts.symbols.push({
        id,
        file: path,
        name,
        qualifiedName: qualified,
        kind,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        exported: false,
      });
    }
    return id;
  }

  const stack: Item[] = [{ n: root, owner: mod, cls: null, exp: "" }];
  const push = (n: Node, from: Item, patch: Partial<Item> = {}) =>
    stack.push({ n, owner: from.owner, cls: from.cls, exp: "", ...patch });
  const pushChildren = (it: Item) => {
    // Reverse so the stack pops in source order.
    for (let i = it.n.namedChildCount - 1; i >= 0; i--) {
      const c = it.n.namedChild(i);
      if (c) push(c, it);
    }
  };
  const topLevel = (it: Item) => it.owner === mod && it.cls === null;
  const call = (
    it: Item,
    n: Node,
    name: string,
    object: string | null | undefined,
    kind: RawCall["kind"],
  ) => facts.calls.push({ owner: it.owner, name, object, line: n.startPosition.row + 1, kind });
  const isComponent = (name: string, n: Node) =>
    /^[A-Z]/.test(name) &&
    n.descendantsOfType(["jsx_element", "jsx_self_closing_element", "jsx_fragment"]).length > 0;

  /** Registers a top-level JS/TS function value (arrow, expression, memo(...)). */
  function jsFunctionValue(it: Item, name: string, value: Node, range: Node): boolean {
    let fn: Node | null = null;
    let wrapped = false;
    if (FUNCTION_VALUES.has(value.type)) fn = value;
    else if (value.type === "call_expression") {
      const callee = value.childForFieldName("function")?.text ?? "";
      const first = value.childForFieldName("arguments")?.namedChild(0);
      if (
        /^(React\.)?(memo|forwardRef)$/.test(callee) &&
        first &&
        FUNCTION_VALUES.has(first.type)
      ) {
        fn = first;
        wrapped = true;
      }
    }
    if (!fn || !topLevel(it)) return false;
    const kind: SymbolKind = wrapped || isComponent(name, fn) ? "component" : "variable-function";
    const id = define(name, kind, range);
    if (it.exp) facts.exports[it.exp === "default" ? "default" : name] = name;
    push(value, it, { owner: id, cls: null });
    return true;
  }

  function jsRequire(n: Node, nameNode: Node | null): boolean {
    if (n.type !== "call_expression" || n.childForFieldName("function")?.text !== "require")
      return false;
    const arg = n.childForFieldName("arguments")?.namedChild(0);
    if (arg?.type !== "string") return false;
    const bindings: Binding[] = [];
    if (nameNode?.type === "identifier") bindings.push({ local: nameNode.text, name: null });
    if (nameNode?.type === "object_pattern") {
      for (const p of nameNode.namedChildren) {
        if (p.type === "shorthand_property_identifier_pattern")
          bindings.push({ local: p.text, name: p.text });
        else if (p.type === "pair_pattern") {
          const k = p.childForFieldName("key");
          const v = p.childForFieldName("value");
          if (k && v?.type === "identifier") bindings.push({ local: v.text, name: k.text });
        }
      }
    }
    facts.imports.push({ spec: unquote(arg.text), bindings });
    return true;
  }

  function jsImport(n: Node) {
    const src = n.childForFieldName("source");
    if (!src) return;
    const bindings: Binding[] = [];
    for (const clause of n.namedChildren) {
      if (clause.type !== "import_clause") continue;
      for (const c of clause.namedChildren) {
        if (c.type === "identifier") bindings.push({ local: c.text, name: "default" });
        else if (c.type === "namespace_import") {
          const id = c.namedChildren.find((x) => x.type === "identifier");
          if (id) bindings.push({ local: id.text, name: null });
        } else if (c.type === "named_imports") {
          for (const s of c.namedChildren) {
            const name = s.childForFieldName("name")?.text;
            if (name) bindings.push({ local: s.childForFieldName("alias")?.text ?? name, name });
          }
        }
      }
    }
    facts.imports.push({ spec: unquote(src.text), bindings });
  }

  function jsExport(it: Item) {
    const n = it.n;
    const src = n.childForFieldName("source");
    const isDefault = n.children.some((c) => c.type === "default");
    const clause = n.namedChildren.find((c) => c.type === "export_clause");
    const specs = (clause?.namedChildren ?? [])
      .filter((s) => s.type === "export_specifier")
      .flatMap((s) => {
        const name = s.childForFieldName("name")?.text;
        return name ? [{ name, as: s.childForFieldName("alias")?.text ?? name }] : [];
      });
    if (src) {
      const spec = unquote(src.text);
      facts.reexports.push({ spec, names: clause ? specs : null });
      facts.imports.push({ spec, bindings: [] });
      return;
    }
    for (const s of specs) facts.exports[s.as] = s.name;
    const decl = n.childForFieldName("declaration");
    if (decl) return push(decl, it, { exp: isDefault ? "default" : "named", outer: n });
    const value = n.childForFieldName("value");
    if (!value) return;
    if (value.type === "identifier") facts.exports.default = value.text;
    else if (!jsFunctionValue({ ...it, exp: "default" }, "default", value, n)) push(value, it);
  }

  /** `module.exports = ...`, `exports.x = ...` at the top level of a CommonJS file. */
  function cjsAssign(it: Item): boolean {
    const left = it.n.childForFieldName("left");
    const right = it.n.childForFieldName("right");
    if (left?.type !== "member_expression" || !right || !topLevel(it)) return false;
    const target = left.text;
    if (target === "module.exports") {
      if (right.type === "identifier") facts.exports.default = right.text;
      else if (right.type === "object") {
        for (const p of right.namedChildren) {
          if (p.type === "shorthand_property_identifier") facts.exports[p.text] = p.text;
          else if (p.type === "pair") {
            const k = p.childForFieldName("key");
            const v = p.childForFieldName("value");
            if (k && v?.type === "identifier") facts.exports[k.text] = v.text;
          }
        }
      }
      return false;
    }
    const m = /^(?:module\.)?exports\.(\w+)$/.exec(target);
    if (!m) return false;
    if (right.type === "identifier") facts.exports[m[1]] = right.text;
    else if (jsFunctionValue({ ...it, exp: "named" }, m[1], right, it.n.parent ?? it.n))
      return true;
    return false;
  }

  function pyImport(n: Node) {
    for (const c of n.namedChildren) {
      if (c.type === "dotted_name") {
        facts.imports.push({ spec: c.text, bindings: [{ local: c.text, name: null }] });
      } else if (c.type === "aliased_import") {
        const name = c.childForFieldName("name")?.text;
        const alias = c.childForFieldName("alias")?.text;
        if (name && alias)
          facts.imports.push({ spec: name, bindings: [{ local: alias, name: null }] });
      }
    }
  }

  function pyFromImport(n: Node) {
    const spec = n.childForFieldName("module_name")?.text;
    if (!spec) return;
    const bindings: Binding[] = [];
    for (const c of n.childrenForFieldName("name")) {
      if (c.type === "dotted_name") bindings.push({ local: c.text, name: c.text });
      else if (c.type === "aliased_import") {
        const name = c.childForFieldName("name")?.text;
        const alias = c.childForFieldName("alias")?.text;
        if (name && alias) bindings.push({ local: alias, name });
      }
    }
    facts.imports.push({ spec, bindings });
  }

  function goImport(n: Node) {
    for (const s of n.descendantsOfType("import_spec")) {
      const p = s.childForFieldName("path");
      const alias = s.childForFieldName("name")?.text ?? "";
      if (!p || alias === "_" || alias === ".") continue;
      facts.imports.push({ spec: unquote(p.text), bindings: [{ local: alias, name: null }] });
    }
  }

  function goReceiver(n: Node): { var: string; type: string } | null {
    const decl = n
      .childForFieldName("receiver")
      ?.namedChildren.find((c) => c.type === "parameter_declaration");
    const type = decl?.childForFieldName("type")?.descendantsOfType("type_identifier")[0];
    return type ? { var: decl?.childForFieldName("name")?.text ?? "", type: type.text } : null;
  }

  while (stack.length) {
    const it = stack.pop() as Item;
    const n = it.n;
    switch (n.type) {
      case "export_statement":
        jsExport(it);
        continue;
      case "import_statement":
        if (js) jsImport(n);
        else pyImport(n);
        continue;
      case "import_from_statement":
        pyFromImport(n);
        continue;
      case "import_declaration":
        goImport(n);
        continue;
      case "package_clause":
        facts.pkg = n.namedChildren.find((c) => c.type === "package_identifier")?.text ?? null;
        continue;
      case "function_declaration":
      case "generator_function_declaration":
      case "function_definition": {
        const name = n.childForFieldName("name")?.text ?? (it.exp === "default" ? "default" : null);
        const allowed = lang === "python" ? it.cls !== null || it.owner === mod : topLevel(it);
        if (!name || !allowed) break;
        let kind: SymbolKind = "function";
        let qualified = name;
        if (lang === "python" && it.cls !== null) {
          kind = "method";
          qualified = `${it.cls}.${name}`;
        } else if (js && isComponent(name, n)) kind = "component";
        const id = define(qualified, kind, it.outer ?? n, name);
        if (it.exp) facts.exports[it.exp === "default" ? "default" : name] = name;
        const body = n.childForFieldName("body");
        if (body) push(body, it, { owner: id, cls: null });
        continue;
      }
      case "method_declaration": {
        const name = n.childForFieldName("name")?.text;
        const recv = goReceiver(n);
        if (!name) break;
        const qualified = recv ? `${recv.type}.${name}` : name;
        const id = define(qualified, recv ? "method" : "function", n, name);
        if (recv) facts.receivers[id] = recv;
        const body = n.childForFieldName("body");
        if (body) push(body, it, { owner: id, cls: null });
        continue;
      }
      case "type_spec": {
        const t = n.childForFieldName("type")?.type;
        const name = n.childForFieldName("name")?.text;
        if (name && (t === "struct_type" || t === "interface_type") && topLevel(it))
          define(name, "class", n.parent?.type === "type_declaration" ? n.parent : n, name);
        continue;
      }
      case "class_declaration":
      case "abstract_class_declaration":
      case "class_definition": {
        const name = n.childForFieldName("name")?.text ?? (it.exp === "default" ? "default" : null);
        const allowed = lang === "python" ? it.cls !== null || it.owner === mod : topLevel(it);
        if (!name || !allowed) break;
        const qualified = lang === "python" && it.cls !== null ? `${it.cls}.${name}` : name;
        const heritage = n.namedChildren.find((c) => c.type === "class_heritage")?.text ?? "";
        const kind: SymbolKind = /\b(React\.)?(Pure)?Component\b/.test(heritage)
          ? "component"
          : "class";
        const id = define(qualified, kind, it.outer ?? n, name);
        if (it.exp) facts.exports[it.exp === "default" ? "default" : name] = name;
        const body = n.childForFieldName("body");
        if (body) push(body, it, { owner: id, cls: qualified });
        continue;
      }
      case "method_definition":
      case "public_field_definition":
      case "field_definition": {
        if (it.cls === null) break;
        const nameNode = n.childForFieldName("name") ?? n.childForFieldName("property");
        const value = n.childForFieldName("value");
        const isMethod = n.type === "method_definition";
        if (!nameNode || !(isMethod || (value && FUNCTION_VALUES.has(value.type)))) break;
        const id = define(`${it.cls}.${nameNode.text}`, "method", n, nameNode.text);
        const body = isMethod ? n.childForFieldName("body") : value;
        if (body) push(body, it, { owner: id, cls: null });
        continue;
      }
      case "lexical_declaration":
      case "variable_declaration": {
        const decls = n.namedChildren.filter((c) => c.type === "variable_declarator");
        for (let i = decls.length - 1; i >= 0; i--) {
          const d = decls[i];
          const nameNode = d.childForFieldName("name");
          const value = d.childForFieldName("value");
          if (!value) continue;
          if (jsRequire(value, nameNode)) continue;
          const range = decls.length > 1 ? d : (it.outer ?? n);
          if (nameNode?.type === "identifier" && jsFunctionValue(it, nameNode.text, value, range))
            continue;
          push(value, it);
        }
        continue;
      }
      case "assignment_expression":
        if (js && cjsAssign(it)) continue;
        break;
      case "call_expression": {
        const fn = n.childForFieldName("function");
        if (!fn) break;
        if (js && fn.type === "identifier" && fn.text === "require" && jsRequire(n, null)) continue;
        if (js && fn.type === "import") {
          const arg = n.childForFieldName("arguments")?.namedChild(0);
          if (arg?.type === "string") facts.imports.push({ spec: unquote(arg.text), bindings: [] });
        } else if (fn.type === "identifier") call(it, n, fn.text, undefined, "call");
        else if (
          fn.type === "member_expression" ||
          fn.type === "attribute" ||
          fn.type === "selector_expression"
        ) {
          const obj = fn.childForFieldName("object") ?? fn.childForFieldName("operand");
          const prop =
            fn.childForFieldName("property") ??
            fn.childForFieldName("attribute") ??
            fn.childForFieldName("field");
          if (prop && obj?.type !== "super") call(it, n, prop.text, chain(obj), "call");
        }
        break;
      }
      case "call": {
        const fn = n.childForFieldName("function");
        if (fn?.type === "identifier") call(it, n, fn.text, undefined, "call");
        else if (fn?.type === "attribute") {
          const attr = fn.childForFieldName("attribute");
          if (attr) call(it, n, attr.text, chain(fn.childForFieldName("object")), "call");
        }
        break;
      }
      case "new_expression": {
        const c = n.childForFieldName("constructor");
        if (c?.type === "identifier") call(it, n, c.text, undefined, "new");
        else if (c?.type === "member_expression") {
          const prop = c.childForFieldName("property");
          if (prop) call(it, n, prop.text, chain(c.childForFieldName("object")), "new");
        }
        break;
      }
      case "jsx_opening_element":
      case "jsx_self_closing_element": {
        const name = n.childForFieldName("name");
        if (name?.type === "identifier" && /^[A-Z]/.test(name.text))
          call(it, n, name.text, undefined, "jsx");
        else if (name?.type === "member_expression") {
          const prop = name.childForFieldName("property");
          if (prop && /^[A-Z]/.test(prop.text))
            call(it, n, prop.text, chain(name.childForFieldName("object")), "jsx");
        }
        break;
      }
    }
    pushChildren(it);
  }

  finish(facts, lang);
  return facts;
}

/** Fills `exports` for languages that export by naming rule and sets `exported` on every symbol. */
function finish(f: FileFacts, lang: Lang) {
  const top = f.symbols.filter((s) => !s.qualifiedName.includes("."));
  if (lang === "python")
    for (const s of top) if (!s.name.startsWith("_")) f.exports[s.name] = s.name;
  if (lang === "go") for (const s of top) if (/^\p{Lu}/u.test(s.name)) f.exports[s.name] = s.name;
  const exported = new Set(Object.values(f.exports));
  for (const s of f.symbols) {
    const dot = s.qualifiedName.indexOf(".");
    if (dot < 0) s.exported = exported.has(s.name);
    else {
      const open = lang === "go" ? /^\p{Lu}/u.test(s.name) : !s.name.startsWith("_");
      s.exported = exported.has(s.qualifiedName.slice(0, dot)) && open;
    }
  }
  // Go methods are `Type.Method` without a class symbol to hang off: exported by name.
  if (lang === "go")
    for (const s of f.symbols) if (s.kind === "method") s.exported = /^\p{Lu}/u.test(s.name);
}
