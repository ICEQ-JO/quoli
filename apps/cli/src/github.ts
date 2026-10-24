import { join } from "node:path";
import {
  type CredentialStore,
  connectGithub,
  connectionStatus,
  disconnectGithub,
  GITHUB_ENDPOINTS,
  GithubError,
  grantedPermissions,
} from "../../../packages/repository/src/github";
import { githubCache } from "../../../packages/repository/src/github-cache";
import { GithubReadError, githubReads } from "../../../packages/repository/src/github-provider";
import { defaultPolicy } from "../../../packages/schema/src";
import { redact } from "../../../packages/schema/src/privacy";
import { osKeychain } from "../../../packages/storage/src/keychain";
import { runtime } from "../../../packages/storage/src/runtime";

/**
 * `quoli github` — read-only GitHub App connection and remote review.
 *
 * The token lives in the OS keychain. Output shows the account, the app's
 * read-only permissions, repository scope, expiry and sanitized review content;
 * the credential itself is never printed and never appears in a URL.
 */

type Dependencies = {
  store?: CredentialStore;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  out?: (line: string) => void;
  dataDir?: string;
};

const VALUE_FLAGS = ["--client-id", "--web-url", "--api-url"] as const;

function flags(args: string[]): Record<string, string> {
  if (args.length % 2 !== 0) throw new Error("Every github option needs a value.");
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!VALUE_FLAGS.includes(name as (typeof VALUE_FLAGS)[number]))
      throw new Error(`Unknown github option ${name}.`);
    if (values[name]) throw new Error(`Duplicate github option ${name}.`);
    values[name] = args[index + 1];
  }
  return values;
}

type ReviewFlags = {
  pull: number;
  path: string | null;
  maxEntries: number;
  maxBytes: number;
  captureCode: boolean;
};

function reviewFlags(args: string[]): ReviewFlags {
  const parsed: ReviewFlags = {
    pull: 0,
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
    if (!["--pull", "--path", "--max-entries", "--max-bytes"].includes(name))
      throw new Error(`Unknown review option ${name}.`);
    const value = args[index + 1];
    if (!value) throw new Error(`${name} needs a value.`);
    index += 1;
    if (name === "--pull") parsed.pull = Number(value);
    else if (name === "--path") parsed.path = value;
    else if (name === "--max-entries") parsed.maxEntries = Number(value);
    else parsed.maxBytes = Number(value);
  }
  if (!Number.isSafeInteger(parsed.pull) || parsed.pull <= 0)
    throw new Error("Use quoli github review OWNER/REPO --pull NUMBER.");
  if (!Number.isSafeInteger(parsed.maxEntries) || parsed.maxEntries < 1 || parsed.maxEntries > 1000)
    throw new Error("--max-entries must be an integer from 1 to 1000.");
  if (!Number.isSafeInteger(parsed.maxBytes) || parsed.maxBytes < 1 || parsed.maxBytes > 1_048_576)
    throw new Error("--max-bytes must be an integer from 1 to 1048576.");
  return parsed;
}

function scope(connection: Awaited<ReturnType<typeof connectGithub>>): string {
  if (connection.installations.length === 0) return "no app installations";
  return connection.installations
    .map(
      (installation) =>
        `${installation.account} (${
          installation.repositorySelection === "all"
            ? "all repositories"
            : installation.repositorySelection === "selected"
              ? "selected repositories"
              : "unknown repository selection"
        })`,
    )
    .join(", ");
}

function readError(error: GithubReadError): string {
  if (error.state === "rate_limited")
    return error.retryAfterSeconds
      ? `GitHub rate limit reached; retry after ${error.retryAfterSeconds} seconds.`
      : "GitHub rate limit reached; retry later.";
  if (error.state === "denied") return "GitHub denied this read for the connected app.";
  if (error.state === "missing") return "GitHub did not find the requested ref, commit or file.";
  return "GitHub could not be reached.";
}

export async function githubCommand(
  argv: string[],
  dependencies: Dependencies = {},
): Promise<void> {
  const out = dependencies.out ?? ((line: string) => console.log(line));
  const [action, ...args] = argv;
  const store = dependencies.store ?? osKeychain();
  const dataDir = dependencies.dataDir ?? runtime().dataDir;
  const cache = () => githubCache(join(dataDir, "github-cache"));
  if (action === "connect") {
    const values = flags(args);
    const clientId = values["--client-id"];
    if (!clientId || !/^[A-Za-z0-9_]{1,100}$/.test(clientId))
      throw new Error("Use quoli github connect --client-id CLIENT_ID.");
    const connection = await connectGithub({
      clientId,
      endpoints: {
        web: values["--web-url"] ?? GITHUB_ENDPOINTS.web,
        api: values["--api-url"] ?? GITHUB_ENDPOINTS.api,
      },
      store,
      fetchImpl: dependencies.fetchImpl,
      now: dependencies.now,
      sleep: dependencies.sleep,
      announce: (authorization) => {
        const minutes = Math.round(authorization.expiresIn / 60);
        out(
          `Open ${authorization.verificationUri} and enter ${authorization.userCode} (expires in ${minutes} minutes).`,
        );
        out("Waiting for authorization…");
      },
    });
    const permissions = grantedPermissions(connection).join(", ") || "none reported";
    out(`Connected as @${connection.account.login}. Read-only app permissions: ${permissions}.`);
    out(`Repository scope: ${scope(connection)}.`);
    out(
      connection.token.accessExpiresAt
        ? `Access expires ${connection.token.accessExpiresAt}. Run quoli github status before a long session.`
        : "Access does not expire. Run quoli github status to recheck it.",
    );
    return;
  }
  if (action === "status") {
    if (args.length) throw new Error("Use quoli github status.");
    const status = await connectionStatus({
      store,
      fetchImpl: dependencies.fetchImpl,
      now: dependencies.now,
    });
    if (status.state === "disconnected") {
      out("GitHub: not connected. Run quoli github connect --client-id CLIENT_ID.");
      return;
    }
    if (status.state === "invalid") {
      out(
        "GitHub: the stored credential is unreadable. Run quoli github disconnect, then connect again.",
      );
      process.exitCode = 1;
      return;
    }
    if (status.state === "expired") {
      out("GitHub: the authorization expired. Run quoli github connect again.");
      process.exitCode = 1;
      return;
    }
    if (status.state === "revoked") {
      out("GitHub: GitHub revoked this authorization. Run quoli github connect again.");
      process.exitCode = 1;
      return;
    }
    const connection = status.connection;
    if (!connection) return;
    const permissions = grantedPermissions(connection).join(", ") || "none reported";
    out(
      `GitHub: connected as @${connection.account.login} (${permissions}); scope: ${scope(connection)}.`,
    );
    out(
      status.verified
        ? connection.token.accessExpiresAt
          ? `Access valid until ${connection.token.accessExpiresAt}.`
          : "GitHub confirmed the access token."
        : "GitHub could not be reached; the stored credential was not rechecked.",
    );
    return;
  }
  if (action === "review") {
    const [repositoryId, ...rest] = args;
    if (!repositoryId || repositoryId.startsWith("--"))
      throw new Error("Use quoli github review OWNER/REPO --pull NUMBER.");
    const parsed = reviewFlags(rest);
    const status = await connectionStatus({
      store,
      fetchImpl: dependencies.fetchImpl,
      now: dependencies.now,
    });
    if (status.state !== "connected" || !status.connection) {
      out(
        status.state === "revoked"
          ? "GitHub: GitHub revoked this authorization. Run quoli github connect again."
          : status.state === "expired"
            ? "GitHub: the authorization expired. Run quoli github connect again."
            : "GitHub: not connected. Run quoli github connect --client-id CLIENT_ID.",
      );
      process.exitCode = 1;
      return;
    }
    const connection = status.connection;
    const repository = { provider: "github", repositoryId };
    const limits = { maxEntries: parsed.maxEntries, maxBytes: parsed.maxBytes };
    const reads = githubReads({
      token: connection.token.accessToken,
      cache: cache(),
      policy: { ...defaultPolicy, code: parsed.captureCode },
      endpoints: connection.endpoints,
      fetchImpl: dependencies.fetchImpl,
      now: dependencies.now,
    });
    try {
      const pull = await reads.pullRequest(repository, parsed.pull);
      out(`Repository: ${repositoryId}`);
      out(
        `Pull request #${pull.number}: ${pull.title || "(untitled)"} (${pull.state}${pull.draft ? ", draft" : ""})`,
      );
      out(`Base ${pull.base.resolvedCommit} → head ${pull.head.resolvedCommit}`);
      const comparison = await reads.comparison({
        repository,
        revision: pull.head,
        base: pull.base,
        head: pull.head,
        limits,
      });
      out(
        `Comparison: ${comparison.state}; ${comparison.paths.length} path(s)${
          comparison.omitted > 0 ? `, ${comparison.omitted} omitted` : ""
        }.`,
      );
      if (comparison.retryAfterSeconds)
        out(`GitHub rate limit; retry after ${comparison.retryAfterSeconds} seconds.`);
      for (const path of comparison.paths) out(`  ${redact(path)}`);
      if (parsed.path) {
        const blob = await reads.blob({
          repository,
          revision: pull.head,
          limits,
          path: parsed.path,
        });
        out(`\n${redact(blob.path)}: ${blob.state}`);
        if (blob.retryAfterSeconds)
          out(`GitHub rate limit; retry after ${blob.retryAfterSeconds} seconds.`);
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
      if (error instanceof GithubReadError) {
        out(`GitHub: ${readError(error)}`);
        process.exitCode = 1;
        return;
      }
      if (error instanceof GithubError && error.code === "revoked") {
        out("GitHub: GitHub revoked this authorization. Run quoli github connect again.");
        process.exitCode = 1;
        return;
      }
      throw error;
    }
    return;
  }
  if (action === "disconnect") {
    if (args.length) throw new Error("Use quoli github disconnect.");
    disconnectGithub(store);
    const cleared = cache().clear();
    out(
      `GitHub credential removed from the OS keychain${
        cleared > 0 ? ` and ${cleared} cached file(s) cleared` : ""
      }. Revoke the app authorization at https://github.com/settings/apps/authorizations.`,
    );
    return;
  }
  throw new Error("Use quoli github connect --client-id CLIENT_ID | status | review | disconnect.");
}
