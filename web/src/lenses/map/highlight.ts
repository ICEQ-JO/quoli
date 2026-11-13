/** A small syntax highlighter: comments, strings, numbers and keywords. No dependency. */

export type TokenClass = "c" | "s" | "n" | "k" | "";
export interface Token {
  cls: TokenClass;
  text: string;
}

const COMMON =
  "if else for while do switch case break continue return try catch finally throw new delete typeof instanceof in of await async yield class extends super this null true false void import from export default const let var function static public private protected readonly interface type enum implements as";
const PY =
  "def class return if elif else for while in not and or is import from as with try except finally raise pass break continue lambda yield None True False async await global nonlocal del assert self";
const GO =
  "func package import var const type struct interface map chan go defer select switch case default if else for range return break continue fallthrough nil true false make new";

interface Lang {
  keywords: Set<string>;
  line: string[];
  block: [string, string] | null;
  strings: string;
  /** Multi-line string delimiters. */
  triple: string[];
}

const words = (s: string) => new Set(s.split(" "));
const C_LIKE: Lang = {
  keywords: words(COMMON),
  line: ["//"],
  block: ["/*", "*/"],
  strings: "\"'`",
  triple: ["`"],
};
const LANGS: Record<string, Lang> = {
  py: { keywords: words(PY), line: ["#"], block: null, strings: "\"'", triple: ['"""', "'''"] },
  go: { keywords: words(GO), line: ["//"], block: ["/*", "*/"], strings: "\"'`", triple: ["`"] },
  sh: {
    keywords: words("if then else fi for do done while case esac function return in export"),
    line: ["#"],
    block: null,
    strings: "\"'",
    triple: [],
  },
  json: { keywords: words("true false null"), line: [], block: null, strings: '"', triple: [] },
  css: { keywords: new Set(), line: [], block: ["/*", "*/"], strings: "\"'", triple: [] },
  sql: {
    keywords: words(
      "select from where insert into values update set delete create table primary key references not null join left right inner on group by order limit and or as",
    ),
    line: ["--"],
    block: ["/*", "*/"],
    strings: "'\"",
    triple: [],
  },
};

export function languageOf(path: string): Lang {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "py") return LANGS.py;
  if (ext === "go") return LANGS.go;
  if (ext === "sh" || ext === "yml" || ext === "yaml" || ext === "toml") return LANGS.sh;
  if (ext === "json") return LANGS.json;
  if (ext === "css") return LANGS.css;
  if (ext === "sql" || ext === "prisma") return LANGS.sql;
  return C_LIKE;
}

type State = { kind: "block" } | { kind: "string"; close: string } | null;

/**
 * Tokens for every line. Block comments and multi-line strings carry over between lines. Lines are
 * cut at 600 characters so a minified file cannot freeze the reader.
 */
export function highlight(text: string, path: string): Token[][] {
  const lang = languageOf(path);
  const identifier = /[A-Za-z_$][\w$]*/y;
  const number = /\d[\d_.]*(?:e[+-]?\d+)?|0x[\da-f]+/iy;
  let state: State = null;
  return text.split("\n").map((raw) => {
    const line = raw.length > 600 ? `${raw.slice(0, 600)}…` : raw;
    const out: Token[] = [];
    const emit = (cls: TokenClass, s: string) => {
      if (!s) return;
      const last = out[out.length - 1];
      if (last && last.cls === cls) last.text += s;
      else out.push({ cls, text: s });
    };
    let i = 0;
    while (i < line.length) {
      if (state?.kind === "block") {
        const end = line.indexOf(lang.block?.[1] ?? "*/", i);
        if (end < 0) {
          emit("c", line.slice(i));
          return out;
        }
        emit("c", line.slice(i, end + 2));
        i = end + 2;
        state = null;
        continue;
      }
      if (state?.kind === "string") {
        const close = state.close;
        let j = i;
        while (j < line.length && !line.startsWith(close, j)) j += line[j] === "\\" ? 2 : 1;
        if (j >= line.length) {
          emit("s", line.slice(i));
          return out;
        }
        emit("s", line.slice(i, j + close.length));
        i = j + close.length;
        state = null;
        continue;
      }
      const rest = line.slice(i);
      if (lang.line.some((l) => rest.startsWith(l))) {
        emit("c", rest);
        break;
      }
      if (lang.block && rest.startsWith(lang.block[0])) {
        state = { kind: "block" };
        emit("c", lang.block[0]);
        i += lang.block[0].length;
        continue;
      }
      const triple = lang.triple.find((t) => t.length > 1 && rest.startsWith(t));
      const quote = triple ?? (lang.strings.includes(rest[0]) ? rest[0] : null);
      if (quote) {
        const keepOpen = triple !== undefined || (quote === "`" && lang.triple.includes("`"));
        let j = i + quote.length;
        while (j < line.length && !line.startsWith(quote, j)) j += line[j] === "\\" ? 2 : 1;
        if (j >= line.length) {
          emit("s", line.slice(i));
          if (keepOpen) state = { kind: "string", close: quote };
          break;
        }
        emit("s", line.slice(i, j + quote.length));
        i = j + quote.length;
        continue;
      }
      number.lastIndex = i;
      if (/\d/.test(rest[0]) && number.test(line)) {
        emit("n", line.slice(i, number.lastIndex));
        i = number.lastIndex;
        continue;
      }
      identifier.lastIndex = i;
      if (identifier.test(line)) {
        const w = line.slice(i, identifier.lastIndex);
        emit(lang.keywords.has(w) ? "k" : "", w);
        i = identifier.lastIndex;
        continue;
      }
      emit("", rest[0]);
      i++;
    }
    return out;
  });
}
