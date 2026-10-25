import type { CredentialStore } from "./github";

/**
 * Read-only Bitbucket Cloud connection using an Atlassian API token.
 *
 * Bitbucket Cloud API 2.0 authenticates API tokens with HTTP Basic
 * (`email:token`). The token is read from the caller, verified against `/user`
 * and stored only in the OS keychain. Bitbucket does not expose token scopes or
 * expiry, so read-only scope use is documented rather than proved; the
 * connector only ever sends GET requests.
 */

export const BITBUCKET_API = "https://api.bitbucket.org/2.0";

export type BitbucketErrorCode = "invalid" | "revoked" | "unavailable" | "request";

export class BitbucketError extends Error {
  readonly code: BitbucketErrorCode;

  constructor(code: BitbucketErrorCode, message: string) {
    super(message);
    this.name = "BitbucketError";
    this.code = code;
  }
}

export type BitbucketConnection = {
  version: 1;
  apiUrl: string;
  account: { uuid: string; displayName: string };
  token: { email: string; accessToken: string };
  createdAt: string;
};

type Options = {
  store: CredentialStore;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export function normalizeBitbucketApi(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BitbucketError("invalid", "Use a valid Bitbucket Cloud API URL.");
  }
  if (url.username || url.password || url.search || url.hash)
    throw new BitbucketError(
      "invalid",
      "A Bitbucket API URL cannot contain credentials, a query or a fragment.",
    );
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname)))
    throw new BitbucketError(
      "invalid",
      "Use HTTPS for the Bitbucket API (HTTP is allowed only on loopback).",
    );
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function bitbucketAuthorization(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

function validEmail(value: string): boolean {
  return value.length <= 320 && /^[^\s:@]+@[^\s:@]+$/.test(value);
}

async function request(
  apiUrl: string,
  path: string,
  email: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(`${apiUrl}${path}`, {
      headers: {
        accept: "application/json",
        authorization: bitbucketAuthorization(email, token),
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new BitbucketError("unavailable", "Bitbucket could not be reached.");
  }
  if (response.status === 401)
    throw new BitbucketError(
      "revoked",
      "Bitbucket rejected this API token; it may be expired, revoked or invalid.",
    );
  if (!response.ok)
    throw new BitbucketError(
      "request",
      response.status === 403
        ? "Bitbucket denied this token; read:user:bitbucket is required."
        : `Bitbucket rejected the request (${response.status}).`,
    );
  const body = object(await response.json().catch(() => null));
  if (!body) throw new BitbucketError("invalid", "Bitbucket returned an unreadable response.");
  return body;
}

export async function connectBitbucket(
  options: Options & { email: string; token: string; apiUrl?: string },
): Promise<BitbucketConnection> {
  // Reading first proves the keychain is usable before any network call.
  options.store.read();
  const apiUrl = normalizeBitbucketApi(options.apiUrl ?? BITBUCKET_API);
  const email = options.email.trim();
  const token = options.token.trim();
  if (!validEmail(email))
    throw new BitbucketError("invalid", "Use the Atlassian email for this API token.");
  if (token.length < 8 || token.length > 4096 || /\s/.test(token))
    throw new BitbucketError("invalid", "Paste a Bitbucket API token.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const user = await request(apiUrl, "/user", email, token, fetchImpl);
  const uuid = text(user.uuid);
  const displayName = text(user.display_name) ?? text(user.nickname);
  if (!uuid || !displayName)
    throw new BitbucketError("invalid", "Bitbucket returned an incomplete account.");
  const connection: BitbucketConnection = {
    version: 1,
    apiUrl,
    account: { uuid, displayName },
    token: { email, accessToken: token },
    createdAt: new Date(now()).toISOString(),
  };
  const serialized = JSON.stringify(connection);
  options.store.write(serialized);
  if (options.store.read() !== serialized) {
    options.store.clear();
    throw new BitbucketError("unavailable", "The OS keychain did not retain the credential.");
  }
  return connection;
}

export type BitbucketConnectionState = "disconnected" | "connected" | "revoked" | "invalid";

export type BitbucketStatus = {
  state: BitbucketConnectionState;
  connection: BitbucketConnection | null;
  verified: boolean;
};

export function parseBitbucketConnection(raw: string): BitbucketConnection | null {
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
  const apiUrl = text(entry.apiUrl);
  const uuid = text(account.uuid);
  const displayName = text(account.displayName);
  const email = text(token.email);
  const accessToken = text(token.accessToken);
  if (!apiUrl || !uuid || !displayName || !email || !accessToken) return null;
  if (!validEmail(email)) return null;
  try {
    normalizeBitbucketApi(apiUrl);
  } catch {
    return null;
  }
  return entry as BitbucketConnection;
}

export async function bitbucketStatus(options: Options): Promise<BitbucketStatus> {
  const raw = options.store.read();
  if (raw === null) return { state: "disconnected", connection: null, verified: false };
  const connection = parseBitbucketConnection(raw);
  if (!connection) return { state: "invalid", connection: null, verified: false };
  try {
    await request(
      connection.apiUrl,
      "/user",
      connection.token.email,
      connection.token.accessToken,
      options.fetchImpl ?? fetch,
    );
    return { state: "connected", connection, verified: true };
  } catch (error) {
    if (error instanceof BitbucketError && error.code === "revoked") {
      options.store.clear();
      return { state: "revoked", connection, verified: false };
    }
    return { state: "connected", connection, verified: false };
  }
}

export function disconnectBitbucket(store: CredentialStore): void {
  store.clear();
}
