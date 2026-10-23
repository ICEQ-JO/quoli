"use client";

import { type CSSProperties, useRef, useState } from "react";
import { Icon } from "../ui-icon";
import "@fontsource-variable/inter";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./landing.css";

const repository = "https://github.com/ICEQ-JO/quoli";
const tabs = ["File changes", "Recorded checks", "Missing evidence"] as const;
type EvidenceTab = (typeof tabs)[number];

function delay(value: string): CSSProperties {
  return { "--d": value } as CSSProperties;
}

function Brand() {
  return (
    <a className="q-brand" href="/landing" aria-label="Quoli home">
      <Icon name="brand" size={22} />
      <span>quoli</span>
    </a>
  );
}

const fieldNodes = [
  { x: 1090, y: 210, label: "session", meta: "recorded" },
  { x: 860, y: 170, label: "prompt", meta: "recorded" },
  { x: 700, y: 300, label: "capability", meta: "recorded" },
  { x: 1000, y: 330, label: "turn", meta: "derived" },
  { x: 850, y: 430, label: "tool call", meta: "recorded" },
  { x: 1210, y: 440, label: "subagent", meta: "derived" },
  { x: 740, y: 545, label: "file", meta: "derived" },
  { x: 930, y: 620, label: "hunk", meta: "derived" },
  { x: 1140, y: 660, label: "check", meta: "recorded" },
  { x: 1330, y: 540, label: "cost", meta: "derived" },
  { x: 1320, y: 800, label: "gap", meta: "inferred" },
] as const;

function EvidenceField() {
  return (
    <div className="q-field" aria-hidden="true">
      <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" role="presentation">
        <defs>
          <pattern id="q-field-grid" width="64" height="64" patternUnits="userSpaceOnUse">
            <path d="M64 0H0V64" fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1600" height="1000" fill="url(#q-field-grid)" />
        <g className="q-field-edges" fill="none" stroke="rgba(255,255,255,0.24)" strokeWidth="1">
          <path d="M1090 210C1000 170 930 165 870 172" />
          <path d="M870 172C890 240 940 290 995 328" />
          <path d="M1000 330C950 360 900 395 858 425" />
          <path d="M1000 330C1080 360 1150 398 1202 436" />
          <path d="M858 430C810 470 770 505 744 540" />
          <path d="M744 545C810 575 870 595 922 615" />
          <path d="M930 620C1010 640 1080 650 1135 656" />
          <path d="M1090 210C1190 290 1270 420 1324 532" />
          <path d="M1210 440C1260 470 1300 500 1328 535" />
          <path d="M850 430C790 400 740 350 704 308" />
        </g>
        <g className="q-field-gaps" fill="none" stroke="rgba(224,196,141,0.34)" strokeWidth="1">
          <path d="M1140 665C1220 700 1270 750 1315 792" />
          <path d="M1330 545C1350 640 1340 720 1324 792" />
        </g>
        {fieldNodes.map((node) => (
          <g
            key={node.label}
            className={`q-node q-node--${node.meta}`}
            transform={`translate(${node.x} ${node.y})`}
          >
            <circle r="3.4" className="q-node-dot" />
            {node.meta === "inferred" && <circle r="11" className="q-node-ring" />}
            <text className="q-node-label" x="14" y="4">
              {node.label}
            </text>
            <text className="q-node-meta" x="14" y="20">
              {node.meta}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function EvidenceExample() {
  const [active, setActive] = useState<EvidenceTab>("File changes");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="q-example" id="example">
      <div className="q-example-bar">
        <span className="q-example-path">
          <Icon name="box" size={14} /> sample-repository <Icon name="arrow" size={11} /> Session
          review
        </span>
        <span className="q-demo-label">Synthetic example</span>
      </div>
      <div className="q-example-body">
        <aside className="q-example-context">
          <span className="q-example-caption">Developer request</span>
          <h3>
            Handle an empty <br />
            cache response
          </h3>
          <p>“Return an empty list when the cache has no entries. Add a regression test.”</p>
          <dl>
            <div>
              <dt>Harness</dt>
              <dd>Synthetic session</dd>
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
            Open the local sample <Icon name="arrow-right" size={14} />
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
                    <Icon name="file" size={15} /> src/cache.ts
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
                  <Icon name="branch" size={16} />
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
                    <Icon name="terminal" size={15} /> pnpm test cache
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
                  <Icon name="info" size={16} />
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
                    <Icon name="alert" size={15} /> Coverage is unknown
                  </span>
                  <span className="q-unknown-label">Not established</span>
                </div>
                <div className="q-missing">
                  <h4>Was the full suite run?</h4>
                  <p>
                    This example contains a targeted command. There is no retained result
                    establishing a full test-suite run.
                  </p>
                  <span>Missing evidence stays visible.</span>
                </div>
                <div className="q-evidence-note">
                  <Icon name="info" size={16} />
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
            <span className="q-example-footer-note">
              <Icon name="lock" size={12} /> Illustrative data · never executes commands
            </span>
            <span>Recorded · derived · inferred</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const faqs = [
  {
    question: "Does Quoli upload my code?",
    answer:
      "Not by default. Capture and upload are separate permissions. Prompt text, tool content and diffs each need their own opt-in, and denying upload leaves local capture unchanged.",
  },
  {
    question: "Does it capture my agent's hidden reasoning?",
    answer:
      "No. Quoli records what the harness exposes: prompts, turns, tool calls and results, declared plans, approvals and subagent activity. It does not reconstruct hidden chain-of-thought.",
  },
  {
    question: "Which harnesses are supported?",
    answer:
      "Claude Code is the first verified adapter. OpenCode, Codex and Pi are planned and are added only after their integrations are verified. A harness that is installed is not automatically supported or connected.",
  },
  {
    question: "Is a passing check a correctness score?",
    answer:
      "No. A process result is recorded evidence, not proof that the feature works. Quoli keeps the command, its exit code and what the harness reported, and marks what it cannot establish as unknown.",
  },
  {
    question: "Can I delete evidence?",
    answer:
      "Yes. Local and cloud retention are configured separately, deletion propagates to derived data, and encrypted backups expire within a stated window. User-exported copies remain outside immediate revocation.",
  },
  {
    question: "Is the hosted dashboard available now?",
    answer:
      "It is not yet available. The local recorder, the synthetic demo and this review surface are available; hosted accounts, device pairing and consented cloud sync are still planned.",
  },
];

export function LandingPage() {
  return (
    <div className="landing-root">
      <a className="q-skip" href="#landing-main">
        Skip to content
      </a>
      <div className="q-grain" aria-hidden="true" />
      <header className="q-header">
        <div className="q-header-inner">
          <Brand />
          <nav className="q-nav" aria-label="Product">
            <a className="q-pill" href="#how-it-works">
              How it works
            </a>
            <a className="q-pill" href="#evidence">
              Evidence
            </a>
            <a className="q-pill" href="#privacy">
              Privacy
            </a>
            <a className="q-pill" href="#faq">
              FAQ
            </a>
          </nav>
          <a className="q-button q-button-solid q-header-cta" href="/">
            Open workspace <Icon name="arrow-right" size={13} />
          </a>
        </div>
      </header>
      <main id="landing-main">
        <section className="q-hero" id="top" aria-labelledby="landing-title">
          <EvidenceField />
          <div className="q-hero-inner">
            <span className="q-badge q-appear q-appear--pop" style={delay("0.22s")}>
              <svg className="q-badge-star" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.6C12.55 2.6 12.88 3.15 13.08 4.7c.62 4.7 1.52 5.6 6.22 6.22 1.55.2 2.1.53 2.1 1.08s-.55.88-2.1 1.08c-4.7.62-5.6 1.52-6.22 6.22-.2 1.55-.53 2.1-1.08 2.1s-.88-.55-1.08-2.1c-.62-4.7-1.52-5.6-6.22-6.22C3.15 12.88 2.6 12.55 2.6 12s.55-.88 2.1-1.08c4.7-.62 5.6-1.52 6.22-6.22C11.12 3.15 11.45 2.6 12 2.6Z" />
              </svg>
              Evidence for AI-assisted development
            </span>
            <h1 id="landing-title" className="q-headline">
              <span className="q-headline-line">
                <span className="q-headline-text q-appear q-appear--mask" style={delay("0.42s")}>
                  Every agent change,
                </span>
              </span>
              <span className="q-headline-line">
                <span className="q-headline-text q-appear q-appear--mask" style={delay("0.62s")}>
                  <em>accounted for</em>.
                </span>
              </span>
            </h1>
            <p className="q-lede q-appear q-appear--soft" style={delay("0.82s")}>
              A cited record of what your coding agents did, what changed, what it cost and what
              remains unverified. Locally first; in the cloud only when you choose.
            </p>
            <div className="q-hero-actions">
              <a
                className="q-button q-button-solid q-button-hero q-appear q-appear--btn"
                href="#evidence"
                style={delay("0.96s")}
              >
                See the evidence <Icon name="arrow-down" size={14} />
              </a>
              <a
                className="q-button q-button-ghost q-button-hero q-appear q-appear--side"
                href="#how-it-works"
                style={delay("1.10s")}
              >
                How it works
              </a>
            </div>
            <p className="q-hero-note q-appear q-appear--soft" style={delay("1.22s")}>
              The hosted dashboard and OpenCode, Codex and Pi adapters are planned.
            </p>
          </div>
          <div className="q-stats">
            <span className="q-stat q-appear q-appear--stat" style={delay("1.12s")}>
              <Icon name="trace" size={18} />
              Local connector records the session
            </span>
            <span className="q-stat q-appear q-appear--stat" style={delay("1.28s")}>
              <Icon name="shield" size={18} />
              You choose what reaches the cloud
            </span>
            <span className="q-stat q-appear q-appear--stat" style={delay("1.44s")}>
              <Icon name="overview" size={18} />
              One workspace for the evidence
            </span>
          </div>
        </section>

        <section className="q-section" id="how-it-works" aria-labelledby="how-title">
          <div className="q-shell">
            <div className="q-section-head">
              <div>
                <span className="q-kicker">How it works</span>
                <h2 id="how-title">
                  Your agent works locally.
                  <br />
                  The evidence is <em>yours</em> to send.
                </h2>
              </div>
              <p>
                Quoli separates recording from sharing. Capture is local and bounded. Cloud upload
                is a separate, explicit choice per content category — never implied by installing
                the connector.
              </p>
            </div>
            <div className="q-steps">
              <article>
                <span className="q-step-number">01</span>
                <h3>Record</h3>
                <p>
                  The local connector reads the session your harness exposes: prompts, turns, tool
                  calls, approvals and subagents. What it cannot see stays a gap.
                </p>
              </article>
              <article>
                <span className="q-step-number">02</span>
                <h3>Derive</h3>
                <p>
                  Quoli links changes to the evidence that supports them: hunks, checks, costs and
                  capability use. Recorded, derived and inferred stay labelled.
                </p>
              </article>
              <article>
                <span className="q-step-number">03</span>
                <h3>Share</h3>
                <p>
                  Choose which categories reach the hosted workspace. Consent, retention and
                  deletion apply before persistence and again at the cloud boundary.
                </p>
              </article>
            </div>
            <div className="q-harnesses">
              <span>
                <strong>Claude Code</strong> — first verified adapter
              </span>
              <span>OpenCode, Codex and Pi — planned</span>
              <a href={`${repository}/blob/main/docs/adapters.md`}>
                Capability matrix <Icon name="arrow-right" size={13} />
              </a>
            </div>
          </div>
        </section>

        <section className="q-section" id="evidence" aria-labelledby="evidence-title">
          <div className="q-shell">
            <div className="q-section-head">
              <div>
                <span className="q-kicker">Evidence</span>
                <h2 id="evidence-title">
                  A review you can <em>trace</em>.
                </h2>
              </div>
              <p>
                One synthetic session, shown the way Quoli keeps it: what changed, what the harness
                reported, and what remains unknown. Every claim keeps its source.
              </p>
            </div>
            <EvidenceExample />
          </div>
        </section>

        <section className="q-section" id="privacy" aria-labelledby="privacy-title">
          <div className="q-shell q-privacy-grid">
            <div className="q-privacy-copy">
              <span className="q-kicker">Privacy</span>
              <h2 id="privacy-title">
                Local first.
                <br />
                <em>Consent</em> second.
              </h2>
              <p>
                The hosted dashboard is the target, not the default. Until you enable it, evidence
                stays on your machine. Capture, upload, retention and deletion are separate
                controls, each with a visible state.
              </p>
              <a
                href={`${repository}/blob/main/docs/vision.md#cloud-and-privacy-contract`}
                className="q-text-link"
              >
                Read the privacy contract <Icon name="arrow-right" size={14} />
              </a>
            </div>
            <div className="q-ledger">
              <div>
                <span>Capture</span>
                <p>
                  Metadata by default. Prompt text, tool content and diffs each need their own
                  opt-in.
                </p>
              </div>
              <div>
                <span>Upload</span>
                <p>
                  A separate choice per category. Denying upload leaves local capture unchanged.
                </p>
              </div>
              <div>
                <span>Retain</span>
                <p>
                  Local and cloud windows are configured separately. Cloud retention is bounded from
                  7 to 365 days per project.
                </p>
              </div>
              <div>
                <span>Inspect</span>
                <p>
                  Every view names its basis: recorded, derived or inferred. Unsupported values stay
                  null rather than guessed.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="q-section" id="faq" aria-labelledby="faq-title">
          <div className="q-shell q-faq-grid">
            <div>
              <span className="q-kicker">FAQ</span>
              <h2 id="faq-title">
                Questions worth <em>asking</em>.
              </h2>
              <p>
                The honest answers, including what Quoli does not do yet. For the full contracts,
                read the <a href={`${repository}/blob/main/docs/README.md`}>documentation</a>.
              </p>
            </div>
            <div className="q-faq">
              {faqs.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="q-footer">
        <div className="q-shell q-footer-grid">
          <div className="q-footer-brand">
            <Brand />
            <span>The evidence behind the change.</span>
          </div>
          <nav aria-label="Sections">
            <a href="#how-it-works">How it works</a>
            <a href="#evidence">Evidence</a>
            <a href="#privacy">Privacy</a>
            <a href="#faq">FAQ</a>
          </nav>
          <nav aria-label="Resources">
            <a href={repository}>GitHub</a>
            <a href={`${repository}/blob/main/docs/README.md`}>Documentation</a>
            <a href="/" className="q-footer-workspace">
              Open workspace <Icon name="arrow-right" size={13} />
            </a>
          </nav>
        </div>
        <div className="q-shell q-footer-note">
          <span>
            Hosted dashboard, device pairing and OpenCode, Codex and Pi adapters are planned.
          </span>
          <span>Illustrative synthetic data · no analytics or remote assets · © 2026 Quoli</span>
        </div>
      </footer>
    </div>
  );
}
