import type { CredentialStore } from "./github";

/**
 * Read-only GitLab connection using a personal access token.
 *
 * A token is read from the caller (never from a URL or argument list), verified
 * against `/personal_access_tokens/self`, and stored only in the OS keychain.
 * Tokens must grant `read_api` and no write scope; there is no refresh flow, so
 * an expired token is a reconnect. GitLab.com is the default; self-managed
 * URLs are accepted but not certified.
 */

export const GITLAB_BASE = "https://gitlab.com";

export type GitlabErrorCode =
  | "invalid"
  | "expired"
  | "revoked"
  | "scope"
  | "unavailable"
  | "request";

export class GitlabError extends Error {
  readonly code: GitlabErrorCode;

  constructor(code: GitlabErrorCode, message: string) {
    super(message);
    this.name = "GitlabError";
    this.code = code;
  }
}

export type GitlabConnection = {
  version: 1;
  baseUrl: string;
  account: { id: number; username: string };
  token: { accessToken: string; scopes: string[]; expiresAt: string | null };
  createdAt: string;
};

type Options = {
  store: CredentialStore;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

const ALLOWED_SCOPES = new Set(["read_api", "read_user"]);
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
const integer = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export function normalizeGitlabBase(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GitlabError("invalid", "Use a valid GitLab base URL.");
  }
  if (url.username || url.password || url.search || url.hash)
    throw new GitlabError(
      "invalid",
      "A GitLab base URL cannot contain credentials, a query or a fragment.",
    );
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname)))
    throw new GitlabError(
      "invalid",
      "Use HTTPS for a GitLab base URL (HTTP is allowed only on loopback).",
    );
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

function api(baseUrl: string): string {
  return `${baseUrl}/api/v4`;
}

async function request(
  baseUrl: string,
  path: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(`${api(baseUrl)}${path}`, {
      headers: { accept: "application/json", "private-token": token },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GitlabError("unavailable", "GitLab could not be reached.");
  }
  if (response.status === 401)
    throw new GitlabError("revoked", "GitLab rejected this token; it may be expired or revoked.");
  if (!response.ok)
    throw new GitlabError("request", `GitLab rejected the request (${response.status}).`);
  const body = object(await response.json().catch(() => null));
  if (!body) throw new GitlabError("invalid", "GitLab returned an unreadable response.");
  return body;
}

function expiryEnd(expiresAt: string): number | null {
  const value = Date.parse(`${expiresAt}T23:59:59Z`);
  return Number.isNaN(value) ? null : value;
}

async function verifyToken(
  baseUrl: string,
  token: string,
  fetchImpl: typeof fetch,
  now: () => number,
): Promise<{ scopes: string[]; expiresAt: string | null }> {
  let detail: Record<string, unknown>;
  try {
    detail = await request(baseUrl, "/personal_access_tokens/self", token, fetchImpl);
  } catch (error) {
    if (error instanceof GitlabError && error.code === "request")
      throw new GitlabError(
        "scope",
        "GitLab did not return token details; read_api scope and a supported GitLab version are required.",
      );
    throw error;
  }
  if (detail.active !== true || detail.revoked === true)
    throw new GitlabError("revoked", "This GitLab token is inactive or revoked.");
  const scopes = Array.isArray(detail.scopes)
    ? detail.scopes.filter((scope): scope is string => typeof scope === "string")
    : [];
  if (!scopes.includes("read_api"))
    throw new GitlabError("scope", "The GitLab token must include the read_api scope.");
  const excessive = scopes.filter((scope) => !ALLOWED_SCOPES.has(scope));
  if (excessive.length > 0)
    throw new GitlabError(
      "scope",
      `The GitLab token grants non-read scopes (${excessive.join(", ")}); create a read_api token.`,
    );
  const expiresAt = text(detail.expires_at);
  if (expiresAt) {
    const end = expiryEnd(expiresAt);
    if (end === null)
      throw new GitlabError("invalid", "GitLab returned an unreadable token expiry.");
    if (end <= now()) throw new GitlabError("expired", "This GitLab token has expired.");
  }
  return { scopes, expiresAt };
}

export async function connectGitlab(
  options: Options & { token: string; baseUrl?: string },
): Promise<GitlabConnection> {
  // Reading first proves the keychain is usable before any network call.
  options.store.read();
  const baseUrl = normalizeGitlabBase(options.baseUrl ?? GITLAB_BASE);
  const token = options.token.trim();
  if (token.length < 8 || token.length > 512 || /\s/.test(token))
    throw new GitlabError("invalid", "Paste a GitLab personal access token.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const user = await request(baseUrl, "/user", token, fetchImpl);
  const id = integer(user.id);
  const username = text(user.username);
  if (id === null || !username)
    throw new GitlabError("invalid", "GitLab returned an incomplete account.");
  const { scopes, expiresAt } = await verifyToken(baseUrl, token, fetchImpl, now);
  const connection: GitlabConnection = {
    version: 1,
    baseUrl,
    account: { id, username },
    token: { accessToken: token, scopes, expiresAt },
    createdAt: new Date(now()).toISOString(),
  };
  const serialized = JSON.stringify(connection);
  options.store.write(serialized);
  if (options.store.read() !== serialized) {
    options.store.clear();
    throw new GitlabError("unavailable", "The OS keychain did not retain the credential.");
  }
  return connection;
}

export type GitlabConnectionState =
  | "disconnected"
  | "connected"
  | "expired"
  | "revoked"
  | "invalid";

export type GitlabStatus = {
  state: GitlabConnectionState;
  connection: GitlabConnection | null;
  verified: boolean;
};

export function parseGitlabConnection(raw: string): GitlabConnection | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const entry = object(value);
  const account = object(entry?.account);
  const token = object(entry?.token);
  if (!entry) return null;
  if (entry.version !== 1 || !account || !token) return null;
  if (!text(entry.baseUrl) || !text(account.username) || integer(account.id) === null) return null;
  if (!text(token.accessToken)) return null;
  try {
    normalizeGitlabBase(entry.baseUrl as string);
  } catch {
    return null;
  }
  return entry as GitlabConnection;
}

export async function gitlabStatus(options: Options): Promise<GitlabStatus> {
  const raw = options.store.read();
  if (raw === null) return { state: "disconnected", connection: null, verified: false };
  const connection = parseGitlabConnection(raw);
  if (!connection) return { state: "invalid", connection: null, verified: false };
  const now = options.now ?? Date.now;
  if (connection.token.expiresAt) {
    const end = expiryEnd(connection.token.expiresAt);
    if (end === null) return { state: "invalid", connection: null, verified: false };
    if (end <= now()) {
      options.store.clear();
      return { state: "expired", connection, verified: false };
    }
  }
  try {
    await request(
      connection.baseUrl,
      "/user",
      connection.token.accessToken,
      options.fetchImpl ?? fetch,
    );
    return { state: "connected", connection, verified: true };
  } catch (error) {
    if (error instanceof GitlabError && error.code === "revoked") {
      options.store.clear();
      return { state: "revoked", connection, verified: false };
    }
    return { state: "connected", connection, verified: false };
  }
}

export function disconnectGitlab(store: CredentialStore): void {
  store.clear();
}
