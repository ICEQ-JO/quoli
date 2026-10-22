"use client";

import * as React from "react";

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="footer-inner">
        <div className="footer-brand-col">
          <div className="brand-group">
            <svg
              aria-hidden="true"
              width="20"
              height="20"
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
            <span className="brand-name">Quoli</span>
          </div>
          <p className="footer-thesis">
            “Show me what my coding agent did, what changed, and what remains unverified.”
          </p>
          <div className="footer-security-pill">
            <span className="sec-dot" />
            100% Local-First · Zero Cloud Telemetry
          </div>
        </div>

        <div className="footer-links-col">
          <span className="col-heading">PRODUCT</span>
          <a href="#hero-rig" className="f-link">
            Instrument TF-01
          </a>
          <a href="#reality-check" className="f-link">
            The Illusion
          </a>
          <a href="#mechanism" className="f-link">
            Mechanism
          </a>
          <a href="#features" className="f-link">
            Workbench
          </a>
        </div>

        <div className="footer-links-col">
          <span className="col-heading">DEVELOPER</span>
          <a
            href="https://github.com/ICEQ-JO/quoli"
            target="_blank"
            rel="noopener noreferrer"
            className="f-link"
          >
            GitHub Repository
          </a>
          <a
            href="https://github.com/ICEQ-JO/quoli/blob/main/docs/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="f-link"
          >
            Architecture Docs
          </a>
          <a
            href="https://github.com/ICEQ-JO/quoli/blob/main/docs/claude-code-capabilities.md"
            target="_blank"
            rel="noopener noreferrer"
            className="f-link"
          >
            Claude Code Matrix
          </a>
          <a href="/" className="f-link">
            Launch Local App
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <span className="copy-text">© 2026 Quoli / quoli. Open Source under Apache 2.0 & MIT.</span>
        <span className="node-version">
          Running locally on loopback · Verified with Impeccable & Anatomy
        </span>
      </div>
    </footer>
  );
}
