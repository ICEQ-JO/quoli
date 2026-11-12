import { useState } from "react";
import { api, useData } from "../api.ts";
import { ago } from "../format.ts";
import { ErrorState, Loading } from "./ui.tsx";

/** Where students sign in, join a class and get their sync key. */
export const CLASS_PAGE = "https://iceq.best/class/";

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
 * Settings → Class sync: paste the sync key from the class page and turn sending on or off.
 * Off by default; only sessions that start after it is turned on are sent.
 */
export function SyncSettings() {
  const [status, refresh, error] = useData("sync", api.sync);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  if (!status) return error ? <ErrorState message={error} retry={refresh} /> : <Loading />;

  const save = async (patch: { key?: string; enabled?: boolean }) => {
    setBusy(true);
    setFailure(null);
    try {
      await api.saveSync(patch);
      if (patch.key !== undefined) setKey("");
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
    refresh();
    setBusy(false);
  };

  return (
    <section className="card sync" aria-labelledby="sync-h">
      <h2 id="sync-h">Class sync</h2>
      <p className="faint">
        Share a summary of each session with your class, so your instructor sees how the class is
        using coding agents. Off until you turn it on, and only sessions you start after that are
        shared.
      </p>
      {!status.available ? (
        <p className="notice">This copy of Quoli is not set up for a class service yet.</p>
      ) : (
        <>
          <ol className="sync-steps">
            <li>
              Open the{" "}
              <a href={CLASS_PAGE} target="_blank" rel="noreferrer">
                class page
              </a>
              , sign in with GitHub and join with your instructor's invite code.
            </li>
            <li>Create a sync key there and paste it here.</li>
          </ol>
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
                status.hasKey ? "Sync key saved · paste a new one to replace it" : "qk_…"
              }
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button type="submit" className="btn" disabled={busy || !key.trim()}>
              Save key
            </button>
            {status.hasKey && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => save({ key: "" })}
              >
                Remove key
              </button>
            )}
          </form>
          <label className="check sync-toggle">
            <input
              type="checkbox"
              checked={status.enabled}
              disabled={busy || !status.hasKey}
              onChange={(e) => save({ enabled: e.target.checked })}
            />
            Send session summaries to my class
          </label>
          <p className="faint sync-state" role="status">
            {status.enabled
              ? status.lastSyncAt
                ? `On · last sent ${ago(status.lastSyncAt)} · ${status.sent} ${status.sent === 1 ? "summary" : "summaries"} so far`
                : "On · sending within a minute"
              : status.hasKey
                ? "Off"
                : "Off · add your sync key first"}
          </p>
          {status.enabled && status.lastError && (
            <p className="form-error" role="alert">
              Last attempt failed: {status.lastError}. Quoli retries every minute.
            </p>
          )}
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
