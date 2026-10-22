import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type { CliConfig } from "./config";

export type ServiceState = {
  format: 1;
  instance: string;
  token: string;
  pid: number;
  controlPort: number;
  startedAt: string;
  releaseRoot: string;
  webPort: number;
  collectorPort: number;
};
export type ServiceHealth = {
  instance: string;
  phase: "starting" | "ready" | "stopping";
  webPort: number;
  collectorPort: number;
  startedAt: string;
};
export const signature = (token: string, challenge: string) =>
  createHmac("sha256", token).update(challenge).digest("hex");
export function equal(a: string, b: string) {
  return (
    Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export function readState(config: CliConfig): ServiceState | null {
  if (!existsSync(config.stateFile)) return null;
  const state = JSON.parse(readFileSync(config.stateFile, "utf8")) as ServiceState;
  if (
    state.format !== 1 ||
    !/^[a-f0-9]{32}$/.test(state.instance) ||
    !/^[a-f0-9]{64}$/.test(state.token) ||
    !Number.isInteger(state.pid) ||
    state.pid < 0 ||
    !Number.isInteger(state.controlPort) ||
    state.controlPort < 0 ||
    state.controlPort > 65535 ||
    !Number.isFinite(Date.parse(state.startedAt)) ||
    typeof state.releaseRoot !== "string" ||
    !Number.isInteger(state.webPort) ||
    !Number.isInteger(state.collectorPort)
  )
    throw new Error(
      "Invalid service state. Preserve the data directory and inspect quoli-service.json.",
    );
  return state;
}
export function writeState(config: CliConfig, state: ServiceState) {
  const temporary = `${config.stateFile}.${state.instance}.tmp`;
  writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, config.stateFile);
}
export function removeState(config: CliConfig, instance: string) {
  if (readState(config)?.instance === instance) unlinkSync(config.stateFile);
}
export async function identify(state: ServiceState): Promise<boolean> {
  if (!state.controlPort) return false;
  const challenge = randomBytes(24).toString("hex");
  try {
    const response = await fetch(
      `http://127.0.0.1:${state.controlPort}/identity?challenge=${challenge}`,
      { signal: AbortSignal.timeout(750), redirect: "error" },
    );
    const data = (await response.json()) as { instance?: string; signature?: string };
    return (
      response.ok &&
      data.instance === state.instance &&
      typeof data.signature === "string" &&
      equal(data.signature, signature(state.token, challenge))
    );
  } catch {
    return false;
  }
}
export async function control(
  state: ServiceState,
  action: "status" | "stop",
): Promise<ServiceHealth> {
  if (!(await identify(state)))
    throw new Error("Cannot verify the managed service. No process was signalled.");
  const response = await fetch(`http://127.0.0.1:${state.controlPort}/${action}`, {
    method: action === "stop" ? "POST" : "GET",
    headers: { Authorization: `Bearer ${state.token}` },
    signal: AbortSignal.timeout(1500),
    redirect: "error",
  });
  const data = (await response.json()) as ServiceHealth;
  if (!response.ok || data.instance !== state.instance)
    throw new Error("Managed service control failed.");
  return data;
}
