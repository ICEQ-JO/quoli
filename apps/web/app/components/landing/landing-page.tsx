"use client";

import * as React from "react";
import { ArchitectureSpecs } from "./architecture-specs";
import { FlightRecorderRig } from "./flight-recorder-rig";
import { LandingFooter } from "./landing-footer";
import { LandingNav } from "./landing-nav";
import { MechanicalPillars } from "./mechanical-pillars";
import { RealityCheck } from "./reality-check";
import { WorkbenchExplorer } from "./workbench-explorer";
import "./landing.css";

export function LandingPage() {
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  const [copied, setCopied] = React.useState(false);

  const toggleTheme = React.useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  // Sync theme attribute on root element
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const copyInstall = React.useCallback(() => {
    navigator.clipboard?.writeText("pnpm connect /path/to/repo --capture-code");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="landing-root" data-theme={theme}>
      {/* Navigation */}
      <LandingNav theme={theme} onToggleTheme={toggleTheme} />

      <main className="landing-main">
        {/* HERO SECTION */}
        <section id="hero-rig" className="landing-hero">
          <div className="hero-content">
            <div className="hero-tag-row">
              <span className="hero-badge">LOCAL-FIRST FLIGHT RECORDER</span>
              <span className="hero-meta-pill">REPOSITORY HISTORY · ANY AGENT</span>
            </div>

            <h1 className="hero-headline">
              Stop guessing what your coding agent touched. See the receipts.
            </h1>

            <p className="hero-subtext">
              Quoli records local repository changes and captured diffs, regardless of your agent or
              editor. Optional agent integrations add available session evidence. Missing evidence
              stays visible.
            </p>

            <div className="hero-actions">
              <div className="terminal-quick-copy">
                <span className="terminal-prefix">$</span>
                <code className="terminal-cmd">pnpm connect /path/to/repo --capture-code</code>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={copyInstall}
                  aria-label="Copy repository connection command"
                  title="Copy command"
                >
                  {copied ? "COPIED" : "COPY"}
                </button>
              </div>

              <p className="document-muted">
                From the Quoli source checkout, with pnpm dev running.
              </p>
              <div className="hero-secondary-links">
                <a href="/" className="hero-btn-primary">
                  Launch Local Workbench ➔
                </a>
                <a
                  href="/?project=demo-quoli&session=session-cache&view=session"
                  className="hero-btn-secondary"
                >
                  Inspect Sample Session
                </a>
              </div>
            </div>
          </div>

          {/* The Anatomy Hero Figure */}
          <div className="hero-rig-card">
            <FlightRecorderRig />
          </div>
        </section>

        {/* REALITY CHECK: THE ILLUSION OF SUCCESS */}
        <RealityCheck />

        {/* THREE MECHANICAL PILLARS */}
        <MechanicalPillars />

        {/* WORKBENCH FEATURE EXPLORER */}
        <WorkbenchExplorer />

        {/* ARCHITECTURE & SYSTEM SPECS */}
        <ArchitectureSpecs />
      </main>

      {/* FOOTER */}
      <LandingFooter />
    </div>
  );
}
