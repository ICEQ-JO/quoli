import { join } from "node:path";
import {
  BitbucketError,
  bitbucketStatus,
  connectBitbucket,
  disconnectBitbucket,
} from "../../../packages/repository/src/bitbucket";
import {
  BitbucketReadError,
  bitbucketReads,
} from "../../../packages/repository/src/bitbucket-provider";
import type { CredentialStore } from "../../../packages/repository/src/github";
import { remoteCache } from "../../../packages/repository/src/remote-cache";
import { defaultPolicy } from "../../../packages/schema/src";
import { redact } from "../../../packages/schema/src/privacy";
import { osKeychain } from "../../../packages/storage/src/keychain";
import { runtime } from "../../../packages/storage/src/runtime";

/**
 * `quoli bitbucket` — read-only Bitbucket Cloud review through an Atlassian API
 * token.
 *
 * The token is read from stdin, verified against `/user`, and kept in the OS
 * keychain with the Atlassian email needed for Basic auth. Output never prints
 * the token, and review content is sanitized before display and caching.
 */

type Dependencies = {
  store?: CredentialStore;
  stdin?: AsyncIterable<Buffer | string>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  out?: (line: string) => void;
  dataDir?: string;
  apiUrl?: string;
};

type ReviewFlags = {
  pullRequest: number;
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
    if (size > 4096) throw new BitbucketError("invalid", "The token input is too large.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

function connectFlags(args: string[]): { email: string } {
  if (args.length === 2 && args[0] === "--email" && args[1]) return { email: args[1] };
  throw new Error(
    "Use quoli bitbucket connect --email YOU@EXAMPLE.COM and paste a read-only API token on stdin.",
  );
}

function reviewFlags(args: string[]): ReviewFlags {
  const parsed: ReviewFlags = {
    pullRequest: 0,
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
    if (!["--pull-request", "--path", "--max-entries", "--max-bytes"].includes(name))
      throw new Error(`Unknown review option ${name}.`);
    const value = args[index + 1];
    if (!value) throw new Error(`${name} needs a value.`);
    index += 1;
    if (name === "--pull-request") parsed.pullRequest = Number(value);
    else if (name === "--path") parsed.path = value;
    else if (name === "--max-entries") parsed.maxEntries = Number(value);
    else parsed.maxBytes = Number(value);
  }
  if (!Number.isSafeInteger(parsed.pullRequest) || parsed.pullRequest <= 0)
    throw new Error("Use quoli bitbucket review WORKSPACE/REPO --pull-request NUMBER.");
  if (!Number.isSafeInteger(parsed.maxEntries) || parsed.maxEntries < 1 || parsed.maxEntries > 1000)
    throw new Error("--max-entries must be an integer from 1 to 1000.");
  if (!Number.isSafeInteger(parsed.maxBytes) || parsed.maxBytes < 1 || parsed.maxBytes > 1_048_576)
    throw new Error("--max-bytes must be an integer from 1 to 1048576.");
  return parsed;
}

function readError(error: BitbucketReadError): string {
  if (error.state === "rate_limited")
    return error.retryAfterSeconds
      ? `Bitbucket rate limit reached; retry after ${error.retryAfterSeconds} seconds.`
      : "Bitbucket rate limit reached; retry later.";
  if (error.state === "denied")
    return "Bitbucket denied this read; read:repository:bitbucket or read:pullrequest:bitbucket is required.";
  if (error.state === "missing")
    return "Bitbucket did not find the requested ref, commit, pull request or file.";
  return "Bitbucket could not be reached.";
}

export async function bitbucketCommand(
  argv: string[],
  dependencies: Dependencies = {},
): Promise<void> {
  const out = dependencies.out ?? ((line: string) => console.log(line));
  const [action, ...args] = argv;
  const store = dependencies.store ?? osKeychain("quoli", "bitbucket");
  const dataDir = dependencies.dataDir ?? runtime().dataDir;
  const cache = () => remoteCache(join(dataDir, "bitbucket-cache"));
  if (action === "connect") {
    const values = connectFlags(args);
    // Fail before waiting on input when the keychain is unusable.
    store.read();
    out("Paste a read-only Bitbucket API token, then press Ctrl-D.");
    const token = await stdinToken(dependencies.stdin ?? process.stdin);
    if (!token) throw new Error("No Bitbucket API token was read from stdin.");
    const connection = await connectBitbucket({
      email: values.email,
      token,
      apiUrl: dependencies.apiUrl,
      store,
      fetchImpl: dependencies.fetchImpl,
      now: dependencies.now,
    });
    out(`Connected to Bitbucket Cloud as ${connection.account.displayName}.`);
    out(
      "Required scopes: read:user:bitbucket, read:repository:bitbucket, read:pullrequest:bitbucket. Quoli only sends GET requests.",
    );
    return;
  }
  if (action === "status") {
    if (args.length) throw new Error("Use quoli bitbucket status.");
    const status = await bitbucketStatus({
      store,
      fetchImpl: dependencies.fetchImpl,
      now: dependencies.now,
    });
    if (status.state === "disconnected") {
      out(
        "Bitbucket: not connected. Run quoli bitbucket connect --email YOU@EXAMPLE.COM and paste an API token.",
      );
      return;
    }
    if (status.state === "invalid") {
      out(
        "Bitbucket: the stored credential is unreadable. Run quoli bitbucket disconnect, then connect again.",
      );
      process.exitCode = 1;
      return;
    }
    if (status.state === "revoked") {
      out(
        "Bitbucket: Bitbucket rejected this API token (expired, revoked or invalid). Run quoli bitbucket connect again.",
      );
      process.exitCode = 1;
      return;
    }
    const connection = status.connection;
    if (!connection) return;
    out(`Bitbucket: connected as ${connection.account.displayName} (${connection.token.email}).`);
    out(
      status.verified
        ? "Bitbucket confirmed the token. Scopes and expiry are not exposed by the API."
        : "Bitbucket could not be reached or denied the account read; the stored credential was not rechecked.",
    );
    return;
  }
  if (action === "review") {
    const [repositoryId, ...rest] = args;
    if (!repositoryId || repositoryId.startsWith("--"))
      throw new Error("Use quoli bitbucket review WORKSPACE/REPO --pull-request NUMBER.");
    const parsed = reviewFlags(rest);
    const status = await bitbucketStatus({
      store,
      fetchImpl: dependencies.fetchImpl,
      now: dependencies.now,
    });
    if (status.state !== "connected" || !status.connection) {
      out(
        status.state === "revoked"
          ? "Bitbucket: Bitbucket rejected this API token. Run quoli bitbucket connect again."
          : "Bitbucket: not connected. Run quoli bitbucket connect and paste an API token.",
      );
      process.exitCode = 1;
      return;
    }
    const connection = status.connection;
    const repository = { provider: "bitbucket", repositoryId };
    const limits = { maxEntries: parsed.maxEntries, maxBytes: parsed.maxBytes };
    const reads = bitbucketReads({
      email: connection.token.email,
      token: connection.token.accessToken,
      apiUrl: connection.apiUrl,
      cache: cache(),
      policy: { ...defaultPolicy, code: parsed.captureCode },
      fetchImpl: dependencies.fetchImpl,
      now: dependencies.now,
    });
    try {
      const request = await reads.pullRequest(repository, parsed.pullRequest);
      out(`Repository: ${repositoryId}`);
      out(
        `Pull request #${request.iid}: ${request.title || "(untitled)"} (${request.state}${request.draft ? ", draft" : ""})`,
      );
      out(`Base ${request.base.resolvedCommit} → head ${request.head.resolvedCommit}`);
      const head = { ...request.head, requestedPullRequest: String(request.iid) };
      const comparison = await reads.comparison({
        repository,
        revision: head,
        base: request.base,
        head,
        limits,
      });
      out(
        `Comparison: ${comparison.state}; ${comparison.paths.length} path(s)${
          comparison.omitted > 0 ? `, ${comparison.omitted} omitted` : ""
        }.`,
      );
      if (comparison.retryAfterSeconds)
        out(`Bitbucket rate limit; retry after ${comparison.retryAfterSeconds} seconds.`);
      for (const path of comparison.paths) out(`  ${redact(path)}`);
      if (parsed.path) {
        const blob = await reads.blob({
          repository,
          revision: head,
          limits,
          path: parsed.path,
        });
        out(`\n${redact(blob.path)}: ${blob.state}`);
        if (blob.retryAfterSeconds)
          out(`Bitbucket rate limit; retry after ${blob.retryAfterSeconds} seconds.`);
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
      if (error instanceof BitbucketReadError) {
        out(`Bitbucket: ${readError(error)}`);
        process.exitCode = 1;
        return;
      }
      if (error instanceof BitbucketError && error.code === "revoked") {
        out("Bitbucket: Bitbucket rejected this API token. Run quoli bitbucket connect again.");
        process.exitCode = 1;
        return;
      }
      throw error;
    }
    return;
  }
  if (action === "disconnect") {
    if (args.length) throw new Error("Use quoli bitbucket disconnect.");
    disconnectBitbucket(store);
    const cleared = cache().clear();
    out(
      `Bitbucket credential removed from the OS keychain${
        cleared > 0 ? ` and ${cleared} cached file(s) cleared` : ""
      }. Revoke the API token in Atlassian account settings when intended.`,
    );
    return;
  }
  throw new Error("Use quoli bitbucket connect --email EMAIL | status | review | disconnect.");
}
