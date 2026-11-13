import { useState } from "react";
import { api, useData } from "../api.ts";
import { Link, paths } from "../router.ts";
import { PageHead } from "./ui.tsx";

const START = "npx https://iceq.best/quoli.tgz";

/**
 * The dashboard before the first session: the steps from an install to a recorded session. It
 * gives way to the dashboard by itself when the first event arrives (DashboardPage listens live).
 */
export function Onboarding() {
  const [setup, refreshSetup] = useData("setup", api.setupStatus);
  const [sync] = useData("sync", api.sync);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recording = Boolean(setup?.some((s) => s.installed));
  const linked = Boolean(sync?.enabled && sync.hasKey);

  const steps: { title: string; done: boolean; body: React.ReactNode }[] = [
    {
      title: recording ? "Recording is on" : "Turn on recording",
      done: recording,
      body: (
        <>
          <p>
            Quoli records Claude Code, Codex, OpenCode and Pi through their own hooks, so it keeps
            recording with this window closed.
          </p>
          <p>
            <button
              type="button"
              className="btn primary"
              disabled={busy || !setup}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await api.setup(undefined);
                  refreshSetup();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
                setBusy(false);
              }}
            >
              {busy ? "Setting up…" : "Set up recording"}
            </button>
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </>
      ),
    },
    {
      title: "Work with your coding agent",
      done: false,
      body: (
        <p>
          Start a new session in a project Quoli records. It shows up here as it happens: what you
          asked, what it changed, what it ran and what it cost.
        </p>
      ),
    },
    {
      title: linked ? "Connected to your Quoli account" : "Connect your Quoli account (optional)",
      done: linked,
      body: (
        <p>
          See your sessions at iceq.best and share them with a team. Only summaries are sent, never
          prompts or code. <Link to={paths.settings("sync")}>Connect in Settings</Link>
        </p>
      ),
    },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <div className="page">
      <PageHead title="Getting started">
        Quoli shows what your coding agents did: every prompt, file, command and cost, on one map.
      </PageHead>
      <section className="panel onboard" aria-label="Steps">
        <ol className="steps">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className={s.done ? "done" : i === current ? "current" : undefined}
              aria-current={i === current ? "step" : undefined}
            >
              <span className="step-mark" aria-hidden="true">
                {s.done ? (
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                    <path
                      d="M3.5 8.5l3 3 6-7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <div className="step-body">
                <h2>
                  {s.title}
                  {s.done && <span className="sr-only"> (done)</span>}
                </h2>
                {!s.done && s.body}
              </div>
            </li>
          ))}
        </ol>
      </section>
      <p className="faint onboard-demo">
        Want to look around first? Run <code>{START} demo</code> for a sample project.
      </p>
    </div>
  );
}
