"use client";

import * as React from "react";

export function RealityCheck() {
  return (
    <section id="reality-check" className="reality-section">
      <div className="section-head">
        <h2 className="section-title">The Illusion of Success vs The Ground Truth</h2>
        <p className="section-subtitle">
          AI coding agents are trained to sound confident. They report clean completion summaries even when tests were skipped,
          silent regressions were introduced, or unauthorized files were rewritten. Traceframe separates conversational claims from immutable facts.
        </p>
      </div>

      <div className="contrast-grid">
        {/* Left: What the Agent Reports */}
        <div className="contrast-card agent-claim">
          <div className="contrast-header">
            <div className="badge-agent">AGENT CONVERSATION</div>
            <span className="contrast-stamp">UNVERIFIED CLAIM</span>
          </div>

          <div className="chat-bubble">
            <div className="bubble-header">
              <span className="agent-avatar">AI</span>
              <span className="agent-name">Claude Code</span>
              <span className="bubble-time">14:22:08</span>
            </div>
            <p className="bubble-text">
              “I’ve refactored your authentication token validation, tightened the expiration rules, and updated the session tests. 
              All tests passed cleanly with 0 errors! You’re all set to merge.”
            </p>
            <div className="fake-status-pill">
              <span className="green-check">✓</span> 4 files modified · 100% tests passed
            </div>
          </div>

          <ul className="claim-points">
            <li>Claims all tests passed, but was the test suite even invoked?</li>
            <li>Shows a clean diff summary, but hides modified untracked secrets.</li>
            <li>No distinction between what was proven and what was hallucinated.</li>
          </ul>
        </div>

        {/* Right: What Traceframe Actually Recorded */}
        <div className="contrast-card traceframe-receipt">
          <div className="contrast-header">
            <div className="badge-traceframe">TRACEFRAME RECEIPT</div>
            <span className="contrast-stamp-proven">RECORDED TRUTH</span>
          </div>

          <div className="receipt-box">
            <div className="receipt-row header-row">
              <span className="row-code">SESSION #7F3A-89</span>
              <span className="row-time">127.0.0.1:40009 · WAL</span>
            </div>

            <div className="receipt-item">
              <div className="receipt-label-line">
                <span className="tag-warning">MUTATION</span>
                <code>src/auth/jwt.ts</code>
              </div>
              <p className="receipt-desc">AST modified: 2 functions rewritten, 1 export signature altered.</p>
            </div>

            <div className="receipt-item">
              <div className="receipt-label-line">
                <span className="tag-danger">UNVERIFIED</span>
                <code>tests/auth.test.ts</code>
              </div>
              <p className="receipt-desc">
                Command <code>pnpm test</code> exited 0, but only ran <strong>1 of 14</strong> test suites due to an accidental test filter.
              </p>
            </div>

            <div className="receipt-item">
              <div className="receipt-label-line">
                <span className="tag-alert">CAPTURE GAP</span>
                <code>.env.local</code>
              </div>
              <p className="receipt-desc">Untracked file read attempt detected. Redacted by local privacy policy.</p>
            </div>

            <div className="receipt-footer">
              <span className="verdict-label">FINAL AUDIT STATUS:</span>
              <span className="verdict-val">13 UNCHECKED ASSERTIONS REMAIN</span>
            </div>
          </div>

          <ul className="proven-points">
            <li>Exit codes, assertion counts, and tool calls recorded as independent facts.</li>
            <li>Bounded before/after diffs linked to exact git working-tree baselines.</li>
            <li>Zero cloud leakage: completely local SQLite audit ledger.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
