import { useEffect, useRef, useState } from "react";
import { PixelScene, SESSION_STEPS } from "./PixelScene.tsx";
import { Arrow, Brand, Mark, Moon } from "./ui.tsx";
import { Waitlist } from "./Waitlist.tsx";

/**
 * Public repository link, set at build time with VITE_PUBLIC_REPO_URL. While the repository is
 * private it stays unset, so the site never sends visitors to a GitHub 404.
 */
const github = (import.meta.env.VITE_PUBLIC_REPO_URL as string | undefined)?.replace(/\/+$/, "");
const docs = github ? `${github}/blob/main/docs/` : null;
const names = ["Agents", "Code", "Git", "Infra"] as const;
const features = [
  [
    "Follow the agent.",
    "Prompts, tool calls, subagents, and failures. Read the session in order, then replay the moment you want to understand.",
  ],
  [
    "Put every edit in context.",
    "See the files the agent read and changed, the branch it worked on, and the infrastructure your repository declares.",
  ],
  [
    "Know what needs a look.",
    "Review command results, estimated spend, and a derived checklist. Evidence you can inspect. Gaps you can see.",
  ],
];
const lensRows = [
  [
    ["Read", "src/checkout.ts", "09:41:06"],
    ["Edit", "src/checkout.ts", "+18 −4"],
    ["Run", "pnpm test", "exit 0"],
    ["Edit", "tests/checkout.test.ts", "+12"],
  ],
  [
    ["src", "checkout.ts", "edited"],
    ["src", "orders.ts", "read"],
    ["tests", "checkout.test.ts", "edited"],
    ["config", "compose.yaml", "unchanged"],
  ],
  [
    ["branch", "feat/order-tracking", "HEAD"],
    ["commit", "Add order lookup", "recorded"],
    ["parent", "Extract checkout handler", "Git"],
    ["working tree", "checkout.test.ts", "modified"],
  ],
  [
    ["service", "web", "compose.yaml"],
    ["depends on", "api", "declared"],
    ["depends on", "postgres", "declared"],
    ["source", "src/checkout.ts", "edited"],
  ],
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

function ProductBoard({ paused }: { paused: boolean }) {
  const [lens, setLens] = useState(0);
  const [selectedRow, setSelectedRow] = useState(1);
  return (
    <div className="board-frame">
      <PixelScene kind="field" blue paused={paused} />
      <div className="product-board">
        <div className="board-sidebar">
          <span className="board-brand">
            <Mark small />
            Quoli
          </span>
          <span className="board-label">PROJECT</span>
          <strong>checkout</strong>
          <span className="board-label">SESSIONS</span>
          <div className="board-session active">
            <span className="session-dot" />
            Add order tracking<small>Claude Code · illustrative</small>
          </div>
          <div className="board-session">
            Extract checkout handler<small>Synthetic history</small>
          </div>
          <div className="sidebar-local">
            <span />
            Local workspace
          </div>
        </div>
        <div className="board-main">
          <div className="board-top">
            <span>
              checkout <span aria-hidden="true">/</span> session
            </span>
            <span className="demo-tag">SYNTHETIC DEMO</span>
          </div>
          <h3>Add order tracking</h3>
          <p className="board-subtitle">One session. Four connected viewpoints.</p>
          <div className="board-tabs" role="tablist" aria-label="Product demonstration lenses">
            {names.map((name, i) => (
              <button
                type="button"
                role="tab"
                key={name}
                id={`product-tab-${i}`}
                tabIndex={i === lens ? 0 : -1}
                aria-selected={i === lens}
                aria-controls="product-panel"
                onClick={() => {
                  setLens(i);
                  setSelectedRow(1);
                }}
                onKeyDown={(e) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? 3
                        : (lens + (e.key === "ArrowRight" ? 1 : 3)) % 4;
                  setLens(next);
                  setSelectedRow(1);
                  document.getElementById(`product-tab-${next}`)?.focus();
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <div
            className="board-panel"
            id="product-panel"
            role="tabpanel"
            aria-labelledby={`product-tab-${lens}`}
          >
            <div className="connection-line" aria-hidden="true">
              {names.map((name, i) => (
                <span key={name} className={i === lens ? "selected" : ""}>
                  <i />
                  {name}
                </span>
              ))}
            </div>
            <div className="board-rows">
              {lensRows[lens].map((row, i) => (
                <button
                  className={selectedRow === i ? "selected" : ""}
                  aria-pressed={selectedRow === i}
                  type="button"
                  key={row.join("-")}
                  onClick={() => setSelectedRow(i)}
                >
                  <span className={`row-kind kind-${row[0].toLowerCase()}`}>{row[0]}</span>
                  <code>{row[1]}</code>
                  <span>{row[2]}</span>
                </button>
              ))}
            </div>
            <div className="board-inspector">
              <span>SELECTED EVIDENCE</span>
              <strong>{lensRows[lens][selectedRow][1]}</strong>
              <p>
                {lens === 0
                  ? "A recorded step in this illustrative session. Select a different event to inspect its place in the story."
                  : lens === 1
                    ? "File-level context for the same session. Highlights represent the example's reads and edits."
                    : lens === 2
                      ? "Repository history connects work to its branch. Real commit links require recorded commit output."
                      : "Services come from repository configuration. This is not evidence of a live deployment."}
              </p>
            </div>
          </div>
          <div className="board-bottom">
            <span>Recorded / derived / inferred</span>
            <span>Local by default</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SiteFooter({ paused }: { paused: boolean }) {
  return (
    <footer className="site-footer">
      <PixelScene kind="field" blue paused={paused} />
      <div className="footer-content">
        <div className="footer-description">
          <Brand />
          <p>Quoli connects coding-agent activity to the code, history, and systems it touches.</p>
          <a className="footer-status" href="/landing/?page=roadmap">
            <span />
            {github ? "Building in the open" : "Follow the roadmap"} <Arrow diagonal />
          </a>
          <small>
            Claude Code locally today.
            <br />
            More agents and teams on the horizon.
          </small>
        </div>
        <div className="footer-column">
          <h3>Product</h3>
          <a href="/landing/#product">Four lenses</a>
          <a href="/landing/?page=roadmap">Roadmap</a>
          <a
            href={docs ? `${docs}architecture.md` : "/landing/#product"}
            {...(docs ? { target: "_blank", rel: "noreferrer" } : {})}
          >
            How it works
          </a>
          <a href="/landing/#waitlist">Early access</a>
        </div>
        <div className="footer-column">
          <h3>Resources</h3>
          {github && (
            <>
              <a href={`${docs}vision.md`} target="_blank" rel="noreferrer">
                Documentation
              </a>
              <a href={github} target="_blank" rel="noreferrer">
                GitHub <Arrow diagonal />
              </a>
              <a href={`${github}/issues`} target="_blank" rel="noreferrer">
                Development
              </a>
            </>
          )}
          <a href="/landing/?page=privacy">Privacy</a>
        </div>
        <div className="footer-column">
          <h3>Quoli</h3>
          <a href="/landing/?page=mission">Our mission</a>
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
            Today's application keeps evidence on your machine. Future shared work must make
            synchronization an explicit project choice. We want a clearer view for individual
            developers and, over time, their teams.
          </p>
        </>
      ) : privacy ? (
        <>
          <p className="information-lead">
            The local application and this waitlist have different jobs. Here is what each stores.
          </p>
          <h2>Agent evidence</h2>
          <p>
            Quoli stores supported Claude Code hook events, prompts, tool input/output and
            transcript usage locally. Common credential formats are redacted before persistence;
            redaction is best-effort. This website demonstration never reads captured sessions.
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
            <h2>Claude Code. Four lenses. One record.</h2>
            <p>
              Hook capture, session summaries, estimated costs, a derived review checklist,
              file-level code views, Git history, repository-declared infrastructure and replay.
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
            <h2>More agents. Deeper code.</h2>
            <p>
              Codex, OpenCode and Pi adapters, symbol-level maps and provider connections. These are
              roadmap items, not currently available integrations.
            </p>
          </div>
          <div className="roadmap-entry">
            <span>Planned</span>
            <h2>A shared view for teams.</h2>
            <p>
              Explicitly enabled hosted sync, shared sessions and team review. Local evidence stays
              local until you choose otherwise.
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
  const chapter = useRef<HTMLElement>(null);
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
    try {
      localStorage.setItem("quoli.landing.theme", dark ? "dark" : "light");
    } catch {
      /* Storage may be disabled. */
    }
  }, [dark]);
  useEffect(() => {
    const update = () => {
      const next =
        (chapter.current?.getBoundingClientRect().top ?? Infinity) < innerHeight * 0.85
          ? "blue"
          : "green";
      if (document.documentElement.dataset.chapter !== next)
        document.documentElement.dataset.chapter = next;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      delete document.documentElement.dataset.chapter;
    };
  }, []);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="nav-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <a href="/landing/?page=roadmap">Roadmap</a>
            {docs && (
              <a href={`${docs}vision.md`} target="_blank" rel="noreferrer">
                Docs
              </a>
            )}
            <a href="/landing/?page=mission">Mission</a>
            <a href="/landing/#product">Demo</a>
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
            <div className="hero-landscape">
              <PixelScene kind="forest" paused={paused} />
              <h1 id="hero-title">
                See what your
                <br />
                <span>coding agents did.</span>
              </h1>
            </div>
            <div className="hero-explanation">
              <PixelScene kind="field" paused={paused} />
              <div>
                <p>
                  Quoli connects your coding agents' activity to the code they changed, the branch
                  they worked on, and the systems it touches. One board. Four lenses. A story you
                  can actually follow.
                </p>
                <a className="hero-cta" href="#waitlist">
                  Join the waitlist <Arrow />
                </a>
                <small>A clearer view for developers and teams.</small>
              </div>
            </div>
          </section>
          <nav className="lens-strip" aria-label="The four connected lenses">
            <span>ONE CONNECTED VIEW</span>
            <div>
              {names.map((name, i) => (
                <a href="#product" key={name}>
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d={
                        [
                          "M4 5h12v10H4zM8 2h4v3H8zM7 8h2v3H7zm4 0h2v3h-2z",
                          "M4 2h8l4 4v12H4zM7 8h6v2H7zm0 4h6v2H7z",
                          "M4 2h4v4H7v5h6V6h-1V2h4v4h-1v7H9v3h1v3H6v-3h1V6H4z",
                          "M2 2h6v6H2zm10 0h6v6h-6zM7 12h6v6H7zM4 8v3h6v1h2V9H6V8z",
                        ][i]
                      }
                      fill="currentColor"
                      fillRule="evenodd"
                    />
                  </svg>
                  {name}
                </a>
              ))}
            </div>
          </nav>
          <section className="recording-section" aria-labelledby="recorder-title">
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
                <h2>
                  A flight recorder.
                  <br />
                  <em>For your coding agent.</em>
                </h2>
                <p>
                  Your agent reads, edits, runs, and moves on. Quoli keeps the recorded trail
                  together—so you can understand what changed, how it happened, and what deserves a
                  closer look.
                </p>
                <p>From the first prompt to the final edit, the details stay connected.</p>
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
          <section className="blue-chapter" ref={chapter} aria-labelledby="connected-title">
            <div className="chapter-animation">
              <PixelScene kind="signal" paused={paused} blue />
              <span>Quoli connects it.</span>
            </div>
            <h2 id="connected-title">
              The activity is only
              <br />
              <em>part of the story.</em>
            </h2>
            <p>
              Follow the same session across your code, Git history,
              <br className="desktop-break" /> and declared infrastructure. The context moves with
              you.
            </p>
          </section>
          <section className="product-section" id="product" aria-labelledby="product-title">
            <h2 id="product-title">
              Give your agent work
              <br />
              <em>the bigger picture.</em>
            </h2>
            <div className="product-layout">
              <ProductBoard paused={paused} />
              <div className="product-features">
                {features.map(([title, copy], i) => (
                  <article key={title}>
                    <div className={`mini-mechanism mechanism-${i}`} aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <i />
                    </div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </article>
                ))}
                <p className="product-caveat">
                  Illustrative interface, synthetic data. Claude Code is supported locally today.
                  More agents and shared team views are planned.
                </p>
              </div>
            </div>
          </section>
          <section className="waitlist-section" id="waitlist" aria-labelledby="waitlist-title">
            <div>
              <h2 id="waitlist-title">
                Be here for
                <br />
                <em>what comes next.</em>
              </h2>
              <p>
                Join the waitlist for Quoli's next chapter.
                <br />
                Launch updates, without the noise.
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
