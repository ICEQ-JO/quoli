import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const destination = join(root, "dist/quoli");
const releaseBuild = ".next-release";
const version = "0.1.0-local";
await exec("pnpm", ["build"], {
  cwd: root,
  env: {
    ...process.env,
    QUOLI_STANDALONE: "1",
    TRACEFRAME_NEXT_DIR: releaseBuild,
    NEXT_TELEMETRY_DISABLED: "1",
  },
  maxBuffer: 4 * 1024 * 1024,
});
rmSync(destination, { recursive: true, force: true });
mkdirSync(join(destination, "runtime"), { recursive: true });
const standalone = join(root, "apps/web", releaseBuild, "standalone");
if (!existsSync(join(standalone, "apps/web/server.js")))
  throw new Error("Standalone server layout was not generated as expected.");
cpSync(standalone, join(destination, "web"), { recursive: true, verbatimSymlinks: true });
cpSync(
  join(root, "apps/web", releaseBuild, "static"),
  join(destination, "web/apps/web", releaseBuild, "static"),
  { recursive: true },
);
if (existsSync(join(root, "apps/web/public")))
  cpSync(join(root, "apps/web/public"), join(destination, "web/apps/web/public"), {
    recursive: true,
  });
cpSync(join(root, "packages/storage/migrations"), join(destination, "migrations"), {
  recursive: true,
});
for (const [entry, output] of [
  ["apps/cli/src/index.ts", "cli.mjs"],
  ["apps/cli/src/supervisor-entry.ts", "runtime/supervisor.mjs"],
  ["apps/cli/src/web-entry.ts", "runtime/web.mjs"],
  ["apps/collector/src/index.ts", "runtime/collector.mjs"],
  ["scripts/setup.ts", "runtime/connect.mjs"],
  ["scripts/settings.ts", "runtime/settings.mjs"],
  ["apps/bridge/src/index.ts", "runtime/quoli-hook-v1.mjs"],
]) {
  await build({
    absWorkingDir: root,
    entryPoints: [entry],
    outfile: join(destination, output),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    sourcemap: false,
    banner: {
      js: 'import { createRequire as __quoliRequire } from "node:module"; const require = __quoliRequire(import.meta.url);',
    },
  });
}
chmodSync(join(destination, "cli.mjs"), 0o755);
writeFileSync(
  join(destination, "release.json"),
  JSON.stringify(
    {
      format: 1,
      version,
      platform: process.platform,
      arch: process.arch,
      node: ">=24.16.0 <25",
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
writeFileSync(
  join(destination, "README.txt"),
  "Quoli local release\nRequires Node 24.16+ within Node 24, Git and Linux.\nInstall: node cli.mjs install\nThen: quoli connect /path/to/repo --capture-code\nNo registry publication or remote installer is implied.\nUse quoli help for lifecycle and login-startup commands.\n",
);

let files = 0;
function inspect(directory: string) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry),
      stat = lstatSync(path);
    if (/^(?:\.env(?:\..*)?|credential|.*\.(?:sqlite|db)(?:-.*)?)$/.test(entry))
      throw new Error("Private runtime data or an environment file entered the release.");
    if (stat.isSymbolicLink()) {
      const target = realpathSync(path);
      if (target !== destination && !target.startsWith(`${destination}/`))
        throw new Error("Release contains an external symlink.");
    } else if (stat.isDirectory()) inspect(path);
    else files++;
  }
}
inspect(destination);
const archive = join(root, `dist/quoli-${version}-${process.platform}-${process.arch}.tar.gz`);
await exec("tar", ["-czf", archive, "-C", join(root, "dist"), "quoli"], { maxBuffer: 1024 * 1024 });
const checksum = createHash("sha256").update(readFileSync(archive)).digest("hex");
writeFileSync(`${archive}.sha256`, `${checksum}  ${archive.split("/").at(-1)}\n`);
console.log(`Built ${relative(root, archive)} (${files} files). SHA-256: ${checksum}`);
