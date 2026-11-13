import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import type { Store } from "./db.ts";
import { HOSTED, loadSync, saveSync } from "./sync.ts";

/**
 * Connect this computer to a Quoli account (#154) through the browser instead of copying a sync
 * key. See supabase/migrations/20261112200000_connect.sql: start a request with the hash of a
 * secret, show its short code, the signed-in user approves it on the account page, then collect
 * a sync key once with the secret.
 */

export const ACCOUNT_PAGE = "https://iceq.best/app/";
const TEN_MINUTES = 10 * 60_000;

export interface Service {
  url: string;
  anonKey: string;
}
export interface Link {
  /** The short code the user approves, e.g. ABCD-EFGH. */
  pair: string;
  /** The account page with the code filled in. */
  url: string;
  /** The secret that collects the key; never shown. */
  code: string;
  expiresAt: number;
}

async function rpc(s: Service, name: string, args: unknown, fetchImpl: typeof fetch) {
  const res = await fetchImpl(`${s.url.replace(/\/+$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: s.anonKey,
      Authorization: `Bearer ${s.anonKey}`,
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    const m = (body as { message?: unknown } | null)?.message;
    throw new Error(typeof m === "string" ? m : `the account service answered ${res.status}`);
  }
  return body;
}

export async function startLink(
  s: Service,
  { fetchImpl = fetch, now = Date.now() } = {},
): Promise<Link> {
  const code = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(code).digest("hex");
  const pair = await rpc(s, "link_start", { p_code_hash: hash }, fetchImpl);
  if (typeof pair !== "string") throw new Error("the account service gave no code");
  return {
    pair,
    url: `${ACCOUNT_PAGE}?connect=${pair}`,
    code,
    expiresAt: now + TEN_MINUTES,
  };
}

/** The sync key once the request is approved; null while it waits. Throws once it expired. */
export async function collectLink(
  s: Service,
  link: Link,
  { fetchImpl = fetch } = {},
): Promise<string | null> {
  const key = await rpc(s, "link_collect", { p_code: link.code }, fetchImpl);
  return typeof key === "string" ? key : null;
}

/** Polls until approved (the key) or expired (throws). */
export async function waitForLink(
  s: Service,
  link: Link,
  {
    fetchImpl = fetch,
    every = 2000,
    isCancelled = (): boolean => false,
  }: { fetchImpl?: typeof fetch; every?: number; isCancelled?: () => boolean } = {},
): Promise<string> {
  for (;;) {
    if (isCancelled()) throw new Error("cancelled");
    try {
      const key = await collectLink(s, link, { fetchImpl });
      if (key) return key;
    } catch (error) {
      // A network blip is retried; the service saying it expired is final.
      if (Date.now() >= link.expiresAt || /expired/.test(String(error))) throw error;
    }
    if (Date.now() >= link.expiresAt) throw new Error("this link expired; run connect again");
    await new Promise((r) => setTimeout(r, every));
  }
}

/** Saves the key and turns Team sync on for sessions from now on. */
export function saveLinkedKey(store: Store, key: string, now = new Date()) {
  const c = loadSync(store);
  saveSync(store, {
    ...c,
    key,
    enabled: true,
    since: c.enabled && c.since ? c.since : now.toISOString(),
    lastError: null,
  });
}

/** Opens a URL in the default browser; quietly does nothing where that is not possible. */
export function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", '""', url.replaceAll("&", "^&")]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args as string[], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {}
}

/**
 * `quoli connect`: record every repository for the agents, link this computer to the account
 * through the browser, and turn Team sync on. Returns "start" when Quoli should start next, or an
 * exit code.
 */
export async function connectCli(
  args: string[],
  { askToLink = false } = {},
): Promise<number | "start"> {
  const { setupCli, START } = await import("./setup.ts");
  const { Store } = await import("./db.ts");
  const { chooseScope, yes } = await import("./onboard.ts");
  console.log("1. Which projects to record\n");
  console.log(`   ${await chooseScope(args)}\n`);
  if (setupCli([], false) !== 0) {
    console.log("\n   Some agents could not be set up; the others are recording.");
  }

  const store = new Store();
  const current = loadSync(store);
  const offerLink = async () => {
    console.log(
      "\n2. Your Quoli account (optional): see your sessions at iceq.best and share them with a team.\n   Only summaries are sent, never prompts or code.\n",
    );
    return yes("   Connect this computer now?");
  };
  if (!HOSTED.url || !HOSTED.anonKey) {
    console.log(
      "\n2. This copy of Quoli has no account service; everything stays on this computer.",
    );
  } else if (current.key && current.enabled && !args.includes("--again")) {
    console.log(
      "\n2. This computer is already connected to your Quoli account.\n   (`connect --again` links it again, for example to another account.)",
    );
  } else if (askToLink && !(await offerLink())) {
    console.log("   Skipped. Everything stays on this computer; run `connect` later to link it.");
  } else {
    console.log("\n2. Connecting this computer to your Quoli account\n");
    const link = await startLink(HOSTED);
    console.log(`   Approve this code in your browser:  ${link.pair}\n`);
    console.log(`   If the browser does not open, go to ${link.url}`);
    console.log("   Waiting for approval (10 minutes)…");
    openBrowser(link.url);
    let key: string;
    try {
      key = await waitForLink(HOSTED, link);
    } catch (error) {
      console.log(`\n   Not connected: ${error instanceof Error ? error.message : error}`);
      return 1;
    }
    saveLinkedKey(store, key);
    console.log("\n   ✓ Connected. Summaries of your new sessions now go to your account.");
  }

  const port = Number(process.env.QUOLI_PORT ?? 4400);
  const running = await fetch(`http://127.0.0.1:${port}/api/sync`, {
    signal: AbortSignal.timeout(1000),
  }).then(
    (r) => r.ok,
    () => false,
  );
  if (running) {
    console.log(`\n3. Quoli is already open at http://127.0.0.1:${port}. You are all set.`);
    return 0;
  }
  console.log(
    `\n3. Done. Recording is on, and it keeps working with this terminal closed: you do not
   need to keep Quoli open. Run ${START} again whenever you want to look.

   Opening Quoli now:`,
  );
  return "start";
}
