/**
 * Read-only GitHub App connection (device flow).
 *
 * GitHub Apps request fine-grained permissions instead of OAuth scopes, so this
 * client refuses any installation that grants more than read access and keeps
 * the resulting user access token in the OS keychain only. The device-flow
 * contract and response fields are the ones documented by GitHub for GitHub App
 * user access tokens; a local fake provider exercises every state.
 */

export const GITHUB_ENDPOINTS = {
  web: "https://github.com",
  api: "https://api.github.com",
} as const;

export type GithubEndpoints = { web: string; api: string };

/** The subset of the OS-keychain handle this module needs. */
export type CredentialStore = {
  read(): string | null;
  write(secret: string): void;
  clear(): void;
};

export type GithubErrorCode =
  | "denied"
  | "expired"
  | "disabled"
  | "invalid"
  | "revoked"
  | "unavailable"
  | "request";

export class GithubError extends Error {
  readonly code: GithubErrorCode;

  constructor(code: GithubErrorCode, message: string) {
    super(message);
    this.name = "GithubError";
    this.code = code;
  }
}

export type DeviceAuthorization = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
};

export type GithubToken = {
  accessToken: string;
  accessExpiresAt: string | null;
  refreshToken: string | null;
  refreshExpiresAt: string | null;
};

export type GithubInstallation = {
  id: number;
  account: string;
  repositorySelection: "all" | "selected" | "unknown";
  permissions: Record<string, string>;
};

export type GithubConnection = {
  version: 1;
  clientId: string;
  endpoints: GithubEndpoints;
  account: { login: string; id: number };
  installations: GithubInstallation[];
  token: GithubToken;
  createdAt: string;
};

type Fetch = typeof fetch;
type Options = {
  fetchImpl?: Fetch;
  /** Read-only keychain handle; never a file. */
  store: CredentialStore;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
const integer = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function iso(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function expiry(seconds: number | null, now: number): string | null {
  return seconds === null ? null : iso(now + seconds * 1000);
}

async function postForm(
  url: string,
  parameters: Record<string, string>,
  fetchImpl: Fetch,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(parameters).toString(),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GithubError("unavailable", "GitHub could not be reached.");
  }
  if (!response.ok)
    throw new GithubError("request", `GitHub rejected the request (${response.status}).`);
  const body = object(await response.json().catch(() => null));
  if (!body) throw new GithubError("invalid", "GitHub returned an unreadable response.");
  return body;
}

async function getJson(
  url: string,
  token: string,
  fetchImpl: Fetch,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2026-03-10",
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GithubError("unavailable", "GitHub could not be reached.");
  }
  if (response.status === 401)
    throw new GithubError("revoked", "GitHub revoked or expired this authorization.");
  if (!response.ok)
    throw new GithubError("request", `GitHub rejected the request (${response.status}).`);
  const body = object(await response.json().catch(() => null));
  if (!body) throw new GithubError("invalid", "GitHub returned an unreadable response.");
  return body;
}

function tokenFrom(body: Record<string, unknown>, now: number): GithubToken {
  const accessToken = text(body.access_token);
  if (!accessToken) throw new GithubError("invalid", "GitHub returned no access token.");
  const refreshToken = text(body.refresh_token);
  return {
    accessToken,
    accessExpiresAt: expiry(integer(body.expires_in), now),
    refreshToken,
    refreshExpiresAt: refreshToken ? expiry(integer(body.refresh_token_expires_in), now) : null,
  };
}

export async function requestDeviceCode(
  endpoints: GithubEndpoints,
  clientId: string,
  fetchImpl: Fetch = fetch,
): Promise<DeviceAuthorization> {
  const body = await postForm(
    `${endpoints.web}/login/device/code`,
    { client_id: clientId },
    fetchImpl,
  );
  const deviceCode = text(body.device_code);
  const userCode = text(body.user_code);
  const verificationUri = text(body.verification_uri);
  const expiresIn = integer(body.expires_in);
  const interval = integer(body.interval);
  if (!deviceCode || !userCode || !verificationUri || expiresIn === null || interval === null)
    throw new GithubError("invalid", "GitHub returned an incomplete device authorization.");
  return { deviceCode, userCode, verificationUri, expiresIn, interval };
}

export async function pollDeviceToken(
  endpoints: GithubEndpoints,
  clientId: string,
  authorization: DeviceAuthorization,
  options: { fetchImpl?: Fetch; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<GithubToken> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((milliseconds: number) => new Promise((done) => setTimeout(done, milliseconds)));
  const deadline = now() + authorization.expiresIn * 1000;
  let interval = authorization.interval;
  for (;;) {
    if (now() >= deadline)
      throw new GithubError("expired", "The device code expired before authorization.");
    await sleep(interval * 1000);
    const body = await postForm(
      `${endpoints.web}/login/oauth/access_token`,
      {
        client_id: clientId,
        device_code: authorization.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      },
      fetchImpl,
    );
    if (text(body.access_token)) return tokenFrom(body, now());
    const error = text(body.error);
    if (error === "authorization_pending") continue;
    if (error === "slow_down") {
      interval = integer(body.interval) ?? interval + 5;
      continue;
    }
    if (error === "access_denied")
      throw new GithubError("denied", "Authorization was denied; nothing was stored.");
    if (error === "expired_token" || error === "bad_verification_code")
      throw new GithubError("expired", "The device code expired before authorization.");
    if (error === "device_flow_disabled")
      throw new GithubError("disabled", "Device flow is not enabled for this GitHub App.");
    throw new GithubError(
      "invalid",
      `GitHub rejected the device authorization (${error ?? "unknown error"}).`,
    );
  }
}

export async function refreshAccessToken(
  endpoints: GithubEndpoints,
  clientId: string,
  refreshToken: string,
  options: { fetchImpl?: Fetch; now?: () => number } = {},
): Promise<GithubToken> {
  const body = await postForm(
    `${endpoints.web}/login/oauth/access_token`,
    { client_id: clientId, grant_type: "refresh_token", refresh_token: refreshToken },
    options.fetchImpl ?? fetch,
  );
  const error = text(body.error);
  if (error === "bad_refresh_token")
    throw new GithubError("expired", "The refresh token expired; connect again.");
  if (error) throw new GithubError("invalid", `GitHub rejected the refresh (${error}).`);
  return tokenFrom(body, (options.now ?? Date.now)());
}

export async function fetchAccount(
  endpoints: GithubEndpoints,
  token: string,
  fetchImpl: Fetch = fetch,
): Promise<{ login: string; id: number }> {
  const body = await getJson(`${endpoints.api}/user`, token, fetchImpl);
  const login = text(body.login);
  const id = integer(body.id);
  if (!login || id === null)
    throw new GithubError("invalid", "GitHub returned an incomplete account.");
  return { login, id };
}

export async function fetchInstallations(
  endpoints: GithubEndpoints,
  token: string,
  fetchImpl: Fetch = fetch,
): Promise<GithubInstallation[]> {
  const body = await getJson(`${endpoints.api}/user/installations?per_page=100`, token, fetchImpl);
  const list = Array.isArray(body.installations) ? body.installations : [];
  const installations: GithubInstallation[] = [];
  for (const raw of list) {
    const item = object(raw);
    const account = object(item?.account);
    const id = integer(item?.id);
    const login = text(account?.login);
    if (!item || id === null || !login) continue;
    const permissions: Record<string, string> = {};
    for (const [name, value] of Object.entries(object(item.permissions) ?? {}))
      if (typeof value === "string") permissions[name] = value;
    installations.push({
      id,
      account: login,
      repositorySelection:
        item.repository_selection === "all"
          ? "all"
          : item.repository_selection === "selected"
            ? "selected"
            : "unknown",
      permissions,
    });
  }
  return installations;
}

/** The connection is only accepted when every installation is read-only. */
function requireReadOnly(installations: GithubInstallation[]): void {
  for (const installation of installations)
    for (const [name, value] of Object.entries(installation.permissions))
      if (value !== "read")
        throw new GithubError(
          "invalid",
          `The GitHub App grants ${name}=${value}; Quoli requires read-only permissions.`,
        );
}

export async function connectGithub(
  options: Options & {
    clientId: string;
    endpoints?: GithubEndpoints;
    announce: (authorization: DeviceAuthorization) => void;
  },
): Promise<GithubConnection> {
  const endpoints = options.endpoints ?? GITHUB_ENDPOINTS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  // Fail closed before starting a flow when the keychain cannot be used.
  options.store.read();
  const authorization = await requestDeviceCode(endpoints, options.clientId, fetchImpl);
  options.announce(authorization);
  const token = await pollDeviceToken(endpoints, options.clientId, authorization, options);
  const account = await fetchAccount(endpoints, token.accessToken, fetchImpl);
  const installations = await fetchInstallations(endpoints, token.accessToken, fetchImpl);
  requireReadOnly(installations);
  const connection: GithubConnection = {
    version: 1,
    clientId: options.clientId,
    endpoints,
    account,
    installations,
    token,
    createdAt: iso(now()),
  };
  const serialized = JSON.stringify(connection);
  options.store.write(serialized);
  if (options.store.read() !== serialized) {
    options.store.clear();
    throw new GithubError("unavailable", "The OS keychain did not retain the credential.");
  }
  return connection;
}

export type ConnectionState = "disconnected" | "connected" | "expired" | "revoked" | "invalid";

export type ConnectionStatus = {
  state: ConnectionState;
  connection: GithubConnection | null;
  /** False when the token could not be checked because GitHub was unreachable. */
  verified: boolean;
};

function parseConnection(raw: string): GithubConnection | null {
  const value = object(JSON.parse(raw) as unknown);
  if (value?.version !== 1) return null;
  const endpoints = object(value.endpoints);
  const account = object(value.account);
  const token = object(value.token);
  if (!endpoints || !account || !token) return null;
  if (!text(value.clientId) || !text(value.createdAt)) return null;
  if (!text(endpoints.web) || !text(endpoints.api)) return null;
  if (!text(account.login) || integer(account.id) === null) return null;
  if (!text(token.accessToken)) return null;
  if (!Array.isArray(value.installations)) return null;
  return value as GithubConnection;
}

/**
 * Reports the stored state, refreshing an expired access token once and
 * clearing credentials GitHub no longer accepts.
 */
export async function connectionStatus(options: Options): Promise<ConnectionStatus> {
  const raw = options.store.read();
  if (raw === null) return { state: "disconnected", connection: null, verified: false };
  const connection = parseConnection(raw);
  if (!connection) return { state: "invalid", connection: null, verified: false };
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const expired =
    connection.token.accessExpiresAt !== null &&
    Date.parse(connection.token.accessExpiresAt) <= now();
  let current = connection;
  if (expired) {
    const refreshable =
      connection.token.refreshToken !== null &&
      connection.token.refreshExpiresAt !== null &&
      Date.parse(connection.token.refreshExpiresAt) > now();
    if (!refreshable) {
      options.store.clear();
      return { state: "expired", connection, verified: false };
    }
    try {
      const token = await refreshAccessToken(
        connection.endpoints,
        connection.clientId,
        connection.token.refreshToken as string,
        { fetchImpl, now },
      );
      current = {
        ...connection,
        token: {
          ...token,
          refreshToken: token.refreshToken ?? connection.token.refreshToken,
          refreshExpiresAt: token.refreshExpiresAt ?? connection.token.refreshExpiresAt,
        },
      };
      options.store.write(JSON.stringify(current));
      return { state: "connected", connection: current, verified: true };
    } catch (error) {
      if (error instanceof GithubError && error.code === "unavailable")
        return { state: "expired", connection, verified: false };
      options.store.clear();
      return { state: "expired", connection, verified: false };
    }
  }
  try {
    await fetchAccount(connection.endpoints, connection.token.accessToken, fetchImpl);
    return { state: "connected", connection, verified: true };
  } catch (error) {
    if (error instanceof GithubError && error.code === "revoked") {
      options.store.clear();
      return { state: "revoked", connection, verified: false };
    }
    if (error instanceof GithubError && error.code === "unavailable")
      return { state: "connected", connection, verified: false };
    return { state: "connected", connection, verified: false };
  }
}

export function disconnectGithub(store: CredentialStore): void {
  store.clear();
}

/** Permissions common to every installation, for display only. */
export function grantedPermissions(connection: GithubConnection): string[] {
  const names = new Set<string>();
  for (const installation of connection.installations)
    for (const [name, value] of Object.entries(installation.permissions))
      names.add(`${name}=${value}`);
  return [...names].sort();
}
