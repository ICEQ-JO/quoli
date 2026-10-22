import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function port(value: string | undefined, fallback: number): number {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < 1024 || n > 65535)
    throw new Error("Invalid local port (1024–65535 required)");
  return n;
}
export function runtime() {
  const base =
    process.platform === "darwin"
      ? join(homedir(), "Library/Application Support")
      : process.env.XDG_DATA_HOME || join(homedir(), ".local/share");
  const dataDir = resolve(
    /* turbopackIgnore: true */ process.env.TRACEFRAME_DATA_DIR || join(base, "traceframe", "demo"),
  );
  return {
    dataDir,
    credentialFile: join(dataDir, "credential"),
    dbFile: join(dataDir, "traceframe.sqlite"),
    collectorPort: port(process.env.TRACEFRAME_COLLECTOR_PORT, 4318),
    webPort: port(process.env.TRACEFRAME_WEB_PORT, 3140),
  };
}
export function initializeCredential(): string {
  const config = runtime();
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  chmodSync(config.dataDir, 0o700);
  try {
    writeFileSync(config.credentialFile, randomBytes(32).toString("hex"), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  chmodSync(config.credentialFile, 0o600);
  return credential();
}
export function credential(): string {
  const value = readFileSync(/* turbopackIgnore: true */ runtime().credentialFile, "utf8").trim();
  if (!/^[a-f0-9]{64}$/.test(value))
    throw new Error("Invalid local credential; use the documented recovery procedure");
  return value;
}
export function rotateCredential(): void {
  initializeCredential();
  writeFileSync(runtime().credentialFile, randomBytes(32).toString("hex"), { mode: 0o600 });
}
