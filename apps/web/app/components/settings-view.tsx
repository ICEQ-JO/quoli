"use client";
import type { ProjectSettings, PurgeResult } from "@traceframe/schema/lifecycle";
import { number } from "@traceframe/ui";
import { useEffect, useState } from "react";
import { Icon } from "./ui-icon";

type Props = {
  project: string;
  projectName: string;
  refresh: number;
  onSessions: () => void;
};

async function read(project: string, signal?: AbortSignal): Promise<ProjectSettings> {
  const response = await fetch(`/api/settings?project=${encodeURIComponent(project)}`, {
    cache: "no-store",
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Settings unavailable.");
  return data;
}

async function write(project: string, body: unknown): Promise<ProjectSettings | PurgeResult> {
  const response = await fetch(`/api/settings?project=${encodeURIComponent(project)}`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Settings could not be updated.");
  return data;
}

const retentionOptions = [
  { value: "", label: "Keep everything" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

export function SettingsView({ project, projectName, refresh, onSessions }: Props) {
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saved, setSaved] = useState(false);
  const [pendingRetention, setPendingRetention] = useState<number | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [purged, setPurged] = useState<PurgeResult | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh reloads the retained settings.
  useEffect(() => {
    const abort = new AbortController();
    setSettings(null);
    setError("");
    read(project, abort.signal)
      .then((data) => {
        if (!abort.signal.aborted) setSettings(data);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [project, refresh, retry]);

  async function apply(body: unknown) {
    if (busy || purged) return false;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const data = await write(project, body);
      if ("removed" in data) setPurged(data);
      else setSettings(data);
      setSaved(true);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (purged)
    return (
      <section className="settings-deleted" role="status">
        <Icon name="lock" size={30} />
        <h1>Project evidence deleted</h1>
        <p>
          {purged.removed.events} observations, {purged.removed.snapshots} repository captures and{" "}
          {purged.removed.artifacts} artifacts were removed. Capture and storage for this project
          are stopped. Source files, agent transcripts and backups outside Quoli were not touched.
        </p>
        <button className="button" type="button" onClick={onSessions}>
          Back to sessions <Icon name="arrow-right" size={15} />
        </button>
      </section>
    );

  if (error && !settings)
    return (
      <div className="error-notice" role="alert">
        <Icon name="alert" />
        <div>
          <strong>Settings unavailable</strong>
          <p>{error}</p>
        </div>
        <button className="button" type="button" onClick={() => setRetry((n) => n + 1)}>
          Retry settings
        </button>
        <button className="text-button" type="button" onClick={onSessions}>
          Back to sessions
        </button>
      </div>
    );
  if (!settings)
    return (
      <div className="view-loading" role="status">
        Loading project settings…
      </div>
    );

  return (
    <div className="settings-view">
      <header className="settings-header">
        <div>
          <h1>Project settings</h1>
          <p>
            {projectName} · {settings.synthetic ? "Synthetic example" : "Local repository"} ·
            evidence stays on this machine.
          </p>
        </div>
        <button className="text-button" type="button" onClick={onSessions}>
          Back to sessions
          <Icon name="arrow-right" size={14} />
        </button>
      </header>
      <div className="settings-save-state" role="status">
        {busy
          ? "Saving changes…"
          : saved
            ? "Changes saved on this machine."
            : "Changes save automatically, except retention and deletion."}
      </div>
      {error && (
        <div className="error-notice" role="alert">
          <Icon name="alert" size={18} />
          <div>
            <strong>Change could not be saved</strong>
            <p>{error} Your last confirmed settings are shown. Try the change again.</p>
          </div>
        </div>
      )}
      <div className="settings-layout">
        <nav className="settings-sections" aria-label="Settings sections">
          <a href="#capture-policy">Capture policy</a>
          <a href="#capture-state">Capture state</a>
          <a href="#retention">Retention</a>
          <a href="#storage">Storage</a>
          <a href="#delete-evidence">Delete evidence</a>
        </nav>
        <div className="settings-content">
          <section className="settings-section" id="capture-policy" aria-label="Capture policy">
            <div className="settings-section-heading">
              <h2>Capture policy</h2>
              <span>applies to new observations</span>
            </div>
            <p className="document-muted">
              A policy change is applied before new content is written. History already retained
              stays until you delete it below.
            </p>
            <div className="settings-toggles">
              {(
                [
                  ["prompt", "Prompts", "Developer requests and session openings."],
                  ["tool", "Tool output", "Command output and tool results."],
                  [
                    "code",
                    "Code",
                    "File content and captured paths. Enabling this also enables tool output.",
                  ],
                ] as const
              ).map(([key, label, hint]) => (
                <label key={key} className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.policy[key]}
                    disabled={busy}
                    onChange={(event) =>
                      apply({
                        policy: {
                          [key]: event.target.checked,
                          ...(key === "code" && event.target.checked ? { tool: true } : {}),
                        },
                      })
                    }
                  />
                  <span>
                    <strong>{label}</strong>
                    <span>{hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="document-muted">
              Tool output may contain code; both tool and code consent are required for that
              content. {settings.policy.excludedPaths.length} excluded path rules remain configured.
            </p>
          </section>
          <section className="settings-section" id="capture-state" aria-label="Capture state">
            <div className="settings-section-heading">
              <h2>Capture state</h2>
              <span>{settings.paused ? "paused" : "running"}</span>
            </div>
            <p className="document-muted">
              {settings.paused
                ? "New observations are rejected while capture is paused. Retained evidence stays readable."
                : "New observations are accepted and sanitized under the current policy."}
            </p>
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={() => apply({ paused: !settings.paused })}
            >
              <Icon name={settings.paused ? "refresh" : "alert"} size={15} />
              {settings.paused ? "Resume capture" : "Pause capture"}
            </button>
          </section>
          <section className="settings-section" id="retention" aria-label="Retention">
            <div className="settings-section-heading">
              <h2>Retention</h2>
              <span>
                {settings.retentionDays === null
                  ? "keep everything"
                  : `${settings.retentionDays} days`}
              </span>
            </div>
            <p className="document-muted">
              Expired observations and repository captures are removed when the window changes or
              new observations arrive. Derived views are recomputed from what remains, so no removed
              evidence keeps a claim alive.
            </p>
            <label className="settings-field">
              <span>Keep evidence for</span>
              <select
                value={
                  (pendingRetention === undefined ? settings.retentionDays : pendingRetention) ===
                  null
                    ? ""
                    : String(
                        pendingRetention === undefined ? settings.retentionDays : pendingRetention,
                      )
                }
                disabled={busy}
                onChange={(event) =>
                  setPendingRetention(event.target.value === "" ? null : Number(event.target.value))
                }
              >
                {retentionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {pendingRetention !== undefined && pendingRetention !== settings.retentionDays && (
              <div className="retention-confirmation">
                <p>
                  {pendingRetention === null
                    ? "Keep all evidence from now on. Previously deleted evidence cannot be recovered."
                    : `Apply a ${pendingRetention}-day retention window? Expired evidence is deleted immediately and cannot be recovered.`}
                </p>
                <div className="settings-actions">
                  <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (await apply({ retentionDays: pendingRetention }))
                        setPendingRetention(undefined);
                    }}
                  >
                    Apply retention
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    onClick={() => setPendingRetention(undefined)}
                  >
                    Cancel retention change
                  </button>
                </div>
              </div>
            )}
          </section>
          <section className="settings-section" id="storage" aria-label="Storage">
            <div className="settings-section-heading">
              <h2>Storage</h2>
              <span>{number(settings.usage.bytes)} bytes</span>
            </div>
            <p>
              Local project limit: 10,000 retained events and 50 MiB of evidence bodies. Rejected
              batches are not included in these totals; pending retries remain in the bridge spool.
            </p>
            <dl className="settings-usage">
              <div>
                <dt>Observations</dt>
                <dd>{number(settings.usage.events)}</dd>
              </div>
              <div>
                <dt>Repository captures</dt>
                <dd>{number(settings.usage.snapshots)}</dd>
              </div>
              <div>
                <dt>Artifacts</dt>
                <dd>{number(settings.usage.artifacts)}</dd>
              </div>
            </dl>
          </section>
          <section
            className="settings-section danger"
            id="delete-evidence"
            aria-label="Delete project evidence"
          >
            <div className="settings-section-heading">
              <h2>Delete project evidence</h2>
            </div>
            {!confirming ? (
              <>
                <p className="document-muted">
                  Deletion is the only exception to the append-only history. It cannot be undone.
                </p>
                <button className="button danger" type="button" onClick={() => setConfirming(true)}>
                  <Icon name="alert" size={15} />
                  Delete retained evidence
                </button>
              </>
            ) : (
              <>
                <p className="document-muted">
                  This removes the retained observations, repository captures, artifacts and project
                  registration for {projectName}, and stops capture and storage for it. It does not
                  touch your source files, the agent's own transcripts, or any backup outside Quoli.
                </p>
                <div className="settings-actions">
                  <button
                    className="button danger"
                    type="button"
                    disabled={busy}
                    onClick={() => apply({ action: "purge" })}
                  >
                    <Icon name="alert" size={15} />
                    {busy ? "Deleting…" : "Delete this project's evidence"}
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirming(false)}
                  >
                    Keep the evidence
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
