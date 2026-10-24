import { join } from "node:path";
import type { CredentialStore } from "../../../packages/repository/src/github";
import {
  connectGitlab,
  disconnectGitlab,
  GITLAB_BASE,
  GitlabError,
  gitlabStatus,
} from "../../../packages/repository/src/gitlab";
import { GitlabReadError, gitlabReads } from "../../../packages/repository/src/gitlab-provider";
import { remoteCache } from "../../../packages/repository/src/remote-cache";
import { defaultPolicy } from "../../../packages/schema/src";
import { redact } from "../../../packages/schema/src/privacy";
import { osKeychain } from "../../../packages/storage/src/keychain";
import { runtime } from "../../../packages/storage/src/runtime";

/**
 * `quoli gitlab` — read-only GitLab connection and remote review.
 *
 * The personal access token is read from stdin, verified as read-only, and kept
 * in the OS keychain. Output shows the account, scopes and expiry, never the
 * token, and review content is sanitized before display and caching.
 */

type Dependencies = {
  store?: CredentialStore;
  stdin?: AsyncIterable<Buffer | string>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  out?: (line: string) => void;
  dataDir?: string;
};

type ReviewFlags = {
  mergeRequest: number;
  path: string | null;
  maxEntries: number;
  maxBytes: number;
  captureCode: boolean;
};

async function stdinToken(stream: AsyncIterable<Buffer | string>): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 4096) throw new GitlabError("invalid", "The token input is too large.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

function connectFlags(args: string[]): { baseUrl: string } {
  if (args.length === 0) return { baseUrl: GITLAB_BASE };
  if (args.length === 2 && args[0] === "--base-url" && args[1]) return { baseUrl: args[1] };
  throw new Error("Use quoli gitlab connect [--base-url URL] and paste the token on stdin.");
}

function reviewFlags(args: string[]): ReviewFlags {
  const parsed: ReviewFlags = {
    mergeRequest: 0,
    path: null,
    maxEntries: 200,
    maxBytes: 262_144,
    captureCode: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--capture-code") {
      parsed.captureCode = true;
      continue;
    }
    if (!["--merge-request", "--path", "--max-entries", "--max-bytes"].includes(name))
      throw new Error(`Unknown review option ${name}.`);
    const value = args[index + 1];
    if (!value) throw new Error(`${name} needs a value.`);
    index += 1;
    if (name === "--merge-request") parsed.mergeRequest = Number(value);
    else if (name === "--path") parsed.path = value;
    else if (name === "--max-entries") parsed.maxEntries = Number(value);
    else parsed.maxBytes = Number(value);
  }
  if (!Number.isSafeInteger(parsed.mergeRequest) || parsed.mergeRequest <= 0)
    throw new Error("Use quoli gitlab review GROUP/PROJECT --merge-request NUMBER.");
  if (!Number.isSafeInteger(parsed.maxEntries) || parsed.maxEntries < 1 || parsed.maxEntries > 1000)
    throw new Error("--max-entries must be an integer from 1 to 1000.");
  if (!Number.isSafeInteger(parsed.maxBytes) || parsed.maxBytes < 1 || parsed.maxBytes > 1_048_576)
    throw new Error("--max-bytes must be an integer from 1 to 1048576.");
  return parsed;
}

function readError(error: GitlabReadError): string {
  if (error.state === "rate_limited")
    return error.retryAfterSeconds
      ? `GitLab rate limit reached; retry after ${error.retryAfterSeconds} seconds.`
      : "GitLab rate limit reached; retry later.";
  if (error.state === "denied") return "GitLab denied this read for the connected token.";
  if (error.state === "missing") return "GitLab did not find the requested ref, commit or file.";
  return "GitLab could not be reached.";
}

export async function gitlabCommand(
  argv: string[],
  dependencies: Dependencies = {},
): Promise<void> {
  const out = dependencies.out ?? ((line: string) => console.log(line));
  const [action, ...args] = argv;
  const store = dependencies.store ?? osKeychain("quoli", "gitlab");
  const dataDir = dependencies.dataDir ?? runtime().dataDir;
  const cache = () => remoteCache(join(dataDir, "gitlab-cache"));
  if (action === "connect") {
    const values = connectFlags(args);
    // Fail before waiting on input when the keychain is unusable.
    store.read();
    out("Paste a GitLab personal access token with the read_api scope, then press Ctrl-D.");
    const token = await stdinToken(dependencies.stdin ?? process.stdin);
    if (!token) throw new Error("No GitLab token was read from stdin.");
    const connection = await connectGitlab({
      token,
      baseUrl: values.baseUrl,
      store,
      fetchImpl: dependencies.fetchImpl,
      now: dependencies.now,
    });
    out(
      `Connected to ${connection.baseUrl} as @${connection.account.username} (scopes: ${connection.token.scopes.join(", ")}).`,
    );
    out(
      connection.token.expiresAt
        ? `Token expires ${connection.token.expiresAt}. Run quoli gitlab status before a long session.`
        : "The token does not expire. Run quoli gitlab status to recheck it.",
    );
    return;
  }
  if (action === "status") {
    if (args.length) throw new Error("Use quoli gitlab status.");
    const status = await gitlabStatus({
      store,
      fetchImpl: dependencies.fetchImpl,
      now: dependencies.now,
    });
    if (status.state === "disconnected") {
      out("GitLab: not connected. Run quoli gitlab connect and paste a read_api token.");
      return;
    }
    if (status.state === "invalid") {
      out(
        "GitLab: the stored credential is unreadable. Run quoli gitlab disconnect, then connect again.",
      );
      process.exitCode = 1;
      return;
    }
    if (status.state === "expired") {
      out("GitLab: the token expired. Run quoli gitlab connect again.");
      process.exitCode = 1;
      return;
    }
    if (status.state === "revoked") {
      out("GitLab: GitLab revoked this token. Run quoli gitlab connect again.");
      process.exitCode = 1;
      return;
    }
    const connection = status.connection;
    if (!connection) return;
    out(
      `GitLab: connected to ${connection.baseUrl} as @${connection.account.username} (scopes: ${connection.token.scopes.join(", ")}).`,
    );
    out(
      status.verified
        ? connection.token.expiresAt
          ? `Token valid until ${connection.token.expiresAt}.`
          : "GitLab confirmed the token."
        : "GitLab could not be reached; the stored credential was not rechecked.",
    );
    return;
  }
  if (action === "review") {
    const [repositoryId, ...rest] = args;
    if (!repositoryId || repositoryId.startsWith("--"))
      throw new Error("Use quoli gitlab review GROUP/PROJECT --merge-request NUMBER.");
    const parsed = reviewFlags(rest);
    const status = await gitlabStatus({
      store,
      fetchImpl: dependencies.fetchImpl,
      now: dependencies.now,
    });
    if (status.state !== "connected" || !status.connection) {
      out(
        status.state === "revoked"
          ? "GitLab: GitLab revoked this token. Run quoli gitlab connect again."
          : status.state === "expired"
            ? "GitLab: the token expired. Run quoli gitlab connect again."
            : "GitLab: not connected. Run quoli gitlab connect and paste a read_api token.",
      );
      process.exitCode = 1;
      return;
    }
    const connection = status.connection;
    const repository = { provider: "gitlab", repositoryId };
    const limits = { maxEntries: parsed.maxEntries, maxBytes: parsed.maxBytes };
    const reads = gitlabReads({
      token: connection.token.accessToken,
      baseUrl: connection.baseUrl,
      cache: cache(),
      policy: { ...defaultPolicy, code: parsed.captureCode },
      fetchImpl: dependencies.fetchImpl,
      now: dependencies.now,
    });
    try {
      const request = await reads.mergeRequest(repository, parsed.mergeRequest);
      out(`Project: ${repositoryId}`);
      out(
        `Merge request !${request.iid}: ${request.title || "(untitled)"} (${request.state}${request.draft ? ", draft" : ""})`,
      );
      out(`Base ${request.base.resolvedCommit} → head ${request.head.resolvedCommit}`);
      const comparison = await reads.comparison({
        repository,
        revision: request.head,
        base: request.base,
        head: request.head,
        limits,
      });
      out(
        `Comparison: ${comparison.state}; ${comparison.paths.length} path(s)${
          comparison.omitted > 0 ? `, ${comparison.omitted} omitted` : ""
        }.`,
      );
      if (comparison.retryAfterSeconds)
        out(`GitLab rate limit; retry after ${comparison.retryAfterSeconds} seconds.`);
      for (const path of comparison.paths) out(`  ${redact(path)}`);
      if (parsed.path) {
        const blob = await reads.blob({
          repository,
          revision: request.head,
          limits,
          path: parsed.path,
        });
        out(`\n${redact(blob.path)}: ${blob.state}`);
        if (blob.retryAfterSeconds)
          out(`GitLab rate limit; retry after ${blob.retryAfterSeconds} seconds.`);
        const content = blob.content;
        if (!content) out("No content was returned.");
        else if (content.text === null)
          out(
            `Content ${content.state}${content.originalBytes !== null ? ` (${content.originalBytes} bytes)` : ""}.`,
          );
        else {
          out(`Content (${content.state}, ${content.originalBytes ?? "unknown"} bytes):`);
          out(content.text);
        }
      }
    } catch (error) {
      if (error instanceof GitlabReadError) {
        out(`GitLab: ${readError(error)}`);
        process.exitCode = 1;
        return;
      }
      if (error instanceof GitlabError && error.code === "revoked") {
        out("GitLab: GitLab revoked this token. Run quoli gitlab connect again.");
        process.exitCode = 1;
        return;
      }
      throw error;
    }
    return;
  }
  if (action === "disconnect") {
    if (args.length) throw new Error("Use quoli gitlab disconnect.");
    disconnectGitlab(store);
    const cleared = cache().clear();
    out(
      `GitLab credential removed from the OS keychain${
        cleared > 0 ? ` and ${cleared} cached file(s) cleared` : ""
      }. Revoke the token in GitLab settings when intended.`,
    );
    return;
  }
  throw new Error("Use quoli gitlab connect [--base-url URL] | status | review | disconnect.");
}
