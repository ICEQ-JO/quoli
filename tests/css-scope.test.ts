import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const files = (dir: string, ext: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(dir, e.name), ext)
      : e.name.endsWith(ext)
        ? [join(dir, e.name)]
        : [],
  );

/** The first class of every selector in a stylesheet: `.a .b, .c > d {` gives a and c. */
function leadingClasses(css: string): Set<string> {
  const out = new Set<string>();
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of bare.matchAll(/(^|})\s*([^{}@]+)\{/g)) {
    for (const sel of m[2].split(",")) {
      const first = /^\s*\.([a-zA-Z][\w-]*)/.exec(sel);
      if (first) out.add(first[1]);
    }
  }
  return out;
}

const classNames = (tsx: string) =>
  new Set(
    [...tsx.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g)].flatMap((m) =>
      (m[1] ?? m[2]).split(/\s+/).filter((c) => /^[a-zA-Z][\w-]*$/.test(c)),
    ),
  );

// Deliberate: these lenses style their own parts of the shared details panel.
const ALLOWED = new Set([
  "web/src/lenses/git/git.css: .g-ref",
  "web/src/lenses/git/git.css: .ref-list",
  "web/src/lenses/git/git.css: .commit-files",
  "web/src/lenses/git/git.css: .cf-path",
  "web/src/lenses/git/git.css: .cf-n",
  "web/src/lenses/infra/infra.css: .inspector",
]);

test("lens stylesheets never restyle classes the pages and shared components use", () => {
  const shared = new Set(
    [...files("web/src/pages", ".tsx"), ...files("web/src/components", ".tsx")].flatMap((f) => [
      ...classNames(readFileSync(f, "utf8")),
    ]),
  );
  // Every lens CSS file is bundled into the whole app, so a rule that starts with a class a
  // page uses restyles that page too (0.2.6: `.review` covered the dashboard's review list).
  const clashes = files("web/src/lenses", ".css")
    .flatMap((f) =>
      [...leadingClasses(readFileSync(f, "utf8"))]
        .filter((c) => shared.has(c))
        .map((c) => `${f}: .${c}`),
    )
    .filter((c) => !ALLOWED.has(c));
  assert.deepEqual(clashes, []);
});
