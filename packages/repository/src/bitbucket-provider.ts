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
import { BitbucketError, bitbucketAuthorization } from "./bitbucket";
import type { RemoteCache } from "./remote-cache";
import { decodeProviderContent, disabledContent } from "./remote-content";

/**
 * Read-only Bitbucket Cloud API 2.0 reads for refs, pull requests, trees,
 * blobs and comparisons.
 *
 * Tree reads use a bounded `max_depth` listing; file reads fetch metadata
 * before content so directories, links, submodules, binary and LFS entries are
 * never downloaded as text. Every failure becomes an explicit read state.
 */

export type BitbucketPullRequest = {
  iid: number;
  title: string;
  state: string;
  draft: boolean;
  base: RepositoryRevision;
  head: RepositoryRevision;
};

export type BitbucketReadRequest = {
  repository: RepositoryIdentity;
  revision: RepositoryRevision;
  limits: RepositoryReadLimits;
};

export type BitbucketReadOptions = {
  email: string;
  token: string;
  apiUrl: string;
  cache: RemoteCache;
  policy: CapturePolicy;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export type BitbucketReadFailure = "missing" | "denied" | "rate_limited" | "unavailable";

export class BitbucketReadError extends Error {
  readonly state: BitbucketReadFailure;
  readonly retryAfterSeconds: number | null;

  constructor(state: BitbucketReadFailure, retryAfterSeconds: number | null = null) {
    super(`Bitbucket read failed: ${state}.`);
    this.name = "BitbucketReadError";
    this.state = state;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type BitbucketReads = {
  pullRequest(repository: RepositoryIdentity, iid: number): Promise<BitbucketPullRequest>;
  tree(request: BitbucketReadRequest): Promise<RepositoryTreeResult>;
  blob(request: BitbucketReadRequest & { path: string }): Promise<RepositoryBlobResult>;
  comparison(
    request: BitbucketReadRequest & { base: RepositoryRevision; head: RepositoryRevision },
  ): Promise<RepositoryComparisonResult>;
};

type Fetched = { body: unknown };

const PROJECT = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const COMMIT = /^[a-f0-9]{40,64}$/;
const MAX_PAGES = 10;
const TREE_DEPTH = 10;

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const string = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
const integer = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

function projectPath(repository: RepositoryIdentity): string {
  if (
    !PROJECT.test(repository.repositoryId) ||
    repository.repositoryId.split("/").some((part) => part === "." || part === "..")
  )
    throw new BitbucketError("invalid", "Use a Bitbucket repository as workspace/repository.");
  const [workspace, slug] = repository.repositoryId.split("/");
  return `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(slug)}`;
}

function encodePath(path: string): string {
  const parts = path.split("/");
  if (
    path.length === 0 ||
    path.length > 4096 ||
    parts.some((part) => part === "" || part === "." || part === "..")
  )
    throw new BitbucketError("invalid", "Use a repository-relative file path.");
  return parts.map((part) => encodeURIComponent(part)).join("/");
}

function attributes(value: unknown): Set<string> {
  return new Set((typeof value === "string" ? value : "").split(/\s+/).filter(Boolean));
}

function retryDelay(headers: Headers, now: number): number | null {
  const retryAfter = headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isSafeInteger(seconds) && seconds > 0) return seconds;
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(1, Math.ceil((date - now) / 1000));
  }
  return null;
}

export function bitbucketReads(options: BitbucketReadOptions): BitbucketReads {
  const fetchImpl: typeof fetch = options.fetchImpl ?? fetch;
  const api = options.apiUrl.replace(/\/+$/, "");
  const origin = new URL(api).origin;
  const now = options.now ?? Date.now;

  const fetchAt = async (url: string, accept: string): Promise<Response> => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BitbucketReadError("unavailable");
    }
    if (parsed.origin !== origin) throw new BitbucketReadError("unavailable");
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {
          accept,
          authorization: bitbucketAuthorization(options.email, options.token),
        },
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new BitbucketReadError("unavailable");
    }
    if (response.status === 401)
      throw new BitbucketError(
        "revoked",
        "Bitbucket rejected this API token; it may be expired, revoked or invalid.",
      );
    if (response.status === 404) throw new BitbucketReadError("missing");
    if (response.status === 403) throw new BitbucketReadError("denied");
    if (response.status === 429)
      throw new BitbucketReadError("rate_limited", retryDelay(response.headers, now()));
    if (!response.ok) throw new BitbucketReadError("unavailable");
    return response;
  };

  const get = async (path: string): Promise<Fetched> => {
    const response = await fetchAt(
      path.startsWith("http") ? path : `${api}${path}`,
      "application/json",
    );
    return { body: await response.json().catch(() => null) };
  };

  const raw = async (
    path: string,
    maxBytes: number,
  ): Promise<{ bytes: Buffer | null; tooLarge: boolean }> => {
    const response = await fetchAt(
      path.startsWith("http") ? path : `${api}${path}`,
      "application/octet-stream",
    );
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
      const request = await pullRequest(repository, Number(checked.requestedPullRequest));
      return { ...checked, resolvedCommit: request.head.resolvedCommit, resolvedRef: null };
    }
    if (checked.requestedCommit) {
      if (!COMMIT.test(checked.requestedCommit))
        throw new BitbucketError("invalid", "Use a full commit SHA.");
      return { ...checked, resolvedCommit: checked.requestedCommit };
    }
    if (!checked.requestedRef)
      throw new BitbucketError("invalid", "A ref, commit or pull request is required.");
    const { body } = await get(
      `${projectPath(repository)}/refs/branches/${encodeURIComponent(checked.requestedRef)}`,
    );
    const target = object(object(body)?.target);
    const commit = string(target?.hash);
    if (!commit) throw new BitbucketReadError("unavailable");
    return { ...checked, resolvedRef: checked.requestedRef, resolvedCommit: commit };
  };

  const failure = (
    repository: RepositoryIdentity,
    revision: RepositoryRevision,
    error: BitbucketReadError,
  ): {
    repository: RepositoryIdentity;
    revision: RepositoryRevision;
    state: BitbucketReadFailure;
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
    iid: number,
  ): Promise<BitbucketPullRequest> => {
    if (!Number.isSafeInteger(iid) || iid <= 0)
      throw new BitbucketError("invalid", "Use a positive pull request number.");
    const { body } = await get(`${projectPath(repository)}/pullrequests/${iid}`);
    const request = object(body);
    const source = object(request?.source);
    const destination = object(request?.destination);
    const baseSha = string(object(destination?.commit)?.hash);
    const headSha = string(object(source?.commit)?.hash);
    if (!request || !baseSha || !headSha) throw new BitbucketReadError("unavailable");
    return {
      iid,
      title: string(request.title) ?? "",
      state: string(request.state) ?? "unknown",
      draft: request.draft === true,
      base: {
        requestedRef: null,
        requestedCommit: baseSha,
        requestedPullRequest: null,
        resolvedRef: string(object(destination?.branch)?.name),
        resolvedCommit: baseSha,
      },
      head: {
        requestedRef: null,
        requestedCommit: headSha,
        requestedPullRequest: null,
        resolvedRef: string(object(source?.branch)?.name),
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
        if (!commit) throw new BitbucketReadError("missing");
        const entries: RepositoryTreeResult["entries"] = [];
        let url: string | null =
          `${projectPath(request.repository)}/src/${commit}/?pagelen=100&max_depth=${TREE_DEPTH}`;
        let truncated = false;
        for (let page = 0; page < MAX_PAGES && url; page += 1) {
          const { body } = await get(url);
          const listing = object(body);
          if (!listing || !Array.isArray(listing.values))
            throw new BitbucketReadError("unavailable");
          for (const item of listing.values) {
            const entry = object(item);
            const path = string(entry?.path);
            if (!entry || !path) continue;
            const kind =
              entry.type === "commit_directory"
                ? "directory"
                : entry.type === "commit_file"
                  ? attributes(entry.attributes).has("subrepository")
                    ? "submodule"
                    : "file"
                  : null;
            if (kind) entries.push({ path, kind });
            if (entries.length > request.limits.maxEntries) {
              truncated = true;
              break;
            }
          }
          url = string(listing.next);
          if (entries.length > request.limits.maxEntries) break;
        }
        if (url) truncated = true;
        const kept = entries.slice(0, request.limits.maxEntries);
        const omitted = entries.length - kept.length;
        return {
          repository: request.repository,
          revision,
          state: truncated || omitted > 0 ? "truncated" : "available",
          omitted,
          retryAfterSeconds: null,
          entries: kept,
        };
      } catch (error) {
        if (error instanceof BitbucketReadError)
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
        if (!commit) throw new BitbucketReadError("missing");
        const cached = options.cache.read({
          provider: "bitbucket",
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
        const filePath = `${projectPath(request.repository)}/src/${commit}/${encodePath(request.path)}`;
        const { body } = await get(`${filePath}?format=meta`);
        const meta = object(body);
        if (!meta) throw new BitbucketReadError("unavailable");
        const size = integer(meta.size);
        const traits = attributes(meta.attributes);
        const unsupported =
          meta.type !== "commit_file" ||
          traits.has("subrepository") ||
          traits.has("link") ||
          traits.has("binary") ||
          traits.has("lfs");
        if (unsupported)
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
              originalBytes: size,
              categories: ["code"],
            },
          };
        if (size !== null && size > request.limits.maxBytes)
          return {
            repository: request.repository,
            revision,
            state: "truncated",
            omitted: 1,
            retryAfterSeconds: null,
            path: request.path,
            content: { text: null, state: "truncated", originalBytes: size, categories: ["code"] },
          };
        const file = await raw(filePath, request.limits.maxBytes);
        if (file.tooLarge)
          return {
            repository: request.repository,
            revision,
            state: "truncated",
            omitted: 1,
            retryAfterSeconds: null,
            path: request.path,
            content: { text: null, state: "truncated", originalBytes: size, categories: ["code"] },
          };
        const content = decodeProviderContent(file.bytes ?? Buffer.alloc(0), options.policy);
        if (content.text !== null)
          options.cache.write(
            {
              provider: "bitbucket",
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
        if (error instanceof BitbucketReadError)
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
        if (!baseCommit || !headCommit) throw new BitbucketReadError("missing");
        const names = new Set<string>();
        const iid = request.revision.requestedPullRequest
          ? Number(request.revision.requestedPullRequest)
          : null;
        if (
          request.revision.requestedPullRequest &&
          (!Number.isSafeInteger(iid) || (iid ?? 0) <= 0)
        )
          throw new BitbucketError("invalid", "Use a positive pull request number.");
        // A pull request diffstat is merge-base aware and works for fork sources;
        // a plain range diffstat can include destination-only changes.
        let url: string | null = iid
          ? `${projectPath(request.repository)}/pullrequests/${iid}/diffstat?pagelen=100`
          : `${projectPath(request.repository)}/diffstat/${baseCommit}..${headCommit}?pagelen=100`;
        let truncated = false;
        for (let page = 0; page < MAX_PAGES && url; page += 1) {
          const { body } = await get(url);
          const listing = object(body);
          if (!listing || !Array.isArray(listing.values))
            throw new BitbucketReadError("unavailable");
          for (const item of listing.values) {
            const diff = object(item);
            const oldPath = string(object(diff?.old)?.path);
            const newPath = string(object(diff?.new)?.path);
            if (oldPath) names.add(oldPath);
            if (newPath) names.add(newPath);
            if (names.size > request.limits.maxEntries) {
              truncated = true;
              break;
            }
          }
          url = string(listing.next);
          if (names.size > request.limits.maxEntries) break;
        }
        if (url) truncated = true;
        const all = [...names];
        const paths = all.slice(0, request.limits.maxEntries);
        return {
          repository: request.repository,
          revision: request.revision,
          state: truncated ? "truncated" : "available",
          omitted: all.length - paths.length,
          retryAfterSeconds: null,
          baseCommit,
          headCommit,
          paths,
        };
      } catch (error) {
        if (error instanceof BitbucketReadError)
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
