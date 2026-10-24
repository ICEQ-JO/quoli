import { z } from "zod";

export const releaseVersionSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const releaseManifestSchema = z
  .object({
    format: z.literal(1),
    product: z.literal("quoli"),
    version: releaseVersionSchema,
    platform: z.literal("linux"),
    arch: z.literal("x64"),
    node: z.literal(">=24.16.0 <25"),
    source: z
      .object({
        commit: z.string().regex(/^[a-f0-9]{40}$/),
        tag: z.string().max(100),
        epoch: z.number().int().nonnegative().max(253402300799),
        clean: z.literal(true),
      })
      .strict(),
    toolchain: z
      .object({ node: z.literal("24.16.0"), pnpm: z.literal("11.12.0"), lockSha256: digest })
      .strict(),
    archive: z
      .object({
        name: z.string().regex(/^quoli-[0-9]+\.[0-9]+\.[0-9]+-linux-x64\.tar\.gz$/),
        bytes: z
          .number()
          .int()
          .positive()
          .max(512 * 1024 * 1024),
        sha256: digest,
      })
      .strict(),
  })
  .strict()
  .refine(
    (m) =>
      m.source.tag === `v${m.version}` &&
      m.archive.name === `quoli-${m.version}-${m.platform}-${m.arch}.tar.gz`,
    "Release identity mismatch",
  );
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;
export const releaseSignatureSchema = z
  .object({
    format: z.literal(1),
    algorithm: z.literal("Ed25519"),
    keyId: digest,
    signature: z.string().regex(/^[a-f0-9]{128}$/),
  })
  .strict();
