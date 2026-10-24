import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { githubCommand } from "../apps/cli/src/github";
import {
  type CredentialStore,
  connectGithub,
  connectionStatus,
  disconnectGithub,
  GITHUB_ENDPOINTS,
  GithubError,
  grantedPermissions,
} from "../packages/repository/src/github";
import { KeychainUnavailable, osKeychain } from "../packages/storage/src/keychain";

type DeviceMode = "success" | "pending" | "slow-down" | "denied" | "expired";

type ProviderConfig = {
  device?: DeviceMode;
  expiresIn?: number;
  refresh?: "success" | "bad";
  revoke?: boolean;
  permissions?: Record<string, string>;
};

type Recorded = { method: string; url: string; authorization: string | null };

async function provider(config: ProviderConfig = {}) {
  const requests: Recorded[] = [];
  let polls = 0;
  let base = "";
  const server: Server = createServer((request: IncomingMessage, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      requests.push({
        method: request.method ?? "",
        url: request.url ?? "",
        authorization: (request.headers.authorization as string | undefined) ?? null,
      });
      const form = new URLSearchParams(body);
      const send = (status: number, value: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(value));
      };
      if (request.url === "/login/device/code")
        return send(200, {
          device_code: "device-secret",
          user_code: "ABCD-EFGH",
          verification_uri: `${base}/login/device`,
          expires_in: config.expiresIn ?? 900,
          interval: 1,
        });
      if (request.url === "/login/oauth/access_token") {
        if (form.get("grant_type") === "refresh_token")
          return config.refresh === "bad"
            ? send(200, { error: "bad_refresh_token" })
            : send(200, {
                access_token: "ghu_refreshed",
                expires_in: 28_800,
                refresh_token: "ghr_2",
                refresh_token_expires_in: 15_897_600,
                token_type: "bearer",
              });
        polls += 1;
        if (config.device === "denied") return send(200, { error: "access_denied" });
        if (config.device === "expired") return send(200, { error: "expired_token" });
        if (config.device === "slow-down" && polls === 1)
          return send(200, { error: "slow_down", interval: 1 });
        if (config.device === "pending" && polls === 1)
          return send(200, { error: "authorization_pending" });
        return send(200, {
          access_token: "ghu_access",
          expires_in: 28_800,
          refresh_token: "ghr_1",
          refresh_token_expires_in: 15_897_600,
          token_type: "bearer",
        });
      }
      if (request.url === "/user") {
        if (config.revoke || request.headers.authorization !== "Bearer ghu_access")
          return send(401, { message: "Bad credentials" });
        return send(200, { login: "octocat", id: 1 });
      }
      if (request.url?.startsWith("/user/installations"))
        return send(200, {
          total_count: 1,
          installations: [
            {
              id: 11,
              account: { login: "acme" },
              repository_selection: "selected",
              permissions: config.permissions ?? { contents: "read", metadata: "read" },
            },
          ],
        });
      send(404, { message: "Not Found" });
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    endpoints: { web: base, api: base },
    requests,
    pollCount: () => polls,
    setRevoked: () => {
      config.revoke = true;
    },
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}

function memoryStore(initial: string | null = null) {
  let value = initial;
  return {
    read: () => value,
    write: (secret: string) => {
      value = secret;
    },
    clear: () => {
      value = null;
    },
    peek: () => value,
  };
}

const unavailableStore: CredentialStore = {
  read: () => {
    throw new KeychainUnavailable();
  },
  write: () => {
    throw new KeychainUnavailable();
  },
  clear: () => {
    throw new KeychainUnavailable();
  },
};

function captured() {
  const lines: string[] = [];
  return { lines, out: (line: string) => lines.push(line), text: () => lines.join("\n") };
}

async function connect(fake: Awaited<ReturnType<typeof provider>>, store = memoryStore()) {
  const output = captured();
  await githubCommand(
    [
      "connect",
      "--client-id",
      "Iv1abc",
      "--web-url",
      fake.endpoints.web,
      "--api-url",
      fake.endpoints.api,
    ],
    { store, sleep: async () => {}, out: output.out },
  );
  return { store, output };
}

test("connect stores the read-only connection and never prints secrets", async () => {
  const fake = await provider();
  const { store, output } = await connect(fake);
  const raw = store.peek();
  assert.ok(raw);
  const record = JSON.parse(raw);
  assert.equal(record.account.login, "octocat");
  assert.equal(record.installations[0].repositorySelection, "selected");
  assert.deepEqual(record.installations[0].permissions, { contents: "read", metadata: "read" });
  assert.match(output.text(), /Connected as @octocat/);
  assert.match(output.text(), /contents=read, metadata=read/);
  assert.ok(!output.text().includes("ghu_access"));
  assert.ok(!output.text().includes("ghr_1"));
  assert.ok(!output.text().includes("device-secret"));
  for (const request of fake.requests) {
    assert.ok(!request.url.includes("ghu_access"));
    assert.ok(!request.url.includes("device-secret"));
  }
  await fake.close();
});

test("polling waits through pending and slow_down responses", async () => {
  for (const device of ["pending", "slow-down"] as const) {
    const fake = await provider({ device });
    const { store } = await connect(fake);
    assert.equal(fake.pollCount(), 2);
    assert.ok(store.peek());
    await fake.close();
  }
});

test("denied authorization stores nothing", async () => {
  const fake = await provider({ device: "denied" });
  const store = memoryStore();
  await assert.rejects(connect(fake, store), (error: unknown) => {
    assert.ok(error instanceof GithubError);
    assert.equal(error.code, "denied");
    return true;
  });
  assert.equal(store.peek(), null);
  await fake.close();
});

test("expired device codes store nothing", async () => {
  const fake = await provider({ device: "expired" });
  const store = memoryStore();
  await assert.rejects(connect(fake, store), (error: unknown) => {
    assert.ok(error instanceof GithubError);
    assert.equal(error.code, "expired");
    return true;
  });
  assert.equal(store.peek(), null);
  await fake.close();

  const deadline = await provider({ expiresIn: 0 });
  await assert.rejects(
    connect(deadline, memoryStore()),
    (error: unknown) => error instanceof GithubError && error.code === "expired",
  );
  await deadline.close();
});

test("connect fails closed when the keychain is unavailable", async () => {
  const fake = await provider();
  await assert.rejects(
    githubCommand(["connect", "--client-id", "Iv1abc", "--web-url", fake.endpoints.web], {
      store: unavailableStore,
      sleep: async () => {},
      out: () => {},
    }),
    KeychainUnavailable,
  );
  assert.equal(fake.requests.length, 0);
  await fake.close();
});

test("connect refuses an installation with write permissions", async () => {
  const fake = await provider({ permissions: { contents: "write", metadata: "read" } });
  const store = memoryStore();
  await assert.rejects(connect(fake, store), /requires read-only permissions/);
  assert.equal(store.peek(), null);
  await fake.close();
});

test("status refreshes an expired access token", async () => {
  const fake = await provider();
  const started = Date.parse("2026-10-24T00:00:00Z");
  const store = memoryStore();
  const connection = await connectGithub({
    clientId: "Iv1abc",
    endpoints: fake.endpoints,
    store,
    now: () => started,
    sleep: async () => {},
    announce: () => {},
  });
  const later = started + 9 * 60 * 60 * 1000;
  const status = await connectionStatus({
    store,
    fetchImpl: fetch,
    now: () => later,
  });
  assert.equal(status.state, "connected");
  assert.equal(status.verified, true);
  assert.equal(status.connection?.token.accessToken, "ghu_refreshed");
  assert.equal(JSON.parse(store.peek() as string).token.accessToken, "ghu_refreshed");
  assert.equal(connection.token.accessToken, "ghu_access");
  const refresh = fake.requests.find((request) => request.url === "/login/oauth/access_token");
  assert.ok(refresh);
  assert.ok(!refresh.url.includes("ghu_access"));
  await fake.close();
});

test("status clears a credential whose refresh token expired", async () => {
  const fake = await provider({ refresh: "bad" });
  const started = Date.parse("2026-10-24T00:00:00Z");
  const store = memoryStore();
  await connectGithub({
    clientId: "Iv1abc",
    endpoints: fake.endpoints,
    store,
    now: () => started,
    sleep: async () => {},
    announce: () => {},
  });
  const status = await connectionStatus({
    store,
    now: () => started + 200 * 24 * 60 * 60 * 1000,
  });
  assert.equal(status.state, "expired");
  assert.equal(store.peek(), null);
  await fake.close();
});

test("status reports revoked authorization and clears the credential", async () => {
  const fake = await provider();
  const { store, output } = await connect(fake);
  fake.setRevoked();
  const status = await connectionStatus({ store });
  assert.equal(status.state, "revoked");
  assert.equal(store.peek(), null);
  output.lines.length = 0;
  await githubCommand(["status"], { store, out: output.out });
  assert.match(output.text(), /not connected/);
  await fake.close();
});

test("status stays connected but unverified when GitHub is unreachable", async () => {
  const fake = await provider();
  const { store } = await connect(fake);
  await fake.close();
  const status = await connectionStatus({ store });
  assert.equal(status.state, "connected");
  assert.equal(status.verified, false);
});

test("status and disconnect never print the credential", async () => {
  const fake = await provider();
  const { store, output } = await connect(fake);
  output.lines.length = 0;
  await githubCommand(["status"], { store, out: output.out });
  assert.match(output.text(), /connected as @octocat/);
  assert.ok(!output.text().includes("ghu_access"));
  output.lines.length = 0;
  await githubCommand(["disconnect"], { store, out: output.out });
  assert.equal(store.peek(), null);
  assert.match(output.text(), /Revoke the app authorization/);
  assert.ok(!output.text().includes("ghu_access"));
  await fake.close();
});

test("status reports disconnected without a credential", async () => {
  const output = captured();
  await githubCommand(["status"], { store: memoryStore(), out: output.out });
  assert.match(output.text(), /not connected/);
});

test("unknown options and actions are rejected", async () => {
  await assert.rejects(
    githubCommand(["connect", "--client-id", "Iv1abc", "--token", "x"], { store: memoryStore() }),
    /Unknown github option/,
  );
  await assert.rejects(
    githubCommand(["forget"], { store: memoryStore(), out: () => {} }),
    /Use quoli github connect/,
  );
});

test("GitHub endpoints default to github.com and api.github.com", () => {
  assert.deepEqual(GITHUB_ENDPOINTS, {
    web: "https://github.com",
    api: "https://api.github.com",
  });
});

test("grantedPermissions unions installation permissions", () => {
  const permissions = grantedPermissions({
    version: 1,
    clientId: "Iv1abc",
    endpoints: GITHUB_ENDPOINTS,
    account: { login: "octocat", id: 1 },
    installations: [
      {
        id: 1,
        account: "acme",
        repositorySelection: "all",
        permissions: { contents: "read", metadata: "read" },
      },
      {
        id: 2,
        account: "octo-org",
        repositorySelection: "selected",
        permissions: { metadata: "read", issues: "read" },
      },
    ],
    token: {
      accessToken: "ghu_access",
      accessExpiresAt: null,
      refreshToken: null,
      refreshExpiresAt: null,
    },
    createdAt: "2026-10-24T00:00:00.000Z",
  });
  assert.deepEqual(permissions, ["contents=read", "issues=read", "metadata=read"]);
});

test("the Linux keychain stores, reads and clears a credential", async (t) => {
  if (process.platform !== "linux") return t.skip("Secret Service test runs on Linux only.");
  const account = `test-${process.pid}-${Date.now()}`;
  let keychain: ReturnType<typeof osKeychain>;
  try {
    keychain = osKeychain("quoli-test", account);
    keychain.write("probe-secret");
  } catch (error) {
    if (error instanceof KeychainUnavailable) return t.skip("No Secret Service is available.");
    throw error;
  }
  try {
    assert.equal(keychain.read(), "probe-secret");
    disconnectGithub(keychain);
    assert.equal(keychain.read(), null);
  } finally {
    keychain.clear();
  }
});
