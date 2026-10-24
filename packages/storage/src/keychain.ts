import { spawnSync } from "node:child_process";

/**
 * OS-keychain credential storage.
 *
 * Quoli keeps provider tokens out of SQLite, URLs and logs. Linux uses the
 * Secret Service through `secret-tool`; any missing or refused keychain fails
 * closed before a credential is stored or read. Other platforms are not
 * implemented yet, so they report unavailable rather than falling back to a
 * plaintext file.
 */

export class KeychainUnavailable extends Error {
  constructor(
    message = "Secure credential storage is unavailable; no credential was stored or read.",
  ) {
    super(message);
    this.name = "KeychainUnavailable";
  }
}

export type Keychain = {
  read(): string | null;
  write(secret: string): void;
  clear(): void;
};

const SERVICE = "quoli";
const ACCOUNT = "github";
const LABELS: Record<string, string> = { github: "GitHub", gitlab: "GitLab" };

function secretTool(service: string, account: string): Keychain {
  const run = (args: string[], input?: string) => {
    const result = spawnSync("secret-tool", args, {
      input,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 1 << 20,
    });
    // A missing binary, an absent session bus and a locked keyring all fail here.
    if (result.error || (result.status !== 0 && (result.stderr ?? "").trim()))
      throw new KeychainUnavailable();
    return result;
  };
  return {
    read() {
      const result = run(["lookup", "service", service, "account", account]);
      return result.status === 0 ? result.stdout : null;
    },
    write(secret) {
      const result = run(
        [
          "store",
          "--label",
          `Quoli ${LABELS[account] ?? account} connection`,
          "service",
          service,
          "account",
          account,
        ],
        secret,
      );
      if (result.status !== 0) throw new KeychainUnavailable();
    },
    clear() {
      run(["clear", "service", service, "account", account]);
    },
  };
}

/** Returns the operating-system keychain, or throws when it cannot be used. */
export function osKeychain(service = SERVICE, account = ACCOUNT): Keychain {
  if (process.platform !== "linux")
    throw new KeychainUnavailable(
      "Secure credential storage is only implemented for the Linux Secret Service; no credential was stored.",
    );
  return secretTool(service, account);
}
