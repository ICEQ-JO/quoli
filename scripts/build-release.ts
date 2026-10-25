import { execFile } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { artifactDigest, signingKey, signManifest } from "../apps/cli/src/release";
import { releaseManifestSchema } from "../packages/schema/src/release";
import { STORAGE_VERSION } from "../packages/storage/src/migrations";
import { releaseArchive } from "./release-archive";
import { releaseSource } from "./release-source";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const destination = join(root, "dist/quoli");
const releaseBuild = ".next-release";
const signed = process.argv.includes("--signed");
if (process.argv.slice(2).some((arg) => arg !== "--signed"))
  throw new Error("Use release:local or release:signed.");
const keyFile = process.env.QUOLI_SIGNING_KEY_FILE;
delete process.env.QUOLI_SIGNING_KEY_FILE;
const provenance = releaseSource(root, signed);
const { version, source, toolchain } = provenance;
const key = signed ? signingKey(keyFile ?? "", root) : null;
const buildEnvironment: NodeJS.ProcessEnv = signed
  ? {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      PNPM_HOME: process.env.PNPM_HOME,
      LC_ALL: "C",
      TZ: "UTC",
    }
  : { ...process.env };
delete buildEnvironment.QUOLI_SIGNING_KEY_FILE;
delete buildEnvironment.QUOLI_BUILD_ID;
if (signed) buildEnvironment.QUOLI_BUILD_ID = source.commit;
await exec("pnpm", ["build"], {
  cwd: root,
  env: {
    ...buildEnvironment,
    QUOLI_STANDALONE: "1",
    TRACEFRAME_NEXT_DIR: releaseBuild,
    NEXT_TELEMETRY_DISABLED: "1",
  },
  maxBuffer: 4 * 1024 * 1024,
});
rmSync(destination, { recursive: true, force: true });
mkdirSync(join(destination, "runtime"), { recursive: true });
const analysisRequire = createRequire(join(root, "packages/analysis/package.json"));
const treeSitterWasm = dirname(
  analysisRequire.resolve("@vscode/tree-sitter-wasm/wasm/tree-sitter.wasm"),
);
mkdirSync(join(destination, "runtime/wasm"), { recursive: true });
for (const file of [
  "tree-sitter.js",
  "tree-sitter.wasm",
  "tree-sitter-typescript.wasm",
  "tree-sitter-tsx.wasm",
]) {
  cpSync(join(treeSitterWasm, file), join(destination, "runtime/wasm", file));
}
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
  ["apps/bridge/src/opencode-entry.ts", "runtime/quoli-opencode-v1.mjs"],
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
      storageVersion: STORAGE_VERSION,
      builtAt: new Date(source.epoch * 1000).toISOString(),
      channel: signed ? "signed" : "local-unsigned",
      source,
      toolchain,
    },
    null,
    2,
  ),
);
writeFileSync(
  join(destination, "README.txt"),
  "Quoli local release\nRequires Node 24.16+ within Node 24, Git and Linux.\nInstall: node cli.mjs install\nThen: quoli connect /path/to/repo --capture-code\nNo registry publication or remote installer is implied.\nUse quoli help for lifecycle and login-startup commands.\n",
);

await build({
  absWorkingDir: root,
  entryPoints: ["scripts/verify-release.ts"],
  outfile: join(root, "dist/verify-release.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: false,
});
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
if (signed && JSON.stringify(releaseSource(root, true)) !== JSON.stringify(provenance))
  throw new Error("Release inputs changed during the build.");
for (const sidecar of [".manifest.json", ".sig", ".sha256"])
  rmSync(`${archive}${sidecar}`, { force: true });
await releaseArchive(destination, archive, source.epoch);
const { sha256: checksum, bytes } = await artifactDigest(archive);
writeFileSync(`${archive}.sha256`, `${checksum}  ${archive.split("/").at(-1)}\n`);
if (key) {
  signManifest(
    archive,
    releaseManifestSchema.parse({
      format: 1,
      product: "quoli",
      version,
      platform: process.platform,
      arch: process.arch,
      node: ">=24.16.0 <25",
      storageVersion: STORAGE_VERSION,
      source,
      toolchain,
      archive: { name: archive.split("/").at(-1), bytes, sha256: checksum },
    }),
    key,
  );
}
console.log(
  `Built ${relative(root, archive)} (${files} files; ${signed ? "signed" : "local unsigned"}). SHA-256: ${checksum}`,
);
