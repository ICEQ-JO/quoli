import { useEffect, useState } from "react";
import { api, useData } from "../api.ts";
import { ago } from "../format.ts";
import { ErrorState, Loading } from "./ui.tsx";

/** The Quoli account page: sign in, join a team and get a sync key. */
export const ACCOUNT_PAGE = "https://iceq.best/app/";

/** What a summary contains; the same allow-list as `toUpload` in server/sync.ts. */
const SENT = [
  "agent and main model",
  "GitHub repository (owner/repo) and branch",
  "start, end and duration",
  "tokens and estimated cost",
  "number of tool calls, failures and possible loops",
];
const NEVER = "prompts, code, commands, tool output, file names, folder paths or session titles";

/**
 * Settings → Team sync: connect to the Quoli account through the browser (or paste a sync key)
 * and turn sending on or off. Off by default; only sessions that start after it is turned on are
 * sent.
 */
export function SyncSettings() {
  const [status, refresh, error] = useData("sync", api.sync);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const linking = status?.linking ?? null;
  // While the browser approval is open, check every two seconds for the result.
  useEffect(() => {
    if (!linking || linking.error) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [linking, refresh]);
  if (!status) return error ? <ErrorState message={error} retry={refresh} /> : <Loading />;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
    refresh();
    setBusy(false);
  };
  const save = (patch: { key?: string; enabled?: boolean }) =>
    run(async () => {
      await api.saveSync(patch);
      if (patch.key !== undefined) setKey("");
    });
  const connect = () =>
    run(async () => {
      // Opened before the request so the browser does not treat it as an unasked pop-up.
      const tab = window.open("about:blank", "_blank");
      try {
        const next = await api.connectSync();
        if (tab && next.linking) tab.location.href = next.linking.url;
        else tab?.close();
      } catch (e) {
        tab?.close();
        throw e;
      }
    });

  return (
    <section className="card sync" aria-labelledby="sync-h">
      <h2 id="sync-h">Team sync</h2>
      <p className="faint">
        Share a summary of each session with your Quoli account and your teams, so a team owner sees
        how the team uses coding agents. Off until you turn it on, and only sessions you start after
        that are shared.
      </p>
      {!status.available ? (
        <p className="notice">This copy of Quoli is not set up for Quoli accounts yet.</p>
      ) : linking ? (
        <div className="sync-link" role="status">
          {linking.error ? (
            <p className="form-error">Not connected: {linking.error}</p>
          ) : (
            <>
              <p>
                Approve this code in your browser: <code className="sync-pair">{linking.pair}</code>
              </p>
              <p className="faint">
                The approval page did not open?{" "}
                <a href={linking.url} target="_blank" rel="noreferrer">
                  Open it here
                </a>
                . Waiting for up to 10 minutes.
              </p>
            </>
          )}
          <div className="field-row">
            {linking.error && (
              <button type="button" className="btn primary" disabled={busy} onClick={connect}>
                Try again
              </button>
            )}
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => run(api.cancelConnect)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {!status.hasKey && (
            <div className="sync-connect">
              <button type="button" className="btn primary" disabled={busy} onClick={connect}>
                Connect to your Quoli account
              </button>
              <p className="faint">
                Opens your browser: sign in with GitHub at{" "}
                <a href={ACCOUNT_PAGE} target="_blank" rel="noreferrer">
                  iceq.best/app
                </a>{" "}
                and approve the code shown here. Team sync then turns on by itself.
              </p>
            </div>
          )}
          {status.hasKey && (
            <>
              <label className="check sync-toggle">
                <input
                  type="checkbox"
                  checked={status.enabled}
                  disabled={busy}
                  onChange={(e) => save({ enabled: e.target.checked })}
                />
                Send session summaries to my account and teams
              </label>
              <p className="faint sync-state" role="status">
                {status.enabled
                  ? status.lastSyncAt
                    ? `On · last sent ${ago(status.lastSyncAt)} · ${status.sent} ${status.sent === 1 ? "summary" : "summaries"} so far`
                    : "On · sending within a minute"
                  : "Off"}
              </p>
              {status.enabled && status.lastError && (
                <p className="form-error" role="alert">
                  Last attempt failed: {status.lastError}. Quoli retries every minute.
                </p>
              )}
            </>
          )}
          <details className="sync-manual">
            <summary>
              {status.hasKey ? "Connected · change or remove" : "Use a sync key instead"}
            </summary>
            <form
              className="field-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (key.trim()) save({ key: key.trim() });
              }}
            >
              <label htmlFor="sync-key" className="sr-only">
                Sync key
              </label>
              <input
                id="sync-key"
                className="input mono"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  status.hasKey
                    ? "Paste a new sync key to replace this one"
                    : "qk_… from your Quoli account"
                }
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <button type="submit" className="btn" disabled={busy || !key.trim()}>
                Save key
              </button>
              {status.hasKey && (
                <>
                  <button type="button" className="btn" disabled={busy} onClick={connect}>
                    Connect again
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => save({ key: "" })}
                  >
                    Disconnect
                  </button>
                </>
              )}
            </form>
          </details>
        </>
      )}
      {failure && (
        <p className="form-error" role="alert">
          {failure}
        </p>
      )}
      <div className="sync-what">
        <h3>What is shared</h3>
        <ul>
          {SENT.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="faint">Never: {NEVER}. Those stay on this machine.</p>
      </div>
    </section>
  );
}
