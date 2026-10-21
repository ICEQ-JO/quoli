import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { credential, runtime } from "@traceframe/storage/runtime";

export function sessionToken() {
  return createHmac("sha256", credential()).update("traceframe-browser-session-v1").digest("hex");
}
export function validSession(token: string | undefined) {
  const expected = sessionToken();
  return Boolean(
    token &&
      Buffer.byteLength(token) === Buffer.byteLength(expected) &&
      timingSafeEqual(Buffer.from(token), Buffer.from(expected)),
  );
}
export function validHost(host: string | null) {
  return [`127.0.0.1:${runtime().webPort}`, `localhost:${runtime().webPort}`].includes(host ?? "");
}
export function validSite(site: string | null) {
  return !site || site === "none" || site === "same-origin";
}
export async function collector(path: string) {
  return fetch(`http://127.0.0.1:${runtime().collectorPort}${path}`, {
    headers: { Authorization: `Bearer ${credential()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
}
