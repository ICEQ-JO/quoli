import { HOSTED_SUPABASE } from "../shared/hosted.ts";
import type { SessionDetail, SyncStatus } from "../shared/model.ts";
import type { Store } from "./db.ts";
import { githubRepo } from "./github.ts";
import { knownUsd, mainModel, sessionMs } from "./insights.ts";
import { lastActivityAt } from "./steps.ts";

/**
 * Team sync (#144, #151): opt-in upload of session *summaries* to the teams of a Quoli account.
 *
 * Only the fields in `SessionUpload` leave the machine: agent, model, GitHub repo, branch, times,
 * token counts, estimated cost and call/failure/loop counts. Never prompts, tool input or
 * output, file names, folder paths or titles. A repository without a GitHub remote is sent as
 * null, not as its folder name. Only sessions that started after sync was turned on are sent.
 *
 * The upload goes to the class's Supabase `submit_summaries` function with the project's public
 * (anon) key; the student's sync key is the only credential and is stored in the local database.
 */

export interface SessionUpload {
  sessionId: string;
  agent: string;
  model: string | null;
  repo: string | null;
  branch: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  usd: number | null;
  calls: number;
  failures: number;
  loops: number;
}

export interface SyncConfig {
  enabled: boolean;
  /** The hosted project's URL and public anon key; filled from the build defaults. */
  url: string;
  anonKey: string;
  /** The member's sync key from the account page. */
  key: string;
  /** Sessions that started before this are never sent. */
  since: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  sent: number;
}

/** The hosted class service; overridable for development with a local Supabase. */
export const HOSTED = {
  url: process.env.QUOLI_SYNC_URL ?? HOSTED_SUPABASE.url,
  anonKey: process.env.QUOLI_SYNC_ANON_KEY ?? HOSTED_SUPABASE.publishableKey,
};

const BLANK: SyncConfig = {
  enabled: false,
  url: "",
  anonKey: "",
  key: "",
  since: null,
  lastSyncAt: null,
  lastError: null,
  sent: 0,
};

export function loadSync(store: Store): SyncConfig {
  let saved: Partial<SyncConfig> = {};
  try {
    saved = JSON.parse(store.getSetting("sync") ?? "{}");
  } catch {}
  const c = { ...BLANK, ...saved };
  return { ...c, url: HOSTED.url, anonKey: HOSTED.anonKey };
}

/** Saves the student's part; the service URL and public key always come from this build. */
export function saveSync(store: Store, c: SyncConfig) {
  const { url: _url, anonKey: _anon, ...own } = c;
  store.putSetting("sync", JSON.stringify(own));
}

/** What the UI may see: never the sync key itself. */
export const syncStatus = (c: SyncConfig): SyncStatus => ({
  enabled: c.enabled,
  available: !!(c.url && c.anonKey),
  hasKey: !!c.key,
  since: c.since,
  lastSyncAt: c.lastSyncAt,
  lastError: c.lastError,
  sent: c.sent,
});

/** The allow-listed summary of one session. */
export function toUpload(d: SessionDetail): SessionUpload {
  const t = d.tokens;
  return {
    sessionId: d.id,
    agent: d.agent,
    model: mainModel(d),
    repo: githubRepo(d.root),
    branch: d.branch,
    startedAt: d.startedAt,
    endedAt: d.endedAt,
    // A live session sends its length so far: agents such as OpenCode never send an end event,
    // and a summary is re-sent only when the session has new activity.
    durationMs: sessionMs(d) ?? Math.max(0, Date.parse(d.lastAt) - Date.parse(d.startedAt)),
    inputTokens: t.input,
    outputTokens: t.output,
    cacheReadTokens: t.cacheRead,
    cacheWriteTokens: t.cacheWrite,
    usd: knownUsd(d),
    calls: d.toolCalls.length,
    failures: d.failures,
    loops: d.loops,
  };
}

/** Sessions to send: started after sync was turned on, with activity since the last good sync. */
export function pending(sessions: SessionDetail[], c: SyncConfig): SessionDetail[] {
  if (!c.since) return [];
  // A small overlap re-sends sessions that changed while the last upload was in flight.
  const after = c.lastSyncAt ? new Date(Date.parse(c.lastSyncAt) - 120_000).toISOString() : "";
  return sessions.filter((d) => d.startedAt >= (c.since as string) && lastActivityAt(d) >= after);
}

/**
 * Sends pending summaries in batches of 200. Returns the updated config; errors are recorded in
 * it, never thrown, and the next run retries.
 */
export async function syncOnce(
  c: SyncConfig,
  sessions: SessionDetail[],
  { fetchImpl = fetch, now = new Date() } = {},
): Promise<SyncConfig> {
  if (!c.enabled || !c.key || !c.url || !c.anonKey) return c;
  const rows = pending(sessions, c).map(toUpload);
  try {
    for (let i = 0; i < rows.length; i += 200) {
      const res = await fetchImpl(`${c.url.replace(/\/+$/, "")}/rest/v1/rpc/submit_summaries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: c.anonKey,
          Authorization: `Bearer ${c.anonKey}`,
        },
        body: JSON.stringify({ p_key: c.key, p_rows: rows.slice(i, i + 200) }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let message = `the class service answered ${res.status}`;
        try {
          const m = (JSON.parse(text) as { message?: unknown }).message;
          if (typeof m === "string") message = m;
        } catch {}
        throw new Error(message);
      }
    }
    return { ...c, lastSyncAt: now.toISOString(), lastError: null, sent: c.sent + rows.length };
  } catch (error) {
    return { ...c, lastError: error instanceof Error ? error.message : String(error) };
  }
}
