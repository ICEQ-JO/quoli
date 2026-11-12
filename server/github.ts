import { git } from "./ingest.ts";

/**
 * `owner/repo` from a GitHub remote URL (https, ssh or scp-style), or null for anything else.
 * Only github.com is recognised; GitHub Enterprise hosts are not.
 */
export function parseGithubRemote(url: string): string | null {
  const m =
    /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com(?::\d+)?\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(
      url.trim(),
    );
  return m ? `${m[1]}/${m[2]}` : null;
}

const cache = new Map<string, { repo: string | null; at: number }>();
const TTL = 60_000;

/** The GitHub `owner/repo` of a repository's `origin` remote, cached for a minute. */
export function githubRepo(root: string, now = Date.now()): string | null {
  const hit = cache.get(root);
  if (hit && now - hit.at < TTL) return hit.repo;
  const url = git(root, ["remote", "get-url", "origin"]);
  const repo = url ? parseGithubRemote(url) : null;
  cache.set(root, { repo, at: now });
  return repo;
}
