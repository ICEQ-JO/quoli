import { posix } from "node:path";
import type { Stack } from "../../shared/model.ts";

/** Languages counted for the share; markup and data formats are left out. */
const LANGUAGES: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".swift": "Swift",
  ".c": "C",
  ".h": "C",
  ".cpp": "C++",
  ".cc": "C++",
  ".hpp": "C++",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".sql": "SQL",
};

const MANIFESTS =
  /(^|\/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|Gemfile|composer\.json)$/;

type Deps = Map<string, string | null>;
type Reader = (path: string) => string | null;

/** Dependencies of one manifest as lowercase name to version (null when the file gives none). */
function dependencies(file: string, text: string): { deps: Deps; name: string | null } {
  const deps: Deps = new Map();
  const base = posix.basename(file);
  let name: string | null = null;
  if (base === "package.json" || base === "composer.json") {
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      if (typeof j.name === "string") name = j.name;
      for (const key of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "require",
        "require-dev",
      ]) {
        const block = j[key];
        if (block && typeof block === "object")
          for (const [k, v] of Object.entries(block))
            deps.set(k.toLowerCase(), typeof v === "string" ? v : null);
      }
    } catch {
      // A broken manifest simply yields nothing.
    }
  } else if (base.startsWith("requirements")) {
    for (const m of text.matchAll(
      /^\s*([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*(?:[=<>~!]=?\s*([^\s;#,]+))?/gm,
    ))
      deps.set(m[1].toLowerCase().replace(/_/g, "-"), m[2] ?? null);
  } else if (base === "pyproject.toml") {
    name = /^\s*name\s*=\s*"([^"]+)"/m.exec(text)?.[1] ?? null;
    for (const m of text.matchAll(/["']([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*([<>=~!][^"']*)?["']/g))
      deps.set(m[1].toLowerCase().replace(/_/g, "-"), m[2]?.trim() ?? null);
    for (const m of text.matchAll(
      /^([A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]*)"|\{[^}\n]*version\s*=\s*"([^"]*)")/gm,
    ))
      deps.set(m[1].toLowerCase().replace(/_/g, "-"), m[2] ?? m[3] ?? null);
  } else if (base === "go.mod") {
    name = /^module\s+(\S+)/m.exec(text)?.[1] ?? null;
    for (const m of text.matchAll(/^\s*(?:require\s+)?([\w.~-]+\.[\w.~/-]+)\s+(v[\w.+-]+)/gm))
      deps.set(m[1].toLowerCase(), m[2]);
  } else if (base === "Cargo.toml") {
    name = /\[package\][^[]*?\bname\s*=\s*"([^"]+)"/s.exec(text)?.[1] ?? null;
    for (const m of text.matchAll(/^([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]+)"|\{([^}\n]*)\})/gm))
      deps.set(m[1].toLowerCase(), m[2] ?? /version\s*=\s*"([^"]+)"/.exec(m[3] ?? "")?.[1] ?? null);
  } else if (base === "pom.xml") {
    for (const m of text.matchAll(
      /<artifactId>([^<]+)<\/artifactId>\s*(?:<version>([^<]+)<\/version>)?/g,
    ))
      deps.set(m[1].trim().toLowerCase(), m[2]?.trim() ?? null);
  } else if (base.startsWith("build.gradle")) {
    for (const m of text.matchAll(/["']([\w.-]+):([\w.-]+)(?::([\w.${}-]+))?["']/g))
      deps.set(`${m[1]}:${m[2]}`.toLowerCase(), m[3] ?? null);
  } else if (base === "Gemfile") {
    for (const m of text.matchAll(/^\s*gem\s+["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/gm))
      deps.set(m[1].toLowerCase(), m[2] ?? null);
  }
  return { deps, name };
}

/** Framework name to the dependency names that prove it. JVM entries match as substrings. */
const FRAMEWORKS: [string, string[]][] = [
  ["Next.js", ["next"]],
  ["React", ["react"]],
  ["Vue", ["vue"]],
  ["Nuxt", ["nuxt"]],
  ["Svelte", ["svelte"]],
  ["SvelteKit", ["@sveltejs/kit"]],
  ["Angular", ["@angular/core"]],
  ["Express", ["express"]],
  ["Hono", ["hono"]],
  ["Fastify", ["fastify"]],
  ["NestJS", ["@nestjs/core"]],
  ["Prisma", ["prisma", "@prisma/client"]],
  ["Drizzle", ["drizzle-orm"]],
  ["TypeORM", ["typeorm"]],
  ["FastAPI", ["fastapi"]],
  ["Flask", ["flask"]],
  ["Django", ["django"]],
  ["SQLAlchemy", ["sqlalchemy"]],
  ["gin", ["github.com/gin-gonic/gin"]],
  ["chi", ["github.com/go-chi/chi"]],
  ["echo", ["github.com/labstack/echo"]],
  ["Fiber", ["github.com/gofiber/fiber"]],
  ["GORM", ["gorm.io/gorm"]],
  ["axum", ["axum"]],
  ["Actix Web", ["actix-web"]],
  ["Rocket", ["rocket"]],
  ["Diesel", ["diesel"]],
  ["Spring", ["org.springframework.boot:", "spring-boot", "org.springframework:"]],
  ["Rails", ["rails"]],
  ["Sinatra", ["sinatra"]],
  ["Laravel", ["laravel/framework"]],
  ["Symfony", ["symfony/framework-bundle"]],
];

function matches(deps: Deps, keys: string[], jvm: boolean): string | null {
  for (const k of keys) {
    if (deps.has(k)) return k;
    for (const d of deps.keys()) if (d.startsWith(`${k}/`) || (jvm && d.includes(k))) return d;
  }
  return null;
}

/**
 * Languages, frameworks and packages from file names and manifests. Every framework carries the
 * manifest it was read from; nothing is inferred from source code.
 */
export function detectStack(paths: string[], read: Reader): Stack {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const lang = LANGUAGES[posix.extname(p).toLowerCase()];
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const languages = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, files]) => ({ name, files, share: Math.round((files / total) * 1000) / 1000 }));

  const manifests = paths
    .filter((p) => MANIFESTS.test(p))
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))
    .slice(0, 300);
  const frameworks: Stack["frameworks"] = [];
  const packages: Stack["packages"] = [];
  const seen = new Set<string>();
  const parsed = manifests.map((m) => {
    const text = read(m);
    return {
      path: m,
      ...(text === null ? { deps: new Map() as Deps, name: null } : dependencies(m, text)),
    };
  });
  const packageOf = new Map<string, number>();
  for (const m of parsed) {
    const dir = posix.dirname(m.path) === "." ? "" : posix.dirname(m.path);
    const base = posix.basename(m.path);
    const isPackage = [
      "package.json",
      "go.mod",
      "pyproject.toml",
      "Cargo.toml",
      "composer.json",
    ].includes(base);
    if (isPackage && !packageOf.has(dir)) {
      packageOf.set(dir, packages.length);
      packages.push({
        name: m.name ?? (posix.basename(dir) || "(root)"),
        path: dir || ".",
        framework: null,
      });
    }
    const jvm = base === "pom.xml" || base.startsWith("build.gradle");
    for (const [name, keys] of FRAMEWORKS) {
      const dep = matches(m.deps, keys, jvm);
      if (!dep) continue;
      const pkgIndex = packageOf.get(dir);
      const pkg = pkgIndex === undefined ? null : packages[pkgIndex].name;
      const key = `${name}|${pkg ?? m.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      frameworks.push({ name, version: m.deps.get(dep) ?? null, package: pkg, evidence: m.path });
      if (pkgIndex !== undefined && packages[pkgIndex].framework === null)
        packages[pkgIndex].framework = name;
    }
  }
  return { languages, frameworks: frameworks.slice(0, 80), packages: packages.slice(0, 200) };
}
