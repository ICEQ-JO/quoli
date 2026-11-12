import { useEffect, useState } from "react";
import type { Project } from "../../../shared/model.ts";
import { api, useData, useLiveEvents } from "../api.ts";
import { AlertSettings } from "../components/AlertSettings.tsx";
import { PricesSection } from "../components/Prices.tsx";
import { SyncSettings } from "../components/SyncSettings.tsx";
import { DeleteDataDialog, ErrorState, Loading, PageHead } from "../components/ui.tsx";
import { plural } from "../format.ts";
import { Link, paths, type SettingsSection } from "../router.ts";
import { setThemePref, type ThemePref, useThemePref } from "../theme.ts";

const SECTIONS: { id: SettingsSection; label: string; hint: string }[] = [
  { id: "general", label: "General", hint: "This install and spend budgets" },
  { id: "alerts", label: "Alerts", hint: "Local alerts for running sessions" },
  { id: "prices", label: "Prices", hint: "The list prices behind cost estimates" },
  { id: "sync", label: "Class sync", hint: "Share session summaries with a class" },
  { id: "data", label: "Data & privacy", hint: "Retention, redaction and deleting data" },
  { id: "appearance", label: "Appearance", hint: "Theme" },
];

const PRESETS = [7, 30, 90];
const EXAMPLE =
  "export ANTHROPIC_API_KEY=sk-ant-api03-EXAMPLEEXAMPLEEXAMPLE0000\ncurl -H 'Authorization: Bearer abc123def456ghi789' https://example.test";

type Retention = "forever" | "7" | "30" | "90" | "custom";

const toChoice = (days: number | null): Retention =>
  days === null ? "forever" : PRESETS.includes(days) ? (String(days) as Retention) : "custom";

export function SettingsPage({ section }: { section: SettingsSection }) {
  const themePref = useThemePref();
  const [data, refresh, error] = useData("settings", api.settings);
  const [projects, refreshProjects, projectsError] = useData("projects", api.projects);
  useLiveEvents(refreshProjects);

  const [retention, setRetention] = useState<Retention>("forever");
  const [custom, setCustom] = useState("14");
  const [redact, setRedact] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null);

  const loaded = data?.settings;
  useEffect(() => {
    if (!loaded) return;
    setRetention(toChoice(loaded.retentionDays));
    if (loaded.retentionDays !== null) setCustom(String(loaded.retentionDays));
    setRedact(loaded.redact);
  }, [loaded]);

  const days =
    retention === "forever" ? null : retention === "custom" ? Number(custom) : Number(retention);
  const invalid = days !== null && (!Number.isInteger(days) || days < 1);
  const dirty = !!loaded && (days !== loaded.retentionDays || redact !== loaded.redact);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.saveSettings({ retentionDays: days, redact });
      setSaved(true);
      refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  };

  return (
    <div className="page settings-page">
      <PageHead title="Settings">
        Everything stays on this machine unless you turn on sync.
      </PageHead>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((x) => (
            <Link
              key={x.id}
              to={paths.settings(x.id)}
              className={section === x.id ? "active" : ""}
              aria-current={section === x.id ? "page" : undefined}
              title={x.hint}
            >
              {x.label}
            </Link>
          ))}
        </nav>
        <div className="settings-body">
          {!data && (error ? <ErrorState message={error} retry={refresh} /> : <Loading />)}
          {data && section === "general" && (
            <>
              <section className="card" aria-labelledby="set-where">
                <h2 id="set-where">This install</h2>
                <dl className="kv wide">
                  <div>
                    <dt>Data location</dt>
                    <dd className="mono" title={data.info.dataDir}>
                      {data.info.dataDir}
                    </dd>
                  </div>
                  <div>
                    <dt>Port</dt>
                    <dd className="mono">{data.info.port} (loopback only)</dd>
                  </div>
                  <div>
                    <dt>Version</dt>
                    <dd className="mono">{data.info.version}</dd>
                  </div>
                </dl>
              </section>
              <BudgetForm settings={data.settings} saved={refresh} />
            </>
          )}
          {data && section === "appearance" && (
            <section className="card" aria-labelledby="set-look">
              <h2 id="set-look">Appearance</h2>
              <div className="field">
                <label htmlFor="set-theme">Theme</label>
                <div className="field-row">
                  <select
                    id="set-theme"
                    className="input"
                    value={themePref}
                    onChange={(e) => setThemePref(e.target.value as ThemePref)}
                  >
                    <option value="system">System</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>
                <p className="faint">
                  Saved in this browser only. System follows your operating system setting.
                </p>
              </div>
            </section>
          )}
          {data && section === "alerts" && (
            <AlertSettings dailyBudget={data.settings.budgetDailyUsd} />
          )}
          {section === "prices" && <PricesSection />}
          {section === "sync" && <SyncSettings />}
          {data && section === "data" && (
            <>
              <form
                className="card"
                aria-labelledby="set-data"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!invalid) save();
                }}
              >
                <h2 id="set-data">Retention and redaction</h2>
                <div className="field">
                  <label htmlFor="set-ret">Keep sessions for</label>
                  <div className="field-row">
                    <select
                      id="set-ret"
                      className="input"
                      value={retention}
                      onChange={(e) => {
                        setRetention(e.target.value as Retention);
                        setSaved(false);
                      }}
                    >
                      <option value="forever">Keep forever</option>
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="custom">Custom…</option>
                    </select>
                    {retention === "custom" && (
                      <>
                        <label htmlFor="set-days" className="sr-only">
                          Days
                        </label>
                        <input
                          id="set-days"
                          className="input narrow"
                          type="number"
                          min={1}
                          step={1}
                          value={custom}
                          aria-invalid={invalid}
                          onChange={(e) => {
                            setCustom(e.target.value);
                            setSaved(false);
                          }}
                        />
                        <span className="faint">days</span>
                      </>
                    )}
                  </div>
                  <p className="faint">
                    {days === null
                      ? "Nothing is deleted automatically."
                      : `Sessions whose last event is older than ${days} ${days === 1 ? "day" : "days"} are deleted permanently, including their events and token usage. This runs when you save, at startup and hourly.`}
                  </p>
                  {invalid && (
                    <p className="form-error" role="alert">
                      Enter a whole number of days, 1 or more.
                    </p>
                  )}
                </div>

                <div className="field">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={redact}
                      onChange={(e) => {
                        setRedact(e.target.checked);
                        setSaved(false);
                      }}
                    />
                    Redact credentials before storing events
                  </label>
                  <p className="faint">
                    Common credential shapes (Anthropic/OpenAI-style API keys, GitHub tokens, AWS
                    access keys, Slack tokens and private keys) are replaced before anything is
                    written to disk. It is best effort, not a guarantee.
                  </p>
                </div>

                <div className="form-foot">
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={saving || invalid || !dirty}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  {saved && (
                    <span className="ok" role="status">
                      Saved. Retention was applied.
                    </span>
                  )}
                  {saveError && (
                    <span className="form-error" role="alert">
                      {saveError}
                    </span>
                  )}
                </div>
              </form>

              <RedactPreview />

              <section className="card" aria-labelledby="set-del">
                <h2 id="set-del">Delete project data</h2>
                <p className="faint">
                  Removes a project's recorded events and unregisters it. Your repository is not
                  touched.
                </p>
                {deleted && (
                  <p className="notice" role="status">
                    {deleted}
                  </p>
                )}
                {!projects &&
                  (projectsError ? (
                    <ErrorState message={projectsError} retry={refreshProjects} />
                  ) : (
                    <Loading />
                  ))}
                {projects?.length === 0 && <p className="faint">No projects.</p>}
                <ul className="plain-list">
                  {projects?.map((p) => (
                    <li key={p.id}>
                      <span className="strong" title={p.root}>
                        {p.name}
                      </span>
                      <span className="faint">
                        {p.sessions} {p.sessions === 1 ? "session" : "sessions"}
                      </span>
                      <button type="button" className="btn danger" onClick={() => setDeleting(p)}>
                        Delete data
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>
      {deleting && (
        <DeleteDataDialog
          project={deleting}
          close={() => setDeleting(null)}
          done={(r) => {
            setDeleted(
              `Deleted ${plural(r.events, "event")} from ${plural(r.sessions, "session")} of ${deleting.name}.`,
            );
            setDeleting(null);
            refreshProjects();
          }}
        />
      )}
    </div>
  );
}

function RedactPreview() {
  const [text, setText] = useState("");
  const [out, setOut] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!text) {
      setOut(null);
      setError(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      api
        .redactPreview(text)
        .then((r) => {
          if (!live) return;
          setOut(r.text);
          setError(null);
        })
        .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text]);
  return (
    <section className="card" aria-labelledby="set-red">
      <h2 id="set-red">Redaction preview</h2>
      <label htmlFor="red-in">Paste text to see what gets redacted</label>
      <textarea
        id="red-in"
        className="input mono"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a command, log line or prompt…"
        spellCheck={false}
      />
      <p>
        <button type="button" className="btn" onClick={() => setText(EXAMPLE)}>
          Try an example
        </button>
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {out !== null && (
        <>
          <p className="label">Stored as</p>
          <pre className="preview" aria-live="polite">
            {out}
          </pre>
          {out === text && <p className="faint">Nothing in this text matched a redaction rule.</p>}
        </>
      )}
      <p className="faint">This text is sent only to your local Quoli server and is not saved.</p>
    </section>
  );
}

/** Local spend budgets: they only change what Quoli shows (Dashboard, Usage). */
function BudgetForm({
  settings,
  saved,
}: {
  settings: { budgetDailyUsd: number | null; budgetMonthlyUsd: number | null };
  saved: () => void;
}) {
  const [daily, setDaily] = useState(settings.budgetDailyUsd?.toString() ?? "");
  const [monthly, setMonthly] = useState(settings.budgetMonthlyUsd?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const parse = (v: string) => (v.trim() === "" ? null : Number(v));
  const bad = (v: string) => {
    const n = parse(v);
    return n !== null && !(Number.isFinite(n) && n > 0 && n <= 1_000_000);
  };
  const invalid = bad(daily) || bad(monthly);
  const dirty =
    parse(daily) !== settings.budgetDailyUsd || parse(monthly) !== settings.budgetMonthlyUsd;
  return (
    <form
      className="card"
      aria-labelledby="set-budget"
      onSubmit={async (e) => {
        e.preventDefault();
        if (invalid) return;
        setBusy(true);
        setStatus(null);
        try {
          await api.saveSettings({
            budgetDailyUsd: parse(daily),
            budgetMonthlyUsd: parse(monthly),
          });
          setStatus({ ok: true, text: "Saved." });
          saved();
        } catch (err) {
          setStatus({ ok: false, text: err instanceof Error ? err.message : String(err) });
        }
        setBusy(false);
      }}
    >
      <h2 id="set-budget">Budgets</h2>
      <p className="faint">
        Compared with estimated spend at list prices. Quoli only shows how close you are; it never
        stops an agent and sends nothing anywhere.
      </p>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="set-bd">Daily budget (USD)</label>
          <input
            id="set-bd"
            className="input narrow"
            inputMode="decimal"
            placeholder="None"
            value={daily}
            aria-invalid={bad(daily)}
            onChange={(e) => setDaily(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="set-bm">Monthly budget (USD)</label>
          <input
            id="set-bm"
            className="input narrow"
            inputMode="decimal"
            placeholder="None"
            value={monthly}
            aria-invalid={bad(monthly)}
            onChange={(e) => setMonthly(e.target.value)}
          />
        </div>
      </div>
      {invalid && (
        <p className="form-error" role="alert">
          Enter an amount above 0, or leave it empty for no budget.
        </p>
      )}
      <div className="form-foot">
        <button type="submit" className="btn primary" disabled={busy || invalid || !dirty}>
          {busy ? "Saving…" : "Save budgets"}
        </button>
        {status && (
          <span className={status.ok ? "ok" : "form-error"} role={status.ok ? "status" : "alert"}>
            {status.text}
          </span>
        )}
      </div>
    </form>
  );
}
