import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { releaseVersionSchema } from "../packages/schema/src/release";

export function releaseSource(root: string, signed: boolean) {
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const version = releaseVersionSchema.parse(pkg.version);
  const commit = git("rev-parse", "HEAD");
  const epoch = Number(git("show", "-s", "--format=%ct", "HEAD"));
  const clean = git("status", "--porcelain", "--untracked-files=normal") === "";
  const tags = git("tag", "--points-at", "HEAD").split("\n");
  const tag = tags.includes(`v${version}`) ? `v${version}` : null;
  if (signed && (!clean || !tag))
    throw new Error(
      "Signed releases require a clean checkout at the package.json version tag (vX.Y.Z).",
    );
  if (
    signed &&
    [root, join(root, "apps/web")].some((dir) =>
      [".env", ".env.local", ".env.production", ".env.production.local"].some((name) =>
        existsSync(join(dir, name)),
      ),
    )
  )
    throw new Error("Signed builds refuse local environment files; use a clean release checkout.");
  const pnpm = execFileSync("pnpm", ["--version"], { cwd: root, encoding: "utf8" }).trim();
  if (
    signed &&
    (process.platform !== "linux" ||
      process.arch !== "x64" ||
      process.versions.node !== "24.16.0" ||
      pnpm !== "11.12.0" ||
      pkg.packageManager !== "pnpm@11.12.0")
  )
    throw new Error("Signed builds require Linux x64, Node 24.16.0 and pinned pnpm 11.12.0.");
  return {
    version: signed ? version : `${version}-local`,
    source: { commit, epoch, tag, clean },
    toolchain: {
      node: process.versions.node,
      pnpm,
      lockSha256: createHash("sha256")
        .update(readFileSync(join(root, "pnpm-lock.yaml")))
        .digest("hex"),
    },
  };
}
