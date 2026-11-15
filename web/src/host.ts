/**
 * Where this copy of the app runs. Served by Quoli itself (http://127.0.0.1:4400) it reads its own
 * server. Served by the Quoli website (/studio/ on iceq.best, or app.iceq.best) it reads Quoli on
 * this computer straight from the browser: the site never sees the data (server/app.ts lets only
 * the site's origins in).
 */
const LOOPBACK = ["127.0.0.1", "localhost", "[::1]"];

export const hosted = !LOOPBACK.includes(location.hostname);

/** The path the app is mounted at on the site; "" when it owns the whole address. */
export const BASE =
  location.pathname === "/studio" || location.pathname.startsWith("/studio/") ? "/studio" : "";

const PORT_KEY = "quoli.port";
const TOKEN_KEY = "quoli.token";

/**
 * Pairing: `quoli open` (or the link Quoli prints) opens this page with #pair=<token>[&port=<n>].
 * The fragment never reaches any server; the token is kept in this browser for this site and the
 * fragment is removed from the address at once.
 */
(function pairFromLink() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const token = hash.get("pair");
  if (!token || !/^[A-Za-z0-9_-]{32,}$/.test(token)) return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
    const port = hash.get("port");
    if (port && /^\d{2,5}$/.test(port)) localStorage.setItem(PORT_KEY, port);
  } catch {}
  history.replaceState(null, "", location.pathname + location.search);
})();

/** Headers that prove this browser was paired with this computer's Quoli (server/token.ts). */
export function authHeaders(): Record<string, string> {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) return { "X-Quoli-Token": t };
  } catch {}
  return {};
}
function savedPort(): string {
  try {
    const p = localStorage.getItem(PORT_KEY);
    if (p && /^\d{2,5}$/.test(p)) return p;
  } catch {}
  return "4400";
}

export const localPort = savedPort();
export const LOCAL = `http://127.0.0.1:${localPort}`;

/** Prefix for API requests: the local Quoli when hosted, the same origin otherwise. */
export const API_BASE = hosted ? LOCAL : "";

export function setLocalPort(port: string) {
  try {
    if (port === "4400") localStorage.removeItem(PORT_KEY);
    else localStorage.setItem(PORT_KEY, port);
  } catch {}
}
