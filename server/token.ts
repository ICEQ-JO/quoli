import { createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { home } from "./db.ts";

/**
 * This computer's Quoli secret, in `<QUOLI_HOME>/token` (owner-only). The app sends it with every
 * API request after pairing (the `#pair=` link `quoli open` opens), and the hooks encrypt each
 * event with it, so other accounts and programs on this computer can neither read Quoli nor feed
 * it, and a program that takes port 4400 while Quoli is closed receives only ciphertext.
 */
export function localToken(): string {
  const file = join(home(), "token");
  try {
    const t = readFileSync(file, "utf8").trim();
    if (/^[A-Za-z0-9_-]{32,}$/.test(t)) return t;
  } catch {}
  mkdirSync(home(), { recursive: true, mode: 0o700 });
  const t = randomBytes(32).toString("base64url");
  writeFileSync(file, `${t}\n`, { mode: 0o600 });
  return t;
}

export const tokenExists = () => existsSync(join(home(), "token"));

/** Constant-time comparison of a presented token with the real one. */
export function sameToken(given: unknown, token: string): boolean {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The AES-256-GCM key the hooks seal events with (server/hook.mjs does the same). */
const keyOf = (token: string) => createHash("sha256").update(`quoli-seal:${token}`).digest();

export interface Sealed {
  iv: string;
  data: string;
  tag: string;
}

/** Opens a sealed hook event; null when it was not sealed with this computer's token. */
export function unseal(sealed: unknown, token: string): string | null {
  try {
    const s = sealed as Sealed;
    const decipher = createDecipheriv("aes-256-gcm", keyOf(token), Buffer.from(s.iv, "base64"));
    decipher.setAuthTag(Buffer.from(s.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(s.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * The link that pairs a browser: the app reads the token from the address's #fragment, which the
 * browser never sends to any server (app.iceq.best included), stores it and removes it.
 */
export function pairLink(port: number, token: string, local = false): string {
  const extra = port === 4400 ? "" : `&port=${port}`;
  return local
    ? `http://127.0.0.1:${port}/#pair=${token}`
    : `https://app.iceq.best/#pair=${token}${extra}`;
}
