import { type FormEvent, useEffect, useId, useState } from "react";
import { Courier, PixelIcon, World } from "./World.tsx";

const repo = "https://github.com/ICEQ-JO/quoli";
const lenses = [
  {
    name: "Agents",
    title: "See the work unfold.",
    description:
      "The prompt, the tool calls, the detours. Follow the main agent and its subagents through a readable record of the session.",
    stamp: "ACTIVITY",
    items: [
      ["09:41:02", "You", "Add order tracking to checkout."],
      ["09:41:06", "Read", "src/checkout.ts"],
      ["09:41:12", "Edit", "src/checkout.ts  +18 −4"],
      ["09:41:19", "Run", "pnpm test  ·  exit 0"],
      ["09:41:26", "Edit", "tests/checkout.test.ts  +12"],
    ],
    detail:
      "A successful command is evidence of that run. It isn't a guarantee that the feature works.",
    link: "One session. Every recorded step.",
  },
  {
    name: "Code",
    title: "Find the change in the code.",
    description:
      "See which files the session read and edited, where they live, and the edits behind them. Start with the shape of the repo; zoom into the details.",
    stamp: "FILE CHANGES",
    items: [
      ["src/", "folder", "checkout/"],
      ["", "edited", "checkout.ts  +18 −4"],
      ["", "read", "orders.ts"],
      ["tests/", "edited", "checkout.test.ts  +12"],
    ],
    detail:
      "File highlights come from recorded tool calls. Shell-driven edits can fall outside that capture.",
    link: "The map gives you context. The diff gives you detail.",
  },
  {
    name: "Git",
    title: "Put the work on a branch.",
    description:
      "Connect agent work to repository history. Inspect branches, commits, and working-tree changes without piecing the story together across windows.",
    stamp: "REPOSITORY HISTORY",
    items: [
      ["branch", "on", "feat/order-tracking"],
      ["HEAD", "commit", "Add order lookup"],
      ["", "parent", "Extract checkout handler"],
      ["working tree", "modified", "checkout.test.ts"],
    ],
    detail:
      "Session-to-commit links use recorded commit output. Quoli doesn't guess from timestamps.",
    link: "From a session to the history it left behind.",
  },
  {
    name: "Infra",
    title: "See what the code connects to.",
    description:
      "Read the infrastructure your repository declares. Explore services and dependencies alongside the files an agent changed.",
    stamp: "DECLARED SERVICES",
    items: [
      ["compose.yaml", "service", "web"],
      ["", "depends on", "api"],
      ["", "depends on", "postgres"],
      ["source", "edited", "src/checkout.ts"],
    ],
    detail:
      "This is a repository-derived view, not proof of a live deployment. Hosted provider connections are planned.",
    link: "Understand the declared system around a change.",
  },
] as const;

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="20" height="20" fill="none">
      <path
        d={diagonal ? "M5 15 15 5M5 5h10v10" : "M3 10h13M10 4l6 6-6 6"}
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function Brand() {
  return (
    <a className="brand" href="#top" aria-label="Quoli home">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path fill="currentColor" d="M8 2h16v4h4v20h-8v4h-4v-4H4V6h4z" />
        <path fill="var(--paper)" d="M10 8h12v12H10z" />
        <path fill="var(--copper)" d="M18 18h8v8h-8z" />
      </svg>
      quoli<span className="brand-period">.</span>
    </a>
  );
}

function Waitlist({ location }: { location: "hero" | "footer" }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "saving") return;
    setState("saving");
    setMessage("");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(12_000),
      });
      const result = (await response.json()) as { error?: string; saved?: boolean };
      if (!response.ok || result.saved !== true)
        throw new Error(result.error || "We couldn't save your email. Please try again.");
      setState("saved");
      setMessage("You're on the list. Your email is saved for launch updates.");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error && error.name !== "TimeoutError"
          ? error.message
          : "That took too long. Please try again.",
      );
    }
  }
  return (
    <div className={`signup signup-${location}`}>
      {state === "saved" ? (
        <div className="signup-success" role="status">
          <span className="success-icon">
            <PixelIcon kind={0} />
          </span>
          <div>
            <strong>A little closer to the big picture.</strong>
            <p>{message}</p>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor={id}>
            Email address
          </label>
          <div className="signup-controls">
            <input
              id={id}
              type="email"
              name="email"
              placeholder="Your email address"
              required
              maxLength={254}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={`${id}-note${state === "error" ? ` ${id}-error` : ""}`}
              aria-invalid={state === "error" || undefined}
              disabled={state === "saving"}
            />
            <button className="button" type="submit" disabled={state === "saving"}>
              {state === "saving" ? "Saving…" : "Join the waitlist"}
              <Arrow />
            </button>
          </div>
          {state === "error" && (
            <p className="form-error" id={`${id}-error`} role="alert">
              {message}
            </p>
          )}
          <p className="signup-note" id={`${id}-note`}>
            Launch updates only. Your email is stored by Quoli.
            <br className="mobile-break" /> No tracking.{" "}
            <a href="#privacy">
              How we handle it <span aria-hidden="true">↗</span>
            </a>
          </p>
        </form>
      )}
    </div>
  );
}

function LensExplorer() {
  const [selected, setSelected] = useState(0);
  const lens = lenses[selected];
  return (
    <section className="explore section" id="lenses" aria-labelledby="lenses-title">
      <div className="section-intro">
        <h2 id="lenses-title">
          One world.
          <br />
          <span>Four ways to see it.</span>
        </h2>
        <p>
          The activity, the code, the history, the system.
          <br className="desktop-break" /> Finally, in the same picture.
        </p>
      </div>
      <div className="lens-tabs" role="tablist" aria-label="Explore Quoli's four lenses">
        {lenses.map((item, index) => (
          <button
            key={item.name}
            id={`lens-${index}`}
            type="button"
            role="tab"
            aria-selected={selected === index}
            aria-controls="lens-panel"
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 3
                    : (selected + (event.key === "ArrowRight" ? 1 : 3)) % 4;
              setSelected(next);
              document.getElementById(`lens-${next}`)?.focus();
            }}
          >
            <PixelIcon kind={index} />
            <span>{item.name}</span>
          </button>
        ))}
      </div>
      <div
        className="lens-panel"
        id="lens-panel"
        role="tabpanel"
        aria-labelledby={`lens-${selected}`}
      >
        <div className={`world-view world-view-${selected}`}>
          <div className="world-caption">
            <span className="status-dot" />
            Illustrative session<span>order-tracking</span>
          </div>
          <World selected={selected} onSelect={setSelected} />
          <div className="world-legend">
            <span>
              <i className="legend-read" />
              Read
            </span>
            <span>
              <i className="legend-edit" />
              Edited
            </span>
            <span>
              Choose a station <Arrow />
            </span>
          </div>
        </div>
        <div className="lens-detail">
          <h3>{lens.title}</h3>
          <p>{lens.description}</p>
          <div className="evidence">
            <div className="evidence-heading">
              <span>{lens.stamp}</span>
              <span className="synthetic">SYNTHETIC</span>
            </div>
            {lens.items.map((item) => (
              <div className="evidence-row" key={item.join("-")}>
                <span>{item[0]}</span>
                <span className={`event-type event-${item[1].toLowerCase().replaceAll(" ", "-")}`}>
                  {item[1]}
                </span>
                <code>{item[2]}</code>
              </div>
            ))}
          </div>
          <p className="evidence-note">{lens.detail}</p>
        </div>
      </div>
      <p className="explorer-footer">
        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
          <path d="M6 0h4v4h4v4h-4v6H6V8H2V4h4z" fill="currentColor" />
        </svg>
        {lens.link}
        <span>Interactive preview · synthetic data</span>
      </p>
    </section>
  );
}

const questions = [
  [
    "What is Quoli?",
    "Quoli is a visual map of coding-agent work. It brings recorded agent activity, the code it touched, Git history, and repository-declared infrastructure into four connected lenses, with session replay and evidence you can inspect.",
  ],
  [
    "Which coding agents does it support?",
    "The current local application supports Claude Code. Codex, OpenCode, and Pi adapters are on the roadmap. This landing page describes that broader direction; it does not mean those integrations are available today.",
  ],
  [
    "Is this for solo developers or teams?",
    "Both are part of the vision. Today, Quoli runs locally for individual developers. Shared sessions, team views, and opt-in hosted synchronization are planned. The waitlist is for updates as that experience develops.",
  ],
  [
    "Does my code leave my machine?",
    "In the current application, evidence stays on your machine. Prompts and tool inputs and outputs are stored locally, with best-effort credential redaction before persistence. Any future cloud synchronization must be explicitly enabled per project.",
  ],
  [
    "Is everything the agent does captured?",
    "No. Quoli records what supported hooks and transcripts expose, never hidden reasoning. Some edits made through shell commands may be missed. Costs are estimates, infrastructure is repository-derived, and a successful command does not prove a feature is correct.",
  ],
  [
    "What happens when I join the waitlist?",
    "Your email is saved by this Quoli server for launch updates. There is no analytics tracking or automatic email delivery in this preview. The site operator can remove your entry from the separate waitlist database; don't post your email publicly.",
  ],
] as const;

export function Landing() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          (entry.target as HTMLElement).dataset.still = String(!entry.isIntersecting);
      },
      { rootMargin: "80px" },
    );
    for (const element of document.querySelectorAll(
      ".hero-world, .story-art, .world-map, .privacy-landscape, .closing-courier",
    ))
      observer.observe(element);
    return () => observer.disconnect();
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
            <a href="#world">The idea</a>
            <a href="#lenses">Four lenses</a>
            <a href="#faq">Questions</a>
          </nav>
          <a className="nav-cta" href="#waitlist">
            Get early access
            <Arrow diagonal />
          </a>
        </div>
      </header>
      <main id="main">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">
              Your agents build.
              <br />
              <span>
                See the whole
                <br className="hero-line" /> story.
              </span>
            </h1>
            <p className="hero-description">
              A lot happens between a prompt and a commit.
              <br className="desktop-break" /> Quoli connects the dots—so you can see what your
              coding agents did, and everything they touched.
            </p>
            <Waitlist location="hero" />
            <a className="explore-link" href="#lenses">
              <span className="play-icon" aria-hidden="true">
                <svg aria-hidden="true" viewBox="0 0 16 16">
                  <path d="m6 3 7 5-7 5z" fill="currentColor" />
                </svg>
              </span>
              Take a look around
              <Arrow />
            </a>
          </div>
          <div className="hero-world">
            <img
              className="city-art"
              src="/landing/quoli-city.webp"
              width="1536"
              height="1024"
              alt="An original pixel-art codebase city: connected workshops, an observatory, canals, and tiny robot couriers."
              fetchPriority="high"
            />
            <div className="city-cloud cloud-one" aria-hidden="true" />
            <div className="city-cloud cloud-two" aria-hidden="true" />
            <div className="hero-courier" aria-hidden="true">
              <Courier />
            </div>
            <div className="city-tag">
              <span className="status-dot" />
              <span>
                Different agents.
                <br />
                <strong>One connected story.</strong>
              </span>
            </div>
            <span className="world-coordinate">A SMALL WORLD. A BIGGER PICTURE.</span>
          </div>
        </section>
        <div className="agent-strip">
          <p>A home for your agent work.</p>
          <div className="agent-names">
            <span>
              <PixelIcon kind={0} />
              Claude Code<small>available locally</small>
            </span>
            <span>Codex</span>
            <span>OpenCode</span>
            <span>Pi</span>
            <small className="roadmap-label">
              More agents on the horizon <Arrow />
            </small>
          </div>
        </div>
        <section className="story section" id="world" aria-labelledby="story-title">
          <div className="story-art" aria-hidden="true">
            <div className="courier-window">
              <Courier large />
              <span className="courier-shadow" />
            </div>
            <div className="ground-rule">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <span className="courier-caption">A LITTLE CONTEXT GOES A LONG WAY.</span>
          </div>
          <div className="story-copy">
            <h2 id="story-title">
              The agent finished.
              <br />
              <span>
                You're still piecing <br />
                it together.
              </span>
            </h2>
            <p>
              A terminal full of tool calls. A diff full of changes. A branch, a build, a bill. Each
              tells part of the story.
            </p>
            <p>
              Quoli brings them into one map. Pick a session and follow its trail—from what the
              agent did to where the work landed.
            </p>
            <a className="text-link" href="#lenses">
              Here's how it connects
              <Arrow />
            </a>
          </div>
        </section>
        <LensExplorer />
        <section className="review section" aria-labelledby="review-title">
          <div className="review-copy">
            <h2 id="review-title">
              Less archaeology.
              <br />
              <span>More understanding.</span>
            </h2>
            <p>
              Start with the big picture. Follow a thread.
              <br />
              Get to the evidence when you need it.
            </p>
            <div className="review-principle">
              <PixelIcon kind={1} />
              <div>
                <h3>A trail you can inspect.</h3>
                <p>
                  Prompts, recorded calls, edits, and command results. Context stays close to the
                  work.
                </p>
              </div>
            </div>
            <div className="review-principle">
              <PixelIcon kind={3} />
              <div>
                <h3>Honest about the gaps.</h3>
                <p>
                  Recorded, derived, or inferred—know the difference. Unknown doesn't quietly turn
                  into “all good.”
                </p>
              </div>
            </div>
          </div>
          <div className="review-document">
            <div className="document-top">
              <span className="document-logo">
                <PixelIcon kind={0} />
                quoli
              </span>
              <span>SESSION SUMMARY</span>
            </div>
            <h3>Add order tracking</h3>
            <div className="document-meta">
              <span className="status-dot" />
              Illustrative session<span>Claude Code</span>
            </div>
            <div className="document-section">
              <span className="document-label">THE REQUEST</span>
              <p>“Let customers track their latest order from checkout.”</p>
            </div>
            <div className="document-section">
              <span className="document-label">WHAT CHANGED</span>
              <div className="file-row">
                <code>src/checkout.ts</code>
                <span>
                  +18 <em>−4</em>
                </span>
              </div>
              <div className="file-row">
                <code>tests/checkout.test.ts</code>
                <span>+12</span>
              </div>
            </div>
            <div className="document-section">
              <span className="document-label">
                WORTH A CLOSER LOOK <small>DERIVED</small>
              </span>
              <div className="review-warning">
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M8 2h4v3h3v3h3v4h-3v3h-3v3H8v-3H5v-3H2V8h3V5h3z" fill="currentColor" />
                  <path d="M9 6h2v5H9zm0 7h2v2H9z" fill="#fff" />
                </svg>
                <p>
                  <strong>An edit happened after the last test run.</strong>
                  <span>Check the final change before you move on.</span>
                </p>
              </div>
            </div>
            <div className="document-bottom">
              <span>Every claim has a basis.</span>
              <span>Synthetic example</span>
            </div>
          </div>
        </section>
        <section className="privacy-section" id="privacy" aria-labelledby="privacy-title">
          <div className="privacy-inner">
            <div className="privacy-copy">
              <PixelIcon kind={4} />
              <h2 id="privacy-title">
                Your code.
                <br />
                Your corner of the world.
              </h2>
              <p>
                Quoli starts on your machine. Your prompts, tool calls, and code evidence stay
                there. Cloud sync is a future option, never a quiet default.
              </p>
              <p className="privacy-detail">
                The application stores evidence locally with best-effort secret redaction. This
                waitlist stores only the email you submit, separately from agent sessions.
              </p>
              <a href={repo} target="_blank" rel="noreferrer" className="text-link">
                Explore the project
                <Arrow diagonal />
              </a>
            </div>
            <div className="privacy-landscape" aria-hidden="true">
              <div className="moon" />
              <div className="night-star star-one" />
              <div className="night-star star-two" />
              <div className="night-star star-three" />
              <div className="night-cabin">
                <img src="/landing/cottage.webp" width="1536" height="1024" alt="" loading="lazy" />
              </div>
              <span className="night-caption">
                <span className="status-dot" />
                LOCAL BY DEFAULT. YOURS BY DESIGN.
              </span>
            </div>
          </div>
        </section>
        <section className="faq section" id="faq" aria-labelledby="faq-title">
          <div>
            <h2 id="faq-title">
              A few things
              <br />
              <span>you might wonder.</span>
            </h2>
            <p>
              Big picture, small print.
              <br />
              We believe you should have both.
            </p>
          </div>
          <div className="faq-list">
            {questions.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span className="faq-toggle" aria-hidden="true" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="closing section" id="waitlist" aria-labelledby="waitlist-title">
          <div className="closing-courier" aria-hidden="true">
            <Courier />
          </div>
          <h2 id="waitlist-title">
            Good work deserves
            <br />
            <span>a clear picture.</span>
          </h2>
          <p>
            Be here for Quoli's next chapter.
            <br />
            For developers today. A shared view for teams on the horizon.
          </p>
          <Waitlist location="footer" />
          <span className="closing-ground" aria-hidden="true" />
        </section>
      </main>
      <footer className="site-footer">
        <div className="footer-main">
          <Brand />
          <p>One map. The whole story.</p>
          <a href={repo} target="_blank" rel="noreferrer">
            GitHub
            <Arrow diagonal />
          </a>
          <a href="#privacy">Privacy</a>
          <a href="#top">Back to top ↑</a>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Quoli</span>
          <span>Made for the curious ones.</span>
          <span>
            A little world, still growing.
            <span className="status-dot" />
          </span>
        </div>
      </footer>
    </>
  );
}
