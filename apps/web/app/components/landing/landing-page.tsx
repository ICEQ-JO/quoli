"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui-icon";
import "./landing.css";

const repository = "https://github.com/ICEQ-JO/quoli";
const setup = "pnpm install --frozen-lockfile\npnpm demo";
const tabs = ["File changes", "Recorded checks", "Missing evidence"] as const;
type EvidenceTab = (typeof tabs)[number];

function Brand() {
  return (
    <a className="q-brand" href="/landing" aria-label="Quoli home">
      <Icon name="brand" size={25} />
      <span>quoli</span>
    </a>
  );
}

function EvidenceExample() {
  const [active, setActive] = useState<EvidenceTab>("File changes");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="q-example" id="example">
      <div className="q-example-bar">
        <span>
          <Icon name="box" size={15} /> sample-repository <Icon name="arrow" size={12} /> Session
          review
        </span>
        <span className="q-demo-label">Synthetic example</span>
      </div>
      <div className="q-example-body">
        <aside className="q-example-context">
          <span className="q-example-caption">Developer request</span>
          <h2>
            Handle an empty <br />
            cache response
          </h2>
          <p>“Return an empty list when the cache has no entries. Add a regression test.”</p>
          <dl>
            <div>
              <dt>Source</dt>
              <dd>Claude Code · example</dd>
            </div>
            <div>
              <dt>Capture</dt>
              <dd>End recorded</dd>
            </div>
            <div>
              <dt>Repository</dt>
              <dd>Before + after available</dd>
            </div>
          </dl>
          <a href="/?project=demo-quoli&session=session-cache&view=session" className="q-text-link">
            Open the local sample <Icon name="arrow-right" size={15} />
          </a>
        </aside>
        <div className="q-example-evidence">
          <div className="q-evidence-tabs" role="tablist" aria-label="Explore example evidence">
            {tabs.map((tab, index) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`example-tab-${index}`}
                aria-controls="example-panel"
                aria-selected={active === tab}
                tabIndex={active === tab ? 0 : -1}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                onClick={() => setActive(tab)}
                onKeyDown={(event) => {
                  let next = index;
                  if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
                  else if (event.key === "ArrowLeft")
                    next = (index + tabs.length - 1) % tabs.length;
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = tabs.length - 1;
                  else return;
                  event.preventDefault();
                  setActive(tabs[next]);
                  tabRefs.current[next]?.focus();
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          <div
            id="example-panel"
            className="q-example-panel"
            role="tabpanel"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: WAI-ARIA tab panels with no focusable child must be reachable.
            tabIndex={0}
            aria-labelledby={`example-tab-${tabs.indexOf(active)}`}
          >
            {active === "File changes" && (
              <>
                <div className="q-panel-heading">
                  <span>
                    <Icon name="file" size={16} /> src/cache.ts
                  </span>
                  <span className="q-diff-count">
                    +1 <span>−1</span>
                  </span>
                </div>
                <section className="q-code" aria-label="Illustrative captured diff">
                  <div>
                    <span>12</span>
                    <code>export function readCache(cache) {"{"}</code>
                  </div>
                  <div className="q-code-remove">
                    <span>13</span>
                    <code>− return cache.entries;</code>
                  </div>
                  <div className="q-code-add">
                    <span>13</span>
                    <code>+ return cache.entries ?? [];</code>
                  </div>
                  <div>
                    <span>14</span>
                    <code>{"}"}</code>
                  </div>
                </section>
                <div className="q-evidence-note">
                  <Icon name="branch" size={17} />
                  <div>
                    <strong>A change you can inspect.</strong>
                    <p>
                      Compared from captured repository versions. The diff shows what changed; it
                      does not establish who made the edit.
                    </p>
                  </div>
                </div>
              </>
            )}
            {active === "Recorded checks" && (
              <>
                <div className="q-panel-heading">
                  <span>
                    <Icon name="terminal" size={16} /> pnpm test cache
                  </span>
                  <span className="q-record-label">Recorded result</span>
                </div>
                <dl className="q-check-facts">
                  <div>
                    <dt>Process exit code</dt>
                    <dd>0</dd>
                  </div>
                  <div>
                    <dt>Reported tests passed</dt>
                    <dd>3</dd>
                  </div>
                  <div>
                    <dt>Reported tests failed</dt>
                    <dd>0</dd>
                  </div>
                </dl>
                <div className="q-evidence-note">
                  <Icon name="info" size={17} />
                  <div>
                    <strong>A result, with its limits.</strong>
                    <p>
                      This command reported a passing result. It does not prove the whole
                      application works or that every changed file was tested.
                    </p>
                  </div>
                </div>
              </>
            )}
            {active === "Missing evidence" && (
              <>
                <div className="q-panel-heading">
                  <span>
                    <Icon name="alert" size={16} /> Coverage is unknown
                  </span>
                  <span className="q-unknown-label">Not established</span>
                </div>
                <div className="q-missing">
                  <h3>Was the full suite run?</h3>
                  <p>
                    This example contains a targeted command. There is no retained result
                    establishing a full test-suite run.
                  </p>
                  <span>Missing evidence stays visible.</span>
                </div>
                <div className="q-evidence-note">
                  <Icon name="info" size={17} />
                  <div>
                    <strong>Know what still needs your attention.</strong>
                    <p>
                      A missing record is not proof that something never happened. Review the source
                      and decide what to check next.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="q-example-footer">
            <Icon name="lock" size={13} /> Illustrative data · never executes commands
            <span>Evidence, with context.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("traceframe-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  async function copySetup() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(setup);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    timer.current = setTimeout(() => setCopyState("idle"), 4000);
  }
  return (
    <div className="landing-root" data-theme={theme}>
      <a className="q-skip" href="#landing-main">
        Skip to content
      </a>
      <header className="q-header">
        <div className="q-header-inner">
          <Brand />
          <nav aria-label="Product">
            <a href="#example">Explore</a>
            <a href="#capture">How it works</a>
            <a href="#start">Get started</a>
          </nav>
          <div className="q-header-actions">
            <button
              type="button"
              className="q-theme"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              onClick={() => {
                const next = theme === "dark" ? "light" : "dark";
                setTheme(next);
                try {
                  localStorage.setItem("traceframe-theme", next);
                } catch {}
              }}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
            </button>
            <a href="/" className="q-button q-button-small">
              Open workspace <Icon name="arrow-right" size={14} />
            </a>
          </div>
        </div>
      </header>
      <main id="landing-main">
        <section className="q-hero q-container" aria-labelledby="landing-title">
          <div className="q-hero-copy">
            <h1 id="landing-title">
              Your agent moved fast.
              <br />
              <span>See what changed.</span>
            </h1>
            <div className="q-hero-detail">
              <p>
                Follow the changes. Inspect the checks. Find the gaps.
                <br className="q-desktop-break" /> Quoli brings your local coding evidence into one
                review workspace.
              </p>
              <div className="q-hero-actions">
                <a className="q-button" href="#start">
                  Get started locally <Icon name="arrow-right" size={16} />
                </a>
                <a className="q-text-link" href="#example">
                  Explore an example <Icon name="arrow-down" size={16} />
                </a>
              </div>
              <span className="q-hero-footnote">
                Local storage. No account. Your review, on your machine.
              </span>
            </div>
          </div>
          <EvidenceExample />
          <div className="q-compatibility">
            <span>Repository history works with any agent or editor.</span>
            <span>
              Detailed activity integration: <strong>Claude Code</strong>
            </span>
          </div>
        </section>
        <section className="q-capture-section" id="capture">
          <div className="q-container">
            <div className="q-section-intro">
              <h2>
                A clear trail.
                <br />A more informed review.
              </h2>
              <p>
                A completion message is a starting point. Quoli helps you examine the available
                evidence behind it, without turning unknowns into assurances.
              </p>
            </div>
            <div className="q-capabilities">
              <article>
                <Icon name="branch" size={24} />
                <h3>Follow the changes</h3>
                <p>
                  Connect a local Git repository to retain observed history. Compare captured file
                  versions, from the baseline to later checkpoints.
                </p>
                <a href={`${repository}/blob/main/docs/automatic-history.md`}>
                  Repository history <Icon name="arrow-right" size={14} />
                </a>
              </article>
              <article>
                <Icon name="terminal" size={24} />
                <h3>Read the receipts</h3>
                <p>
                  With an enabled Claude Code integration, inspect available requests, tool activity
                  and reported check results alongside their sources.
                </p>
                <a href={`${repository}/blob/main/docs/verification-evidence.md`}>
                  Verification evidence <Icon name="arrow-right" size={14} />
                </a>
              </article>
              <article>
                <Icon name="alert" size={24} />
                <h3>Keep the unknowns</h3>
                <p>
                  See capture gaps, unavailable file content and unsupported values. A successful
                  command stays a recorded fact, never a correctness score.
                </p>
                <a href={`${repository}/blob/main/docs/lifecycle-controls.md`}>
                  Capture controls <Icon name="arrow-right" size={14} />
                </a>
              </article>
            </div>
          </div>
        </section>
        <section className="q-privacy q-container" aria-labelledby="privacy-title">
          <div className="q-privacy-symbol">
            <Icon name="lock" size={36} />
            <span>127.0.0.1</span>
          </div>
          <div>
            <h2 id="privacy-title">
              Your code has a home.
              <br />
              It stays there.
            </h2>
            <p>
              Session evidence is stored locally. You choose whether to capture code and untracked
              files. Redaction and capture controls apply before persistence.
            </p>
            <p className="q-muted">
              Repository observation does not require agent hooks. Detailed Claude Code activity is
              a separate, explicit connection. Capture is bounded; changes between observations may
              be missed.
            </p>
            <a href={`${repository}/blob/main/docs/local-setup.md`} className="q-text-link">
              Read the local setup guide <Icon name="arrow-right" size={16} />
            </a>
          </div>
        </section>
        <section className="q-start-section" id="start">
          <div className="q-container q-start-grid">
            <div>
              <h2>
                Start with a sample.
                <br />
                Then make it yours.
              </h2>
              <p>
                Explore synthetic sessions before connecting your own repository. No paid agent API
                is needed for the demo.
              </p>
              <a href={repository} className="q-text-link">
                Get the source on GitHub <Icon name="arrow-right" size={16} />
              </a>
              <p className="q-runtime">
                Source preview · Node 24.16+ within Node 24
                <br />
                pnpm 11.12 · Git
              </p>
            </div>
            <div className="q-setup">
              <ol>
                <li>
                  <strong>Get the source</strong>
                  <p>Clone the repository and open its directory.</p>
                  <code>
                    git clone https://github.com/ICEQ-JO/quoli.git
                    <br />
                    cd quoli
                  </code>
                </li>
                <li>
                  <div className="q-setup-heading">
                    <strong>Run the local demo</strong>
                    <button type="button" onClick={copySetup} aria-label="Copy demo commands">
                      <Icon name="copy" size={14} />
                      {copyState === "copied" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre>{setup}</pre>
                  <p role="status" className={copyState === "failed" ? "q-copy-error" : ""}>
                    {copyState === "failed"
                      ? "Couldn’t copy. Select the commands above to copy them manually."
                      : "Open http://127.0.0.1:3140 in your browser."}
                  </p>
                </li>
                <li>
                  <strong>Connect your repository when ready</strong>
                  <p>In another terminal, from the Quoli checkout:</p>
                  <code>pnpm connect /path/to/repo --capture-code</code>
                  <p>
                    This opts into code capture. Omit <code>--capture-code</code> for metadata only.
                    Untracked files require separate consent.
                  </p>
                </li>
              </ol>
              <div className="q-setup-note">
                Prefer a background app?{" "}
                <a href={`${repository}/blob/main/docs/cli.md`}>
                  Build the local Linux release <Icon name="arrow-right" size={13} />
                </a>
                <span>Package distribution is not yet published.</span>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="q-footer q-container">
        <div>
          <Brand />
          <span>The evidence behind the change.</span>
        </div>
        <nav aria-label="Resources">
          <a href={repository}>GitHub</a>
          <a href={`${repository}/blob/main/docs/README.md`}>Documentation</a>
          <a href="/">
            Open workspace <Icon name="arrow-right" size={14} />
          </a>
        </nav>
        <p>Built for a closer look.</p>
      </footer>
    </div>
  );
}
