"use client";

import * as React from "react";
import { LandingNav } from "./landing-nav";
import { FlightRecorderRig } from "./flight-recorder-rig";
import { RealityCheck } from "./reality-check";
import { MechanicalPillars } from "./mechanical-pillars";
import { WorkbenchExplorer } from "./workbench-explorer";
import { ArchitectureSpecs } from "./architecture-specs";
import { LandingFooter } from "./landing-footer";
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
    navigator.clipboard?.writeText("curl -fsSL https://traceframe.dev/install.sh | sh");
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
              <span className="hero-meta-pill">DESIGNED FOR CLAUDE CODE</span>
            </div>

            <h1 className="hero-headline">
              Stop guessing what your coding agent touched. See the receipts.
            </h1>

            <p className="hero-subtext">
              Traceframe is the local-first audit engine for AI developers. It records every tool dispatch,
              captures bounded AST diffs against real git baselines, and separates verified truth from conversational claims—with
              zero cloud telemetry.
            </p>

            <div className="hero-actions">
              <div className="terminal-quick-copy">
                <span className="terminal-prefix">$</span>
                <code className="terminal-cmd">curl -fsSL https://traceframe.dev/install.sh | sh</code>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={copyInstall}
                  aria-label="Copy install script command"
                  title="Copy command"
                >
                  {copied ? "COPIED" : "COPY"}
                </button>
              </div>

              <div className="hero-secondary-links">
                <a href="/" className="hero-btn-primary">
                  Launch Local Workbench ➔
                </a>
                <a href="/?project=proj_local&session=sess_demo_1" className="hero-btn-secondary">
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
