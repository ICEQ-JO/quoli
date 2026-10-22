"use client";

import * as React from "react";

export function LandingNav({
  theme,
  onToggleTheme,
}: {
  theme: "dark" | "light";
  onToggleTheme: () => void;
}) {
  return (
    <header className="landing-header">
      <div className="landing-header-inner">
        <div className="brand-group">
          <a href="/landing" className="brand-mark" aria-label="Traceframe Home">
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              className="brand-icon"
            >
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="3"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle cx="8" cy="8" r="2" fill="currentColor" />
              <path
                d="M8 12v4M12 8h4M12 16h4M16 12v4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span className="brand-name">Traceframe</span>
          </a>
          <span className="brand-badge">v0.1.0-preview · LOCAL</span>
        </div>

        <nav className="landing-nav-links" aria-label="Main Navigation">
          <a href="#hero-rig" className="nav-link">
            Instrument
          </a>
          <a href="#reality-check" className="nav-link">
            The Illusion
          </a>
          <a href="#mechanism" className="nav-link">
            Mechanism
          </a>
          <a href="#features" className="nav-link">
            Workbench
          </a>
          <a href="#specs" className="nav-link">
            Architecture
          </a>
          <a
            href="https://github.com/ICEQ-JO/quoli"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-link nav-github"
          >
            GitHub
          </a>
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="theme-btn"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Toggle ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
            <span className="theme-label">{theme === "dark" ? "LIGHT" : "DARK"}</span>
          </button>

          <a href="/" className="btn-primary-launch">
            <span className="launch-dot" />
            Launch Workspace
          </a>
        </div>
      </div>
    </header>
  );
}
