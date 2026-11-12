import { useEffect, useState } from "react";
import { PixelScene, SESSION_STEPS } from "./PixelScene.tsx";
import { Arrow, Brand, Mark, Moon } from "./ui.tsx";
import { Waitlist } from "./Waitlist.tsx";

/** Optional product contact address, set at build time. */
const contact = (import.meta.env.VITE_PUBLIC_CONTACT_EMAIL as string | undefined)?.trim() || null;

const LENS_ICONS = {
  Agents: "M4 5h12v10H4zM8 2h4v3H8zM7 8h2v3H7zm4 0h2v3h-2z",
  Code: "M4 2h8l4 4v12H4zM7 8h6v2H7zm0 4h6v2H7z",
  Git: "M4 2h4v4H7v5h6V6h-1V2h4v4h-1v7H9v3h1v3H6v-3h1V6H4z",
  Infra: "M2 2h6v6H2zm10 0h6v6h-6zM7 12h6v6H7zM4 8v3h6v1h2V9H6V8z",
} as const;

const lenses = [
  ["Agents", "Follow the session. Spot failures, repeated work and unexpected detours."],
  ["Code", "Review changed files in context, with the exact edits one click away."],
  ["Git", "Connect the work to its branch, commits and uncommitted changes."],
  ["Infra", "See the services your repository declares and how they connect."],
] as const;

/**
 * Real screenshots of the app running its built-in synthetic demo (`pnpm demo --large`).
 * Each view's id names its image: /landing/product/<id>-<light|dark>.webp.
 */
const views = [
  {
    id: "summary",
    name: "Review",
    line: "What it was asked, what changed, what ran, what it cost.",
    caption:
      "One page per session: the prompts, recorded file edits with line counts, commands with their exit status, and an estimated cost by model.",
  },
  {
    id: "agents",
    name: "Agents",
    line: "Recorded steps, subagents and failures.",
    caption:
      "The session in order. Subagents nest under the call that started them, failures are marked, and the strip at the bottom replays it step by step.",
  },
  {
    id: "code",
    name: "Code",
    line: "Changed files, and the code around them.",
    caption:
      "Files the agent changed glow orange; files it only read are outlined blue. Import edges show what the change depends on and what depends on it.",
  },
  {
    id: "git",
    name: "Git",
    line: "The branch and commits it worked on.",
    caption:
      "Read from your local repository with git: branches, commits and the uncommitted changes the session left behind.",
  },
  {
    id: "infra",
    name: "Infra",
    line: "Where the changed code runs.",
    caption:
      "Services declared in compose files, workflows and platform configs, plus any you add by hand. Hosted providers are shown as not connected, because they aren't yet.",
  },
  {
    id: "dashboard",
    name: "Dashboard",
    line: "What's running, what needs review, what it cost.",
    caption:
      "Across every connected repository: live sessions, sessions worth reviewing, and estimated spend over the last two weeks.",
  },
] as const;

function Terminal({
  step,
  paused,
  onPause,
  onReplay,
}: {
  step: number;
  paused: boolean;
  onPause: () => void;
  onReplay: () => void;
}) {
  return (
    <div className="terminal-shell">
      <PixelScene kind="field" paused={paused} />
      <div className="terminal">
        <div className="terminal-header">
          <span className="window-controls" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <strong>Claude Code</strong>
          <span>~/checkout</span>
        </div>
        <div className="terminal-body">
          <p className="terminal-prompt">
            <span>›</span> Add order tracking to checkout.
          </p>
          <div className={`terminal-event ${step >= 1 ? "revealed" : "pending"}`}>
            <span className="event-dot read" />
            <p>
              <strong>Read</strong> src/checkout.ts
            </p>
            <code>Understand the current checkout flow.</code>
          </div>
          <div className={`terminal-event ${step >= 2 ? "revealed" : "pending"}`}>
            <span className="event-dot edit" />
            <p>
              <strong>Update</strong> src/checkout.ts
            </p>
            <code className="diff-remove">− return checkout(customer)</code>
            <code className="diff-add">+ const order = await latestOrder(customer)</code>
            <code className="diff-add">+ return checkout(customer, order)</code>
          </div>
          <div className={`terminal-event ${step >= 3 ? "revealed" : "pending"}`}>
            <span className="event-dot run" />
            <p>
              <strong>Run</strong> pnpm test
            </p>
            <code>exit 0 · command completed</code>
          </div>
          <div className={`terminal-event ${step >= 4 ? "revealed" : "pending"}`}>
            <span className="event-dot edit" />
            <p>
              <strong>Update</strong> tests/checkout.test.ts
            </p>
            <code className="diff-add">+ it('looks up the latest order', ...)</code>
          </div>
          <div className={`terminal-review ${step >= 5 ? "revealed" : "pending"}`}>
            <Mark small />
            <div>
              <strong>Quoli connects the story.</strong>
              <p>
                Two files edited. One test command recorded.
                <br />
                An edit happened after that run.
              </p>
              <span>Worth reviewing · derived from this example</span>
            </div>
          </div>
          <span className="terminal-cursor" aria-hidden="true" />
        </div>
        <div className="terminal-footer">
          <span>Synthetic walkthrough</span>
          <button type="button" onClick={onPause}>
            {paused ? "Play" : "Pause"}
          </button>
          <button type="button" onClick={onReplay}>
            Replay <span aria-hidden="true">↺</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductTour({
  paused,
  dark,
  view,
  onView,
}: {
  paused: boolean;
  dark: boolean;
  view: number;
  onView: (i: number) => void;
}) {
  const current = views[view];
  const base = `/landing/product/${current.id}-${dark ? "dark" : "light"}`;
  // A slow or dropped connection must never leave a broken-image icon: retry once, then say so.
  const [failed, setFailed] = useState<{ key: string; tries: number }>({ key: "", tries: 0 });
  const tries = failed.key === base ? failed.tries : 0;
  const retry = tries === 1 ? "?retry=1" : "";
  return (
    <div className="tour">
      <div className="tour-tabs" role="tablist" aria-label="Parts of the Quoli app">
        {views.map((v, i) => (
          <button
            type="button"
            role="tab"
            key={v.id}
            id={`tour-tab-${v.id}`}
            tabIndex={i === view ? 0 : -1}
            aria-selected={i === view}
            aria-controls="tour-panel"
            onClick={() => onView(i)}
            onKeyDown={(e) => {
              const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"];
              if (!keys.includes(e.key)) return;
              e.preventDefault();
              const last = views.length - 1;
              const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? last
                    : (view + (back ? last : 1)) % views.length;
              onView(next);
              document.getElementById(`tour-tab-${views[next].id}`)?.focus();
            }}
          >
            <strong>{v.name}</strong>
            <span>{v.line}</span>
          </button>
        ))}
      </div>
      <div className="board-frame">
        <PixelScene kind="field" paused={paused} />
        <figure
          className="tour-window"
          id="tour-panel"
          role="tabpanel"
          aria-labelledby={`tour-tab-${current.id}`}
        >
          {tries < 2 ? (
            <a href={`${base}.jpg`} target="_blank" rel="noreferrer" className="tour-image">
              <picture key={`${base}${retry}`}>
                <source srcSet={`${base}.webp${retry}`} type="image/webp" />
                <img
                  src={`${base}.jpg${retry}`}
                  width={1600}
                  height={1000}
                  alt={`The Quoli app, ${current.name} view, showing a synthetic demo session.`}
                  loading="lazy"
                  decoding="async"
                  onError={() => setFailed({ key: base, tries: tries + 1 })}
                />
              </picture>
              <span className="sr-only"> (opens the full-size screenshot)</span>
            </a>
          ) : (
            <div className="tour-missing" role="status">
              <p>The screenshot didn't load, probably a slow connection.</p>
              <button type="button" onClick={() => setFailed({ key: base, tries: 0 })}>
                Try again
              </button>
            </div>
          )}
          <figcaption>{current.caption}</figcaption>
        </figure>
      </div>
    </div>
  );
}

function SiteFooter({ paused }: { paused: boolean }) {
  return (
    <footer className="site-footer">
      <PixelScene kind="field" paused={paused} />
      <div className="footer-content">
        <div className="footer-description">
          <Brand />
          <p>
            The connected view of coding-agent work. Built for developers and engineering teams.
          </p>
          <a className="footer-status" href="/landing/?page=roadmap">
            <span />
            Explore the roadmap <Arrow diagonal />
          </a>
          <small>
            Claude Code · Codex · OpenCode · Pi.
            <br />
            Local evidence. A connected view.
          </small>
        </div>
        <div className="footer-column">
          <h3>Product</h3>
          <a href="/landing/#product">The app</a>
          <a href="/landing/?page=roadmap">Roadmap</a>
          <a href="/landing/#how-it-works">How it works</a>
          <a href="/app/">Team dashboard</a>
          <a href="/landing/#waitlist">Early access</a>
        </div>
        <div className="footer-column">
          <h3>Resources</h3>
          <a href="/landing/#product">Product tour</a>
          <a href="/landing/#collaborate">For developers &amp; teams</a>
          <a href="/landing/?page=privacy">Privacy</a>
        </div>
        <div className="footer-column">
          <h3>Quoli</h3>
          <a href="/landing/?page=mission">Our mission</a>
          <a href="/landing/#collaborate">For teams</a>
          {contact && <a href={`mailto:${contact}`}>Contact</a>}
          <a href="/landing/?page=roadmap">What's next</a>
          <a href="/landing/#waitlist">Join the waitlist</a>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Quoli</span>
          <span>Observe the work. Understand the change.</span>
        </div>
      </div>
    </footer>
  );
}

function InformationPage({ page }: { page: string }) {
  const mission = page === "mission";
  const privacy = page === "privacy";
  return (
    <main className="information-page" id="main">
      <a className="back-link" href="/landing/">
        <span aria-hidden="true">←</span> Back to Quoli
      </a>
      <h1>
        {mission ? (
          <>
            Understanding should
            <br />
            keep up with building.
          </>
        ) : privacy ? (
          <>
            Your work stays
            <br />
            on your machine.
          </>
        ) : (
          <>
            A clearer view.
            <br />
            Built one step at a time.
          </>
        )}
      </h1>
      {mission ? (
        <>
          <p className="information-lead">
            Coding agents changed how software gets made. Understanding their work shouldn't mean
            searching through a terminal, a diff, a Git client, and a cloud console.
          </p>
          <h2>The thread between things.</h2>
          <p>
            A tool call matters because it read a file, changed a function, or ran a command. A
            change matters because it belongs to a branch and connects to a system. Quoli is built
            around those relationships: one shared selection, four lenses, and a record you can
            inspect.
          </p>
          <h2>Evidence before confidence.</h2>
          <p>
            We distinguish what was recorded, what was derived, and what was inferred. Unknown
            values stay unknown. A successful command does not become a promise that a feature
            works.
          </p>
          <h2>Local first. Deliberately.</h2>
          <p>
            The local application keeps detailed agent evidence on your machine. Team sharing is
            opt-in and limited to session summaries. Quoli is built for developers and engineering
            teams. Today, optional team sync shares summaries; prompts, code, commands and tool
            output stay local.
          </p>
        </>
      ) : privacy ? (
        <>
          <p className="information-lead">
            The local application and this waitlist have different jobs. Here is what each stores.
          </p>
          <h2>Agent evidence</h2>
          <p>
            Quoli stores supported agent events, prompts, tool input/output and reported token usage
            locally. Common credential formats are redacted before persistence; redaction is
            best-effort. This website demonstration never reads captured sessions.
          </p>
          <h2>The waitlist</h2>
          <p>
            Submitting the form stores your email address and the time you joined, nothing else. On
            the public website it is kept in the site's database (Redis hosted by Upstash through
            Vercel); in a local preview it goes to a separate file on that computer. We use it only
            for Quoli launch updates. No analytics, no tracking cookies, no advertising and no
            mailing-list service.
          </p>
          <h2>Removing your address</h2>
          <p>
            Ask the Quoli team to remove it at any time and it is deleted from the list. No
            automatic emails are sent yet; when launch updates start, each one will include a way to
            stop them.
          </p>
        </>
      ) : (
        <>
          <p className="information-lead">
            The destination is one connected map of coding-agent work. Here's what exists and what
            comes next.
          </p>
          <div className="roadmap-entry">
            <span>Available locally</span>
            <h2>Four agents. Four lenses. One record.</h2>
            <p>
              Hook capture, session summaries, estimated costs, a derived review checklist,
              file-level code views, Git history, repository-declared infrastructure and replay.
            </p>
          </div>
          <div className="roadmap-entry">
            <span>Available</span>
            <h2>A shared view of agent usage.</h2>
            <p>
              Create or join a team and opt in to sharing session summaries. Team owners can see
              activity, failures, possible loops and estimated spend by member. Detailed evidence
              stays on each developer's machine.
            </p>
          </div>
          <div className="roadmap-entry">
            <span>In development</span>
            <h2>A product you can find your way around.</h2>
            <p>
              Readable lenses on real repositories, stronger navigation and session review, plus
              this new introduction to Quoli.
            </p>
          </div>
          <div className="roadmap-entry">
            <span>Planned</span>
            <h2>Deeper code. Live infrastructure.</h2>
            <p>
              Symbol-level code maps and live hosted-provider connections. These are roadmap items;
              Claude Code, Codex, OpenCode and Pi capture is available locally today.
            </p>
          </div>
          <div className="roadmap-entry">
            <span>Planned</span>
            <h2>Richer shared review.</h2>
            <p>
              Team summary sharing is available today. Shared detailed sessions and richer team
              review are planned; they will require an explicit choice about what leaves your
              machine.
            </p>
          </div>
        </>
      )}
      <a className="primary-link" href="/landing/#waitlist">
        Follow the next chapter <Arrow />
      </a>
    </main>
  );
}

export function Landing() {
  const [paused, setPaused] = useState(false);
  const [step, setStep] = useState(0);
  const [replay, setReplay] = useState(0);
  const [view, setView] = useState(0);
  // Lens links point at their tab in the product tour (#tour-tab-code); select it on arrival.
  useEffect(() => {
    const pick = () => {
      const i = views.findIndex((v) => location.hash === `#tour-tab-${v.id}`);
      if (i < 0) return;
      setView(i);
      document.getElementById(`tour-tab-${views[i].id}`)?.scrollIntoView({ block: "center" });
    };
    pick();
    window.addEventListener("hashchange", pick);
    return () => window.removeEventListener("hashchange", pick);
  }, []);
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("quoli.landing.theme") === "dark";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.dataset.paused = String(paused);
  }, [paused]);
  const page = new URLSearchParams(location.search).get("page");
  useEffect(() => {
    document.title =
      page === "mission"
        ? "Our mission — Quoli"
        : page === "roadmap"
          ? "Roadmap — Quoli"
          : page === "privacy"
            ? "Privacy — Quoli"
            : "Quoli — See what your coding agents did.";
  }, [page]);
  useEffect(() => {
    document.documentElement.dataset.mode = dark ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#101f30" : "#edf7fc");
    try {
      localStorage.setItem("quoli.landing.theme", dark ? "dark" : "light");
    } catch {
      /* Storage may be disabled. */
    }
  }, [dark]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="nav-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <a href="/landing/#product">Product</a>
            <a href="/landing/#collaborate">For teams</a>
            <a href="/landing/?page=roadmap">Roadmap</a>
            <a href="/landing/?page=mission">Mission</a>
          </nav>
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setDark(!dark)}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          >
            <Moon dark={dark} />
          </button>
          <a className="nav-cta" href="/landing/#waitlist">
            Join the waitlist
          </a>
        </div>
      </header>
      {page && ["mission", "roadmap", "privacy"].includes(page) ? (
        <InformationPage page={page} />
      ) : (
        <main id="main">
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <h1 id="hero-title">
                See what your
                <br />
                <span>coding agents did.</span>
              </h1>
              <p>
                Your agent moves fast. Stay close to the work. See what changed, what it cost, where
                it got stuck and what needs review—across sessions, code, Git and infrastructure.
              </p>
              <div className="hero-actions">
                <a className="hero-cta" href="#waitlist">
                  Join the waitlist <Arrow />
                </a>
                <a className="hero-link" href="#product">
                  Explore the app <Arrow />
                </a>
              </div>
              <small>Works locally with Claude Code, Codex, OpenCode and Pi.</small>
            </div>
            <div className="hero-art">
              <PixelScene kind="forest" paused={paused} />
              <div
                className="hero-trace"
                role="img"
                aria-label="One session connects agents, code, Git and infrastructure"
              >
                <Mark />
                <div className="hero-trace-points">
                  <span>Agents</span>
                  <span>Code</span>
                  <span>Git</span>
                  <span>Infra</span>
                </div>
              </div>
            </div>
          </section>
          <nav className="lens-index" aria-label="The four lenses">
            <ul>
              {lenses.map(([name, line]) => (
                <li key={name}>
                  <a href={`#tour-tab-${name.toLowerCase()}`}>
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d={LENS_ICONS[name]} fill="currentColor" fillRule="evenodd" />
                    </svg>
                    <strong>{name}</strong>
                    <span>{line}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <section className="recording-section" id="how-it-works" aria-labelledby="recorder-title">
            <div className="recorder-column">
              <div className="recorder-stage">
                <PixelScene
                  key={replay}
                  kind="recorder"
                  paused={paused}
                  onTime={(time) => {
                    const event = SESSION_STEPS.findLastIndex((item) => item.at <= time % 16);
                    setStep(Math.max(0, event));
                  }}
                />
                <div className="recorder-readout">
                  <span className="record-light" />
                  {paused ? "Paused" : "Illustrative session"}
                  <span>
                    {SESSION_STEPS[step].tool} · {String(step + 1).padStart(2, "0")} / 06
                  </span>
                </div>
              </div>
              <div className="recorder-copy">
                <h2 id="recorder-title">
                  A flight recorder.
                  <br />
                  <em>For your coding agent.</em>
                </h2>
                <p>
                  A finished prompt is the start of your review. Quoli keeps prompts, tool calls,
                  edits and command results connected, so you can follow the work without piecing
                  together terminal scrollback.
                </p>
                <p>
                  Replay the session. Inspect a failed call. Catch an edit made after the tests ran.
                  Find the evidence you need before you decide what to merge.
                </p>
              </div>
            </div>
            <Terminal
              step={step}
              paused={paused}
              onPause={() => setPaused(!paused)}
              onReplay={() => {
                setStep(0);
                setReplay(replay + 1);
                setPaused(false);
              }}
            />
          </section>
          <section className="blue-chapter" id="product" aria-labelledby="product-title">
            <div className="product-intro">
              <div className="product-intro-copy">
                <h2 id="product-title">
                  From agent activity
                  <br />
                  <em>to review context.</em>
                </h2>
                <p>
                  A tool log tells you what ran. Quoli connects that record to the code around it,
                  the Git history and the services declared in your repository. Move between views
                  without losing the session you are reviewing.
                </p>
              </div>
              <div className="chapter-signal">
                <PixelScene kind="signal" paused={paused} />
              </div>
            </div>
            <ProductTour paused={paused} dark={dark} view={view} onView={setView} />
            <p className="tour-note">
              Every screen above is Quoli running its built-in synthetic demo: no real sessions, no
              real company. Unknown values stay unknown, and inferred ones are labelled.
            </p>
          </section>
          <section className="collaborate" id="collaborate" aria-labelledby="collaborate-title">
            <div className="collaborate-intro">
              <h2 id="collaborate-title">
                For developers.
                <br />
                <em>For engineering teams.</em>
              </h2>
              <p>
                One developer, several agents, or an engineering team. Give agent-written work the
                context it deserves: a record you can inspect, costs you can track, and session
                summaries your team can choose to share.
              </p>
              <a className="button collaborate-cta" href="/app/">
                Open the team dashboard <Arrow />
              </a>
              {contact && (
                <small className="collaborate-address">
                  Talk to us about your workflow: <a href={`mailto:${contact}`}>{contact}</a>
                </small>
              )}
              <div className="workbench-art">
                <PixelScene kind="workbench" paused={paused} />
              </div>
            </div>
            <ul className="collaborate-list">
              <li>
                <h3>Review the work with context.</h3>
                <p>
                  Revisit prompts, tool calls and file changes together. See what commands ran,
                  where they failed, and what changed afterward—so you know where to focus your
                  review.
                </p>
              </li>
              <li>
                <h3>See where the effort goes.</h3>
                <p>
                  Track token usage and estimated spend across models, sessions and projects. Spot
                  repeated failures and possible loops, then inspect the steps behind them.
                </p>
              </li>
              <li>
                <h3>Bring your team's agent usage into view.</h3>
                <p>
                  Opt in to sharing session summaries with your team. Owners can see activity,
                  failures, possible loops and estimated spend by member. Prompts, source code,
                  commands and tool output stay on each developer's machine.
                </p>
              </li>
            </ul>
          </section>
          <section className="waitlist-section" id="waitlist" aria-labelledby="waitlist-title">
            <div>
              <h2 id="waitlist-title">
                Keep up with
                <br />
                <em>what your agents do.</em>
              </h2>
              <p>
                Get Quoli product updates for your development workflow.
                <br />
                Join the list for what comes next.
              </p>
            </div>
            <Waitlist location="hero" />
          </section>
          <a className="mission-link" href="/landing/?page=mission">
            Read our <span>mission statement</span>
            <Arrow diagonal />
          </a>
        </main>
      )}
      <SiteFooter paused={paused} />
      <button
        className="motion-control"
        type="button"
        onClick={() => setPaused(!paused)}
        aria-label={paused ? "Resume page animations" : "Pause page animations"}
      >
        {paused ? "Play motion" : "Pause motion"}
      </button>
    </>
  );
}
