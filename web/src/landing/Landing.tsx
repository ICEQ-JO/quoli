import { useEffect, useState } from "react";
import { PixelScene, SESSION_STEPS } from "./PixelScene.tsx";
import { ProductScreenshot } from "./ProductScreenshot.tsx";
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
      <PixelScene kind="field" />
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
  dark,
  view,
  onView,
}: {
  dark: boolean;
  view: number;
  onView: (i: number) => void;
}) {
  const current = views[view];
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
        <PixelScene kind="field" />
        <div id="tour-panel" role="tabpanel" aria-labelledby={`tour-tab-${current.id}`}>
          <ProductScreenshot screen={current} dark={dark} />
        </div>
      </div>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <PixelScene kind="field" />
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

const questions = [
  {
    question: "Which coding agents does Quoli support?",
    answer:
      "Claude Code, Codex, OpenCode and Pi. Capture depends on the events each agent exposes; supported tools, usage reporting and subagent relationships differ between agents. Quoli does not capture hidden model reasoning.",
  },
  {
    question: "What can I review in a session?",
    answer:
      "Recorded prompts, supported tool calls and results, file edits, failures and usage. The session Summary brings together changes, commands, estimated costs and a derived review checklist. Code, Git and Infra add repository context around that work.",
  },
  {
    question: "Can I use Quoli while an agent is running?",
    answer:
      "The Dashboard and session views update as supported events arrive. Follow active tool calls and live sessions, then revisit the same record afterward. Optional browser alerts can flag configured conditions such as spend thresholds, quiet sessions and possible loops while Quoli is open.",
  },
  {
    question: "Does Quoli decide whether the code is correct?",
    answer:
      "No. It helps you find and inspect evidence. A recorded test run, review checklist or possible-loop flag does not establish feature correctness. You remain responsible for deciding what to review and merge.",
  },
  {
    question: "What does the team dashboard receive?",
    answer:
      "Allowed session-summary fields such as agent, model, GitHub repository, branch, activity counts and estimated spend. Prompts, source code, commands, tool output, file names and local folder paths are excluded. Sharing starts only when you choose to connect and enable sync.",
  },
  {
    question: "How accurate are cost estimates?",
    answer:
      "Quoli uses the token usage each supported agent reports and the current model price table. Estimates can differ from provider invoices because discounts, billing tiers and other pricing conditions are not fully modelled. Unpriced models are shown separately.",
  },
  {
    question: "Does Infra show live production deployments?",
    answer:
      "It shows services and pipelines declared in repository files, plus services you add by hand. Local Docker can provide live container metrics. Live connections to hosted providers and richer shared session review remain planned capabilities.",
  },
];

function FieldGuide() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="faq-section" aria-labelledby="faq-title">
      <div className="faq-intro">
        <h2 id="faq-title">
          A little context.
          <br />
          <em>Before you connect.</em>
        </h2>
        <p>The essentials on agents, evidence and what stays on your machine.</p>
        <div className="faq-art">
          <PixelScene kind="archive" />
        </div>
      </div>
      <div className="faq-list">
        {questions.map((item, i) => (
          <div className={`faq-item${open === i ? " is-open" : ""}`} key={item.question}>
            <h3>
              <button
                type="button"
                id={`faq-question-${i}`}
                aria-expanded={open === i}
                aria-controls={`faq-answer-${i}`}
                onClick={() => setOpen(open === i ? null : i)}
              >
                <svg className="faq-sigil" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 0h16v4h4v16h-4v4H4v-4H0V4h4zm0 4v16h16V4z" fill="currentColor" />
                  <path className="sigil-horizontal" d="M6 10h12v4H6z" fill="currentColor" />
                  <path className="sigil-vertical" d="M10 6h4v12h-4z" fill="currentColor" />
                </svg>
                <span>{item.question}</span>
              </button>
            </h3>
            <section
              className="faq-answer"
              id={`faq-answer-${i}`}
              aria-labelledby={`faq-question-${i}`}
              aria-hidden={open !== i}
              inert={open !== i}
            >
              <div>
                <p>{item.answer}</p>
              </div>
            </section>
          </div>
        ))}
      </div>
    </section>
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
                Quoli connects coding-agent sessions to the code, Git history and infrastructure
                around them. Follow the work, inspect changes, understand estimated spend and give
                your team visibility into how agents are being used.
              </p>
              <div className="hero-actions">
                <a className="hero-cta" href="#waitlist">
                  Join the waitlist <Arrow />
                </a>
                <a className="hero-link" href="#product">
                  Explore the app <Arrow />
                </a>
              </div>
              <small>
                Claude Code, Codex, OpenCode and Pi. Local detail. Opt-in team summaries.
              </small>
            </div>
            <div className="hero-art">
              <PixelScene kind="forest" />
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
          <section className="context-section" aria-labelledby="context-title">
            <h2 id="context-title">
              The diff shows the result.
              <br />
              <em>See the work behind it.</em>
            </h2>
            <p>
              Before a change reaches Git, an agent may have searched the repository, tried several
              approaches, spawned a subagent and rerun a failing command. Quoli keeps the recorded
              trail connected to your project, so review starts with context instead of guesswork.
            </p>
            <ol className="work-thread" aria-label="The connected record">
              <li>
                <strong>Prompt</strong>
                <span>What you asked</span>
              </li>
              <li>
                <strong>Agent</strong>
                <span>The recorded steps</span>
              </li>
              <li>
                <strong>Code</strong>
                <span>The files it touched</span>
              </li>
              <li>
                <strong>Git</strong>
                <span>The branch and commits</span>
              </li>
              <li>
                <strong>Infra</strong>
                <span>Declared services</span>
              </li>
            </ol>
          </section>
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
                  A session ends.
                  <br />
                  <em>Your review begins.</em>
                </h2>
                <p>
                  Return to the prompt, follow the tool calls, open the edits and inspect command
                  results. Replay the recorded session in order, including supported subagent
                  activity and failures. The trail stays available after the terminal moves on.
                </p>
                <p>
                  In this example, the agent edits a test after running the test command. Quoli
                  gives you that sequence to inspect. A successful command is evidence of a run, not
                  a guarantee that the final change is correct.
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
                  One session.
                  <br />
                  <em>Four connected lenses.</em>
                </h2>
                <p>
                  Follow agent activity, see changed files beside their imports, inspect the local
                  branch history, and explore services declared in the repository. Switch the lens
                  while keeping the session in view. The Summary brings the review context together.
                </p>
              </div>
              <div className="chapter-signal">
                <PixelScene kind="signal" />
              </div>
            </div>
            <ProductTour dark={dark} view={view} onView={setView} />
            <p className="tour-note">
              Every screen above is Quoli running its built-in synthetic demo: no real sessions, no
              real company. Unknown values stay unknown, and inferred ones are labelled.
            </p>
          </section>
          <section className="workflow-section" id="usage" aria-labelledby="usage-title">
            <div className="workflow-copy">
              <h2 id="usage-title">
                Know where
                <br />
                <em>the tokens went.</em>
              </h2>
              <p>
                An agent's cost is easier to understand when you can trace it back to the work.
                Quoli turns reported token usage into estimated spend by model, project and session,
                with a daily view that makes changes in usage visible.
              </p>
              <ul className="feature-lines">
                <li>
                  <strong>Find the expensive sessions.</strong> Open the work behind a high-cost run
                  instead of stopping at a total.
                </li>
                <li>
                  <strong>Understand the token mix.</strong> See input, output and cache usage,
                  including estimated prompt-cache savings.
                </li>
                <li>
                  <strong>Keep a budget in sight.</strong> Set daily and monthly display thresholds
                  and see how current usage compares.
                </li>
              </ul>
              <p className="evidence-note">
                Costs use reported usage and model prices. They are estimates, not invoices;
                unpriced models remain marked as unknown.
              </p>
            </div>
            <div className="board-frame">
              <PixelScene kind="field" />
              <ProductScreenshot
                dark={dark}
                webp={false}
                screen={{
                  id: "usage",
                  name: "Usage",
                  caption:
                    "The real Usage page running synthetic sessions: daily spend, model and project breakdowns, cache usage and the most expensive runs.",
                }}
              />
            </div>
          </section>
          <section
            className="workflow-section workflow-reverse"
            id="insights"
            aria-labelledby="insights-title"
          >
            <div className="workflow-copy">
              <h2 id="insights-title">
                Find the patterns.
                <br />
                <em>Inspect the detours.</em>
              </h2>
              <p>
                One failure can be expected. Repeated failures, edit churn and long stretches of
                searching can be worth a closer look. Quoli flags supported patterns in a session
                and gives you an Insights view across recorded work.
              </p>
              <ul className="feature-lines">
                <li>
                  <strong>Follow the evidence.</strong> Possible loops include the rule that fired
                  and links to the recorded steps.
                </li>
                <li>
                  <strong>See trends across sessions.</strong> Explore failure rates, tool mix,
                  session lengths and cost distributions.
                </li>
                <li>
                  <strong>Look at the right slice.</strong> Filter Insights by project, agent, model
                  and date range.
                </li>
              </ul>
              <p className="evidence-note">
                A possible loop is a signal to investigate, not a verdict about the agent. Patterns
                outside the supported rules can be missed.
              </p>
            </div>
            <div className="board-frame">
              <PixelScene kind="field" />
              <ProductScreenshot
                dark={dark}
                webp={false}
                screen={{
                  id: "insights",
                  name: "Insights",
                  caption:
                    "The real Insights page with synthetic data: session trends, failure rate, possible loops and the mix of tools used. This is a demonstration, not a performance benchmark.",
                }}
              />
            </div>
          </section>
          <section className="team-section" id="collaborate" aria-labelledby="collaborate-title">
            <div className="team-heading">
              <h2 id="collaborate-title">
                Individual context.
                <br />
                <em>A shared team view.</em>
              </h2>
              <div>
                <p>
                  See how your team uses coding agents, without collecting everyone’s source code.
                  Members choose to share session summaries. The detailed work stays on their
                  machines.
                </p>
                <a className="primary-link" href="/app/">
                  Open the team dashboard <Arrow />
                </a>
              </div>
            </div>
            <div
              className="team-schematic"
              role="img"
              aria-label="Illustration: developers keep detailed evidence locally and optionally share session summaries with the team dashboard."
            >
              <div className="team-machines" aria-hidden="true">
                {["Agent activity", "Code & commands", "Local session history"].map((label, i) => (
                  <div className="local-machine" key={label}>
                    <svg viewBox="0 0 64 54" fill="none" aria-hidden="true">
                      <path d="M4 2h56v38H4zM24 40h16v8H24zM14 48h36v4H14z" fill="#75acd0" />
                      <path d="M8 6h48v30H8z" fill="#172d43" />
                      <path
                        d={
                          i === 0
                            ? "M14 13h4v4h-4zm9 0h21v2H23zm-9 9h4v4h-4zm9 0h15v2H23z"
                            : i === 1
                              ? "M18 13h4v4h-4v6h4v4h-4l-6-7zm24 0h4l6 7-6 7h-4v-4h4v-6h-4zM30 11h3v19h-3z"
                              : "M14 13h30v3H14zm0 7h24v3H14zm0 7h18v3H14z"
                        }
                        fill="#c7e6f7"
                      />
                    </svg>
                    <span>{label}</span>
                  </div>
                ))}
                <strong>On each developer’s machine</strong>
              </div>
              <div className="summary-conduit" aria-hidden="true">
                <span>Opt-in summaries</span>
                <div>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="team-console" aria-hidden="true">
                <div className="team-console-title">
                  <Mark />
                  <strong>Your team, in view</strong>
                </div>
                <div className="team-console-row">
                  <span>Agent & model</span>
                  <span>Usage</span>
                </div>
                <div className="team-console-row">
                  <span>Repository & branch</span>
                  <span>Activity</span>
                </div>
                <div className="team-console-row">
                  <span>Failures & possible loops</span>
                  <span>Review</span>
                </div>
                <div className="team-console-row">
                  <span>Estimated spend</span>
                  <span>Cost</span>
                </div>
                <small>Illustrative summary · no source code uploaded</small>
              </div>
            </div>
            <div className="team-boundaries">
              <div>
                <h3>A useful view for engineering leads.</h3>
                <p>
                  Review activity by member, open recent summaries and understand recorded usage
                  across the team.
                </p>
              </div>
              <div>
                <h3>Sharing stays in your control.</h3>
                <p>
                  Prompts, code, commands, tool output and local paths are excluded. Members can
                  leave, revoke keys or delete shared data.
                </p>
              </div>
            </div>
          </section>
          <section className="trust-section" aria-labelledby="trust-title">
            <div>
              <h2 id="trust-title">
                Useful evidence.
                <br />
                <em>Clear boundaries.</em>
              </h2>
              <p>
                Understanding agent work should not require uploading your source code. Keep
                detailed sessions local, and choose whether a summary view is useful to your team.
              </p>
            </div>
            <dl className="trust-facts">
              <div>
                <dt>Local detail, optional sharing.</dt>
                <dd>
                  Detailed agent evidence stays on your machine. The hosted team dashboard receives
                  only the allowed summary fields when you enable sync.
                </dd>
              </div>
              <div>
                <dt>Recorded, derived or inferred.</dt>
                <dd>
                  Hook events are the record. Review context and maps are derived from that record
                  and the repository; inferred relationships are labelled.
                </dd>
              </div>
              <div>
                <dt>Unknown stays unknown.</dt>
                <dd>
                  A missing price is not a zero cost. A declared service is not proof of a live
                  deployment. Quoli shows the limits of what it can see.
                </dd>
              </div>
            </dl>
          </section>
          <section className="getting-started" aria-labelledby="start-title">
            <h2 id="start-title">
              Keep your workflow.
              <br />
              <em>Add the missing view.</em>
            </h2>
            <ol>
              <li>
                <h3>Connect your agent.</h3>
                <p>
                  Use Quoli's setup to connect supported agent hooks. Keep working in your own
                  terminal and editor.
                </p>
              </li>
              <li>
                <h3>Build as you normally do.</h3>
                <p>
                  Quoli observes supported events as the session runs. It does not approve, block or
                  direct your agent's actions.
                </p>
              </li>
              <li>
                <h3>Review with context.</h3>
                <p>
                  Open the session, inspect the changes and follow the work across the board. Enable
                  team summary sharing only if you want it.
                </p>
              </li>
            </ol>
          </section>
          <FieldGuide />
          <section className="waitlist-section" id="waitlist" aria-labelledby="waitlist-title">
            <div>
              <h2 id="waitlist-title">
                Move fast with agents.
                <br />
                <em>Keep the work in view.</em>
              </h2>
              <p>
                Join the list for product updates and the next Quoli releases.
                <br />
                Built for your next session—and your team's next review.
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
      <SiteFooter />
    </>
  );
}
