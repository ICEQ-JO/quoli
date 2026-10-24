import {
  type CredentialStore,
  connectGithub,
  connectionStatus,
  disconnectGithub,
  GITHUB_ENDPOINTS,
  grantedPermissions,
} from "../../../packages/repository/src/github";
import { osKeychain } from "../../../packages/storage/src/keychain";

/**
 * `quoli github` — read-only GitHub App connection.
 *
 * The token lives in the OS keychain. Output shows the account, the app's
 * read-only permissions, repository scope and expiry; the credential itself is
 * never printed and never appears in a URL.
 */

type Dependencies = {
  store?: CredentialStore;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  out?: (line: string) => void;
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

export async function githubCommand(
  argv: string[],
  dependencies: Dependencies = {},
): Promise<void> {
  const out = dependencies.out ?? ((line: string) => console.log(line));
  const [action, ...args] = argv;
  const store = dependencies.store ?? osKeychain();
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
  if (action === "disconnect") {
    if (args.length) throw new Error("Use quoli github disconnect.");
    disconnectGithub(store);
    out(
      "GitHub credential removed from the OS keychain. Revoke the app authorization at https://github.com/settings/apps/authorizations.",
    );
    return;
  }
  throw new Error("Use quoli github connect --client-id CLIENT_ID | status | disconnect.");
}
