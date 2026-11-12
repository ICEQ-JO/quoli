// Builds the publishable npm package `quoli` into ./release (`pnpm pack:release`):
//   release/package.json   name, version, `quoli` command, Node engine; no dependencies
//   release/server/        the server bundled by esbuild (cli.mjs + chunks), plus the hook,
//                          OpenCode plugin and Pi extension that `quoli setup` installs
//   release/dist/          the built web app (app, class page; the landing page is left out)
//   release/README.md
// Source files, tests, docs, the Supabase schema and anything private stay out. Run
// `npm pack --dry-run ./release` to see exactly what would be published.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "release");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "server"), { recursive: true });

// 1. The web app (app + class page + landing), built fresh.
execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
cpSync(join(root, "dist"), join(out, "dist"), {
  recursive: true,
  filter: (src) => !src.includes(`${join(root, "dist", "landing")}`),
});

// 2. The server, one ESM bundle with chunks so `quoli setup` does not load the web server.
await build({
  entryPoints: { cli: join(root, "server", "cli.ts") },
  outdir: join(out, "server"),
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node22",
  outExtension: { ".js": ".mjs" },
  // vite is only imported in development, never when NODE_ENV is production (cli.ts sets it).
  external: ["vite"],
  define: {
    "process.env.QUOLI_BUNDLED": '"1"',
    "process.env.QUOLI_VERSION": JSON.stringify(pkg.version),
  },
  banner: {
    js: 'import { createRequire as __quoliRequire } from "node:module";\nconst require = __quoliRequire(import.meta.url);',
  },
  legalComments: "none",
  logLevel: "warning",
});

// 3. Files `quoli setup` copies into each agent's configuration, read beside the bundle.
for (const f of ["hook.mjs", "opencode-plugin.js", "pi-extension.ts"]) {
  cpSync(join(root, "server", f), join(out, "server", f));
}

// 4. package.json and README for npm.
writeFileSync(
  join(out, "package.json"),
  `${JSON.stringify(
    {
      name: "@iceq/quoli",
      version: pkg.version,
      description:
        "One local map of what your coding agents did: Claude Code, Codex, OpenCode and Pi sessions, cost, failures and loops.",
      license: "UNLICENSED",
      publishConfig: { access: "public" },
      homepage: "https://iceq.best",
      type: "module",
      bin: { quoli: "server/cli.mjs" },
      engines: { node: ">=22.13" },
      keywords: ["claude-code", "codex", "opencode", "coding-agents", "observability"],
      files: ["server", "dist", "README.md"],
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  join(out, "README.md"),
  `# Quoli

One local map of what your coding agents did: every Claude Code, Codex, OpenCode and Pi session,
what it changed, what it cost, what failed and where it looped.

\`\`\`sh
npx @iceq/quoli setup   # once: records every repository for the agents on this machine
npx @iceq/quoli         # open http://127.0.0.1:4400
\`\`\`

- Requires Node.js 22.13 or newer.
- Everything stays on your machine in \`~/.quoli\`. The only outbound request is a daily download of
  public model prices from models.dev, and, only if you turn it on, Class sync, which shares
  session summaries (never prompts or code) with your class.
- \`npx @iceq/quoli setup --remove\` takes Quoli out of every agent again. \`npx @iceq/quoli --help\` lists the rest.

More: https://iceq.best
`,
);

if (!existsSync(join(out, "server", "cli.mjs"))) throw new Error("bundle missing");
console.log(`\nBuilt quoli ${pkg.version} in ${out}`);
