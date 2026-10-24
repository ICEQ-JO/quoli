import type { CapturePolicy } from "@traceframe/schema";
import { isExcluded, sanitizeContent } from "@traceframe/schema/privacy";
import {
  type RepositoryBlobResult,
  type RepositoryComparisonResult,
  type RepositoryIdentity,
  type RepositoryReadLimits,
  type RepositoryRevision,
  type RepositoryTreeResult,
  repositoryRevisionSchema,
} from "@traceframe/schema/repository";
import { GitlabError } from "./gitlab";
import type { RemoteCache } from "./remote-cache";
import { decodeProviderContent, disabledContent } from "./remote-content";

/**
 * Read-only GitLab REST reads for refs, merge requests, trees, blobs and
 * comparisons.
 *
 * GitLab's documented API v4 is the contract. Content is sanitized by the
 * capture policy before it is cached or returned, and every failure becomes an
 * explicit read state instead of presenting a partial fetch as complete.
 */

export type GitlabPullRequest = {
  iid: number;
  title: string;
  state: string;
  draft: boolean;
  base: RepositoryRevision;
  head: RepositoryRevision;
};

export type GitlabReadRequest = {
  repository: RepositoryIdentity;
  revision: RepositoryRevision;
  limits: RepositoryReadLimits;
};

export type GitlabReadOptions = {
  token: string;
  baseUrl: string;
  cache: RemoteCache;
  policy: CapturePolicy;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export type GitlabReadFailure = "missing" | "denied" | "rate_limited" | "unavailable";

export class GitlabReadError extends Error {
  readonly state: GitlabReadFailure;
  readonly retryAfterSeconds: number | null;

  constructor(state: GitlabReadFailure, retryAfterSeconds: number | null = null) {
    super(`GitLab read failed: ${state}.`);
    this.name = "GitlabReadError";
    this.state = state;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type GitlabReads = {
  mergeRequest(repository: RepositoryIdentity, iid: number): Promise<GitlabPullRequest>;
  tree(request: GitlabReadRequest): Promise<RepositoryTreeResult>;
  blob(request: GitlabReadRequest & { path: string }): Promise<RepositoryBlobResult>;
  comparison(
    request: GitlabReadRequest & { base: RepositoryRevision; head: RepositoryRevision },
  ): Promise<RepositoryComparisonResult>;
};

type Fetched = { body: unknown; headers: Headers };

const PROJECT = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/;
const COMMIT = /^[a-f0-9]{40,64}$/;
const MAX_PAGES = 10;

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const string = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
function projectPath(repository: RepositoryIdentity): string {
  if (
    !PROJECT.test(repository.repositoryId) ||
    repository.repositoryId.split("/").some((part) => part === "." || part === "..")
  )
    throw new GitlabError("invalid", "Use a GitLab project as group/project.");
  return `/projects/${encodeURIComponent(repository.repositoryId)}`;
}

function encodePath(path: string): string {
  if (
    path.length === 0 ||
    path.length > 4096 ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  )
    throw new GitlabError("invalid", "Use a repository-relative file path.");
  return encodeURIComponent(path);
}

function retryDelay(headers: Headers, now: number): number | null {
  const retryAfter = headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isSafeInteger(seconds) && seconds > 0) return seconds;
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(1, Math.ceil((date - now) / 1000));
  }
  const reset = headers.get("ratelimit-reset");
  if (reset !== null) {
    const seconds = Number(reset);
    if (Number.isSafeInteger(seconds) && seconds >= 0) return Math.max(1, seconds);
  }
  const resetTime = headers.get("ratelimit-reset-time");
  if (resetTime !== null) {
    const date = Date.parse(resetTime);
    if (!Number.isNaN(date)) return Math.max(1, Math.ceil((date - now) / 1000));
  }
  return null;
}

function nextPage(headers: Headers): boolean {
  return (headers.get("x-next-page") ?? "") !== "";
}

export function gitlabReads(options: GitlabReadOptions): GitlabReads {
  const fetchImpl: typeof fetch = options.fetchImpl ?? fetch;
  const api = `${options.baseUrl.replace(/\/+$/, "")}/api/v4`;
  const now = options.now ?? Date.now;

  const get = async (path: string): Promise<Fetched> => {
    let response: Response;
    try {
      response = await fetchImpl(`${api}${path}`, {
        headers: { accept: "application/json", "private-token": options.token },
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new GitlabReadError("unavailable");
    }
    if (response.status === 401)
      throw new GitlabError("revoked", "GitLab rejected this token; it may be expired or revoked.");
    if (response.status === 404) throw new GitlabReadError("missing");
    if (response.status === 403) throw new GitlabReadError("denied");
    if (response.status === 429)
      throw new GitlabReadError("rate_limited", retryDelay(response.headers, now()));
    if (!response.ok) throw new GitlabReadError("unavailable");
    return { body: await response.json().catch(() => null), headers: response.headers };
  };

  const raw = async (
    path: string,
    maxBytes: number,
  ): Promise<{ bytes: Buffer | null; tooLarge: boolean }> => {
    let response: Response;
    try {
      response = await fetchImpl(`${api}${path}`, {
        headers: { accept: "application/octet-stream", "private-token": options.token },
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new GitlabReadError("unavailable");
    }
    if (response.status === 401)
      throw new GitlabError("revoked", "GitLab rejected this token; it may be expired or revoked.");
    if (response.status === 404) throw new GitlabReadError("missing");
    if (response.status === 403) throw new GitlabReadError("denied");
    if (response.status === 429)
      throw new GitlabReadError("rate_limited", retryDelay(response.headers, now()));
    if (!response.ok) throw new GitlabReadError("unavailable");
    const declared = Number(response.headers.get("content-length"));
    if (Number.isSafeInteger(declared) && declared > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      return { bytes: null, tooLarge: true };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return { bytes, tooLarge: bytes.length > maxBytes };
  };

  const resolve = async (
    repository: RepositoryIdentity,
    revision: RepositoryRevision,
  ): Promise<RepositoryRevision> => {
    const checked = repositoryRevisionSchema.parse(revision);
    if (checked.requestedPullRequest && !checked.requestedCommit) {
      if (checked.resolvedCommit) return checked;
      const request = await mergeRequest(repository, Number(checked.requestedPullRequest));
      return { ...checked, resolvedCommit: request.head.resolvedCommit, resolvedRef: null };
    }
    if (checked.requestedCommit) {
      if (!COMMIT.test(checked.requestedCommit))
        throw new GitlabError("invalid", "Use a full commit SHA.");
      return { ...checked, resolvedCommit: checked.requestedCommit };
    }
    if (!checked.requestedRef)
      throw new GitlabError("invalid", "A ref, commit or merge request is required.");
    const { body } = await get(
      `${projectPath(repository)}/repository/commits/${encodeURIComponent(checked.requestedRef)}`,
    );
    const commit = string(object(body)?.id);
    if (!commit) throw new GitlabReadError("unavailable");
    return { ...checked, resolvedRef: checked.requestedRef, resolvedCommit: commit };
  };

  const failure = (
    repository: RepositoryIdentity,
    revision: RepositoryRevision,
    error: GitlabReadError,
  ): {
    repository: RepositoryIdentity;
    revision: RepositoryRevision;
    state: GitlabReadFailure;
    omitted: number;
    retryAfterSeconds: number | null;
  } => ({
    repository,
    revision,
    state: error.state,
    omitted: 0,
    retryAfterSeconds: error.state === "rate_limited" ? error.retryAfterSeconds : null,
  });

  const mergeRequest = async (
    repository: RepositoryIdentity,
    iid: number,
  ): Promise<GitlabPullRequest> => {
    if (!Number.isSafeInteger(iid) || iid <= 0)
      throw new GitlabError("invalid", "Use a positive merge request number.");
    const { body } = await get(`${projectPath(repository)}/merge_requests/${iid}`);
    const request = object(body);
    const refs = object(request?.diff_refs);
    const baseSha = string(refs?.base_sha);
    const headSha = string(refs?.head_sha) ?? string(request?.sha);
    if (!request || !baseSha || !headSha) throw new GitlabReadError("unavailable");
    return {
      iid,
      title: string(request.title) ?? "",
      state: string(request.state) ?? "unknown",
      draft: request.draft === true || request.work_in_progress === true,
      base: {
        requestedRef: null,
        requestedCommit: baseSha,
        requestedPullRequest: null,
        resolvedRef: string(request.target_branch),
        resolvedCommit: baseSha,
      },
      head: {
        requestedRef: null,
        requestedCommit: headSha,
        requestedPullRequest: null,
        resolvedRef: string(request.source_branch),
        resolvedCommit: headSha,
      },
    };
  };

  return {
    mergeRequest,
    async tree(request) {
      try {
        const revision = await resolve(request.repository, request.revision);
        const commit = revision.resolvedCommit;
        if (!commit) throw new GitlabReadError("missing");
        const entries: RepositoryTreeResult["entries"] = [];
        let hasNext = false;
        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const { body, headers } = await get(
            `${projectPath(request.repository)}/repository/tree?ref=${commit}&recursive=true&per_page=100&page=${page}`,
          );
          for (const item of Array.isArray(body) ? body : []) {
            const entry = object(item);
            const path = string(entry?.path);
            if (!entry || !path) continue;
            const kind =
              entry.type === "blob"
                ? "file"
                : entry.type === "tree"
                  ? "directory"
                  : entry.type === "commit"
                    ? "submodule"
                    : null;
            if (kind) entries.push({ path, kind });
          }
          hasNext = nextPage(headers);
          if (!hasNext || entries.length >= request.limits.maxEntries) break;
        }
        const kept = entries.slice(0, request.limits.maxEntries);
        const omitted = entries.length - kept.length;
        return {
          repository: request.repository,
          revision,
          state: omitted > 0 || hasNext ? "truncated" : "available",
          omitted,
          retryAfterSeconds: null,
          entries: kept,
        };
      } catch (error) {
        if (error instanceof GitlabReadError)
          return { ...failure(request.repository, request.revision, error), entries: [] };
        throw error;
      }
    },
    async blob(request) {
      if (isExcluded(request.path, options.policy))
        return {
          repository: request.repository,
          revision: request.revision.requestedCommit
            ? { ...request.revision, resolvedCommit: request.revision.requestedCommit }
            : request.revision,
          state: "available",
          omitted: 0,
          retryAfterSeconds: null,
          path: request.path,
          content: disabledContent(),
        };
      try {
        const revision = await resolve(request.repository, request.revision);
        const commit = revision.resolvedCommit;
        if (!commit) throw new GitlabReadError("missing");
        const cached = options.cache.read({
          provider: "gitlab",
          repositoryId: request.repository.repositoryId,
          commit,
          path: request.path,
        });
        if (cached)
          return {
            repository: request.repository,
            revision,
            state: "available",
            omitted: 0,
            retryAfterSeconds: null,
            path: request.path,
            // Re-apply the current policy so a later read without code consent
            // cannot serve cached code.
            content: sanitizeContent(cached.content, options.policy, ["code"]),
          };
        const file = await raw(
          `${projectPath(request.repository)}/repository/files/${encodePath(request.path)}/raw?ref=${commit}`,
          request.limits.maxBytes,
        );
        if (file.tooLarge)
          return {
            repository: request.repository,
            revision,
            state: "truncated",
            omitted: 1,
            retryAfterSeconds: null,
            path: request.path,
            content: { text: null, state: "truncated", originalBytes: null, categories: ["code"] },
          };
        const content = decodeProviderContent(file.bytes ?? Buffer.alloc(0), options.policy);
        if (content.text !== null)
          options.cache.write(
            {
              provider: "gitlab",
              repositoryId: request.repository.repositoryId,
              commit,
              path: request.path,
            },
            content,
          );
        return {
          repository: request.repository,
          revision,
          state: "available",
          omitted: 0,
          retryAfterSeconds: null,
          path: request.path,
          content,
        };
      } catch (error) {
        if (error instanceof GitlabReadError)
          return {
            ...failure(request.repository, request.revision, error),
            path: request.path,
            content: null,
          };
        throw error;
      }
    },
    async comparison(request) {
      try {
        const base = await resolve(request.repository, request.base);
        const head = await resolve(request.repository, request.head);
        const baseCommit = base.resolvedCommit;
        const headCommit = head.resolvedCommit;
        if (!baseCommit || !headCommit) throw new GitlabReadError("missing");
        const { body } = await get(
          `${projectPath(request.repository)}/repository/compare?from=${baseCommit}&to=${headCommit}`,
        );
        const comparison = object(body);
        const diffs = Array.isArray(comparison?.diffs) ? comparison.diffs : [];
        const names = new Set<string>();
        for (const item of diffs) {
          const diff = object(item);
          const oldPath = string(diff?.old_path);
          const newPath = string(diff?.new_path);
          if (oldPath) names.add(oldPath);
          if (newPath) names.add(newPath);
        }
        const all = [...names];
        const paths = all.slice(0, request.limits.maxEntries);
        const omitted = Math.max(0, all.length - paths.length);
        const timedOut = comparison?.compare_timeout === true;
        return {
          repository: request.repository,
          revision: request.revision,
          state: omitted > 0 || timedOut ? "truncated" : "available",
          omitted,
          retryAfterSeconds: null,
          baseCommit,
          headCommit,
          paths,
        };
      } catch (error) {
        if (error instanceof GitlabReadError)
          return {
            ...failure(request.repository, request.revision, error),
            baseCommit: null,
            headCommit: null,
            paths: [],
          };
        throw error;
      }
    },
  };
}
