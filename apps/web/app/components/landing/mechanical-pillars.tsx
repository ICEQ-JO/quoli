"use client";

import * as React from "react";

export function MechanicalPillars() {
  return (
    <section id="mechanism" className="pillars-section">
      <div className="section-head">
        <h2 className="section-title">The Three Pillars of Verifiable Agent Execution</h2>
        <p className="section-subtitle">
          Engineered for developers who reject blind trust. Traceframe is designed around strict architectural guarantees that cannot be bypassed by prompt injection or conversational drift.
        </p>
      </div>

      <div className="pillars-grid">
        {/* Pillar 1 */}
        <div className="pillar-card">
          <div className="pillar-header">
            <div className="pillar-icon-box">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <span className="pillar-idx">PILLAR // 01</span>
          </div>

          <h3 className="pillar-title">Append-Only Event Ledger</h3>
          <p className="pillar-text">
            Every session event is written to an immutable local log with nanosecond order timestamps. 
            Views, metrics, and graphs are purely derived projections. History is never overwritten, and captured commands are never replayed.
          </p>

          <div className="pillar-spec-list">
            <div className="pillar-spec-row">
              <span className="spec-k">STORAGE</span>
              <span className="spec-v">Local SQLite + WAL mode</span>
            </div>
            <div className="pillar-spec-row">
              <span className="spec-k">INTEGRITY</span>
              <span className="spec-v">Deterministic event IDs & joins</span>
            </div>
            <div className="pillar-spec-row">
              <span className="spec-k">SAFETY</span>
              <span className="spec-v">Untrusted inert data policy</span>
            </div>
          </div>
        </div>

        {/* Pillar 2 */}
        <div className="pillar-card">
          <div className="pillar-header">
            <div className="pillar-icon-box">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
            </div>
            <span className="pillar-idx">PILLAR // 02</span>
          </div>

          <h3 className="pillar-title">Bounded Diff & AST Engine</h3>
          <p className="pillar-text">
            Captures real Git working-tree baselines and checkpoints. When a file is missing or capture was disabled, Traceframe labels the side explicitly unavailable rather than inventing empty files or false deletions.
          </p>

          <div className="pillar-spec-list">
            <div className="pillar-spec-row">
              <span className="spec-k">GRANULARITY</span>
              <span className="spec-v">Unified & side-by-side diffs</span>
            </div>
            <div className="pillar-spec-row">
              <span className="spec-k">BOUNDS</span>
              <span className="spec-v">Safe UTF-8 line & byte quotas</span>
            </div>
            <div className="pillar-spec-row">
              <span className="spec-k">RENAMES</span>
              <span className="spec-v">Unique fingerprint match only</span>
            </div>
          </div>
        </div>

        {/* Pillar 3 */}
        <div className="pillar-card">
          <div className="pillar-header">
            <div className="pillar-icon-box">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <span className="pillar-idx">PILLAR // 03</span>
          </div>

          <h3 className="pillar-title">Air-Gapped Privacy Sandbox</h3>
          <p className="pillar-text">
            Runs exclusively on your local machine via loopback (<code className="code-pill">127.0.0.1</code>). Secrets, private tokens, and sensitive file paths are scrubbed by an in-flight redaction pipeline before persistence.
          </p>

          <div className="pillar-spec-list">
            <div className="pillar-spec-row">
              <span className="spec-k">NETWORK</span>
              <span className="spec-v">Zero outbound telemetry calls</span>
            </div>
            <div className="pillar-spec-row">
              <span className="spec-k">REDACTION</span>
              <span className="spec-v">Pre-persistence regex pipeline</span>
            </div>
            <div className="pillar-spec-row">
              <span className="spec-k">AUTH</span>
              <span className="spec-v">Strict loopback origin verification</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
