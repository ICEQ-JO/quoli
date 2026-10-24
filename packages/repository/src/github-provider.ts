import type { CapturePolicy, Content } from "@traceframe/schema";
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
import { GITHUB_ENDPOINTS, type GithubEndpoints, GithubError } from "./github";
import type { GithubCache } from "./github-cache";

/**
 * Read-only GitHub REST reads for branches, commits, pull requests, trees,
 * blobs and comparisons.
 *
 * Every response is bounded by the caller's limits, content is sanitized by the
 * capture policy before it is cached or returned, and failures become explicit
 * read states instead of pretending a partial fetch is complete. GitHub's
 * documented REST endpoints and headers are the contract; tests use local
 * recorded-shape responses.
 */

export type GithubPullRequest = {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  base: RepositoryRevision;
  head: RepositoryRevision;
};

export type GithubReadRequest = {
  repository: RepositoryIdentity;
  revision: RepositoryRevision;
  limits: RepositoryReadLimits;
};

export type GithubReadOptions = {
  token: string;
  cache: GithubCache;
  policy: CapturePolicy;
  endpoints?: GithubEndpoints;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export type GithubReadFailure = "missing" | "denied" | "rate_limited" | "unavailable";

export class GithubReadError extends Error {
  readonly state: GithubReadFailure;
  readonly retryAfterSeconds: number | null;

  constructor(state: GithubReadFailure, retryAfterSeconds: number | null = null) {
    super(`GitHub read failed: ${state}.`);
    this.name = "GithubReadError";
    this.state = state;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type GithubReads = {
  pullRequest(repository: RepositoryIdentity, number: number): Promise<GithubPullRequest>;
  tree(request: GithubReadRequest): Promise<RepositoryTreeResult>;
  blob(request: GithubReadRequest & { path: string }): Promise<RepositoryBlobResult>;
  comparison(
    request: GithubReadRequest & { base: RepositoryRevision; head: RepositoryRevision },
  ): Promise<RepositoryComparisonResult>;
};

type Fetch = typeof fetch;

const REPOSITORY_ID = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const COMMIT = /^[a-f0-9]{40,64}$/;
const MAX_COMPARE_PAGES = 10;

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const string = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

function repositoryPath(repository: RepositoryIdentity): string {
  if (
    !REPOSITORY_ID.test(repository.repositoryId) ||
    repository.repositoryId.split("/").some((part) => part === "." || part === "..")
  )
    throw new GithubError("invalid", "Use a GitHub repository as owner/name.");
  return `/repos/${repository.repositoryId}`;
}

function encodePath(path: string): string {
  const segments = path.split("/");
  if (
    path.length === 0 ||
    path.length > 4096 ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  )
    throw new GithubError("invalid", "Use a repository-relative file path.");
  return segments.map(encodeURIComponent).join("/");
}

function retryDelay(headers: Headers, now: number): number | null {
  const retryAfter = headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isSafeInteger(seconds) && seconds > 0) return seconds;
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(1, Math.ceil((date - now) / 1000));
  }
  const reset = headers.get("x-ratelimit-reset");
  if (reset !== null) {
    const epoch = Number(reset);
    if (Number.isSafeInteger(epoch)) return Math.max(1, Math.ceil((epoch * 1000 - now) / 1000));
  }
  return null;
}

function nextPage(headers: Headers): boolean {
  const link = headers.get("link");
  return link?.includes('rel="next"') ?? false;
}

function disabledContent(): Content {
  return { text: null, state: "disabled", originalBytes: null, categories: ["code"] };
}

function decode(bytes: Buffer, policy: CapturePolicy): Content {
  if (bytes.includes(0))
    return { text: null, state: "unsupported", originalBytes: bytes.length, categories: ["code"] };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { text: null, state: "malformed", originalBytes: bytes.length, categories: ["code"] };
  }
  return sanitizeContent(
    { text, state: "present", originalBytes: bytes.length, categories: ["code"] },
    policy,
    ["code"],
  );
}

export function githubReads(options: GithubReadOptions): GithubReads {
  const fetchImpl: Fetch = options.fetchImpl ?? fetch;
  const api = (options.endpoints ?? GITHUB_ENDPOINTS).api.replace(/\/+$/, "");
  const now = options.now ?? Date.now;

  const get = async (path: string): Promise<{ body: unknown; headers: Headers }> => {
    let response: Response;
    try {
      response = await fetchImpl(`${api}${path}`, {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${options.token}`,
          "x-github-api-version": "2026-03-10",
        },
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new GithubReadError("unavailable");
    }
    if (response.status === 401)
      throw new GithubError("revoked", "GitHub revoked or expired this authorization.");
    if (response.status === 404) throw new GithubReadError("missing");
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        const remaining = response.headers.get("x-ratelimit-remaining");
        if (
          remaining === "0" ||
          response.headers.get("retry-after") !== null ||
          response.status === 429
        )
          throw new GithubReadError("rate_limited", retryDelay(response.headers, now()));
        throw new GithubReadError("denied");
      }
      throw new GithubReadError("unavailable");
    }
    return {
      body: await response.json().catch(() => null),
      headers: response.headers,
    };
  };

  const resolve = async (
    repository: RepositoryIdentity,
    revision: RepositoryRevision,
  ): Promise<RepositoryRevision> => {
    const checked = repositoryRevisionSchema.parse(revision);
    if (checked.requestedPullRequest && !checked.requestedCommit) {
      if (checked.resolvedCommit) return checked;
      const pull = await pullRequest(repository, Number(checked.requestedPullRequest));
      return { ...checked, resolvedCommit: pull.head.resolvedCommit, resolvedRef: null };
    }
    if (checked.requestedCommit) {
      if (!COMMIT.test(checked.requestedCommit))
        throw new GithubError("invalid", "Use a full commit SHA.");
      return { ...checked, resolvedCommit: checked.requestedCommit };
    }
    if (!checked.requestedRef)
      throw new GithubError("invalid", "A ref, commit or pull request is required.");
    const { body } = await get(
      `${repositoryPath(repository)}/commits/${encodeURIComponent(checked.requestedRef)}`,
    );
    const commit = string(object(body)?.sha);
    if (!commit) throw new GithubReadError("unavailable");
    return { ...checked, resolvedRef: checked.requestedRef, resolvedCommit: commit };
  };

  const failure = (
    repository: RepositoryIdentity,
    revision: RepositoryRevision,
    error: GithubReadError,
  ): {
    repository: RepositoryIdentity;
    revision: RepositoryRevision;
    state: GithubReadFailure;
    omitted: number;
    retryAfterSeconds: number | null;
  } => ({
    repository,
    revision,
    state: error.state,
    omitted: 0,
    retryAfterSeconds: error.state === "rate_limited" ? error.retryAfterSeconds : null,
  });

  const pullRequest = async (
    repository: RepositoryIdentity,
    number: number,
  ): Promise<GithubPullRequest> => {
    if (!Number.isSafeInteger(number) || number <= 0)
      throw new GithubError("invalid", "Use a positive pull request number.");
    const { body } = await get(`${repositoryPath(repository)}/pulls/${number}`);
    const pull = object(body);
    const base = object(pull?.base);
    const head = object(pull?.head);
    const baseSha = string(base?.sha);
    const headSha = string(head?.sha);
    if (!pull || !baseSha || !headSha) throw new GithubReadError("unavailable");
    return {
      number,
      title: string(pull.title) ?? "",
      state: string(pull.state) ?? "unknown",
      draft: pull.draft === true,
      base: {
        requestedRef: null,
        requestedCommit: baseSha,
        requestedPullRequest: null,
        resolvedRef: string(base?.ref),
        resolvedCommit: baseSha,
      },
      head: {
        requestedRef: null,
        requestedCommit: headSha,
        requestedPullRequest: null,
        resolvedRef: string(head?.ref),
        resolvedCommit: headSha,
      },
    };
  };

  return {
    pullRequest,
    async tree(request) {
      try {
        const revision = await resolve(request.repository, request.revision);
        const commit = revision.resolvedCommit;
        if (!commit) throw new GithubReadError("missing");
        const { body } = await get(
          `${repositoryPath(request.repository)}/git/trees/${commit}?recursive=1`,
        );
        const tree = object(body)?.tree;
        const raw = Array.isArray(tree) ? tree : [];
        const entries: RepositoryTreeResult["entries"] = [];
        for (const item of raw) {
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
        const kept = entries.slice(0, request.limits.maxEntries);
        const omitted = entries.length - kept.length;
        const truncated = omitted > 0 || object(body)?.truncated === true;
        return {
          repository: request.repository,
          revision,
          state: truncated ? "truncated" : "available",
          omitted,
          retryAfterSeconds: null,
          entries: kept,
        };
      } catch (error) {
        if (error instanceof GithubReadError)
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
        if (!commit) throw new GithubReadError("missing");
        const cached = options.cache.read({
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
        const { body } = await get(
          `${repositoryPath(request.repository)}/contents/${encodePath(request.path)}?ref=${commit}`,
        );
        const file = object(body);
        if (!file)
          return {
            repository: request.repository,
            revision,
            state: "available",
            omitted: 0,
            retryAfterSeconds: null,
            path: request.path,
            content: {
              text: null,
              state: "unsupported",
              originalBytes: null,
              categories: ["code"],
            },
          };
        const size = number(file.size);
        if (size !== null && size > request.limits.maxBytes) {
          return {
            repository: request.repository,
            revision,
            state: "truncated",
            omitted: 1,
            retryAfterSeconds: null,
            path: request.path,
            content: { text: null, state: "truncated", originalBytes: null, categories: ["code"] },
          };
        }
        let content: Content;
        if (
          file.type !== "file" ||
          file.encoding !== "base64" ||
          typeof file.content !== "string"
        ) {
          content = {
            text: null,
            state: "unsupported",
            originalBytes: size,
            categories: ["code"],
          };
        } else {
          const bytes = Buffer.from(file.content, "base64");
          if (bytes.length > request.limits.maxBytes) {
            return {
              repository: request.repository,
              revision,
              state: "truncated",
              omitted: 1,
              retryAfterSeconds: null,
              path: request.path,
              content: {
                text: null,
                state: "truncated",
                originalBytes: null,
                categories: ["code"],
              },
            };
          }
          content = decode(bytes, options.policy);
        }
        if (content.text !== null)
          options.cache.write(
            { repositoryId: request.repository.repositoryId, commit, path: request.path },
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
        if (error instanceof GithubReadError)
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
        if (!baseCommit || !headCommit) throw new GithubReadError("missing");
        const names = new Set<string>();
        let hasNext = false;
        for (let page = 1; page <= MAX_COMPARE_PAGES; page += 1) {
          const { body, headers } = await get(
            `${repositoryPath(request.repository)}/compare/${baseCommit}...${headCommit}?per_page=100&page=${page}`,
          );
          const files = object(body)?.files;
          const list = Array.isArray(files) ? files : [];
          for (const item of list) {
            const file = object(item);
            const filename = string(file?.filename);
            if (filename) names.add(filename);
            const previous = string(file?.previous_filename);
            if (previous) names.add(previous);
          }
          hasNext = nextPage(headers);
          if (!hasNext || names.size >= request.limits.maxEntries) break;
        }
        const all = [...names];
        const paths = all.slice(0, request.limits.maxEntries);
        const omitted = Math.max(0, all.length - paths.length);
        return {
          repository: request.repository,
          revision: request.revision,
          state: omitted > 0 || hasNext ? "truncated" : "available",
          omitted,
          retryAfterSeconds: null,
          baseCommit,
          headCommit,
          paths,
        };
      } catch (error) {
        if (error instanceof GithubReadError)
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
