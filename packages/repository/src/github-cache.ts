import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { type Content, contentSchema } from "@traceframe/schema";

/**
 * Sanitized local cache for GitHub reads.
 *
 * Entries are sanitized before they reach this module and are keyed by
 * repository, resolved commit and path, so a moved ref cannot serve stale
 * content. The directory is private (0700/0600); malformed entries are ignored
 * rather than trusted, and clearing is scoped by repository when requested.
 */

export type CacheIdentity = {
  repositoryId: string;
  commit: string;
  path: string;
};

export type CachedBlob = {
  identity: CacheIdentity;
  content: Content;
  fetchedAt: string;
};

export type GithubCache = {
  read(identity: CacheIdentity): CachedBlob | null;
  write(identity: CacheIdentity, content: Content, fetchedAt?: string): void;
  clearRepository(repositoryId: string): number;
  clear(): number;
};

const VERSION = 1;
const SOURCE = "github_rest";

function key(identity: CacheIdentity): string {
  return createHash("sha256")
    .update(`${identity.repositoryId}\n${identity.commit}\n${identity.path}`, "utf8")
    .digest("hex");
}

function entryFile(directory: string, identity: CacheIdentity): string {
  return join(directory, `${key(identity)}.json`);
}

function valid(value: unknown): value is CachedBlob & { version: 1; source: string } {
  if (value === null || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  const identity = entry.identity as Record<string, unknown> | undefined;
  if (entry.version !== VERSION || entry.source !== SOURCE) return false;
  if (typeof entry.fetchedAt !== "string") return false;
  if (
    !identity ||
    typeof identity.repositoryId !== "string" ||
    typeof identity.commit !== "string" ||
    typeof identity.path !== "string"
  )
    return false;
  return contentSchema.safeParse(entry.content).success;
}

export function githubCache(directory: string): GithubCache {
  const privateDirectory = () => {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
  };
  const files = () => (existsSync(directory) ? readdirSync(directory) : []);
  return {
    read(identity) {
      const file = entryFile(directory, identity);
      if (!existsSync(file)) return null;
      try {
        const entry: unknown = JSON.parse(readFileSync(file, "utf8"));
        if (!valid(entry)) return null;
        if (
          entry.identity.repositoryId !== identity.repositoryId ||
          entry.identity.commit !== identity.commit ||
          entry.identity.path !== identity.path
        )
          return null;
        return { identity: entry.identity, content: entry.content, fetchedAt: entry.fetchedAt };
      } catch {
        return null;
      }
    },
    write(identity, content, fetchedAt = new Date().toISOString()) {
      const checked = contentSchema.parse(content);
      privateDirectory();
      const file = entryFile(directory, identity);
      const temporary = `${file}.${randomUUID()}.tmp`;
      writeFileSync(
        temporary,
        JSON.stringify({
          version: VERSION,
          source: SOURCE,
          identity,
          content: checked,
          fetchedAt,
        }),
        { mode: 0o600 },
      );
      renameSync(temporary, file);
    },
    clearRepository(repositoryId) {
      let removed = 0;
      for (const name of files()) {
        if (!name.endsWith(".json")) continue;
        const file = join(directory, name);
        try {
          const entry = JSON.parse(readFileSync(file, "utf8")) as {
            identity?: { repositoryId?: unknown };
          } | null;
          if (entry?.identity?.repositoryId === repositoryId) {
            unlinkSync(file);
            removed += 1;
          }
        } catch {
          // Unreadable cache entries are left for the user to inspect.
        }
      }
      return removed;
    },
    clear() {
      let removed = 0;
      for (const name of files()) {
        if (!name.endsWith(".json")) continue;
        unlinkSync(join(directory, name));
        removed += 1;
      }
      return removed;
    },
  };
}
