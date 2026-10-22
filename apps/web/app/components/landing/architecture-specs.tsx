"use client";

import * as React from "react";

export function ArchitectureSpecs() {
  return (
    <section id="specs" className="specs-section">
      <div className="section-head">
        <h2 className="section-title">Engineered for the Local Terminal</h2>
        <p className="section-subtitle">
          No cloud SaaS dependencies. No credit cards. No unexpected token bills. Runs beside your
          editor as a lightweight local process.
        </p>
      </div>

      <div className="specs-grid">
        <div className="spec-metric-card">
          <span className="spec-card-num">&lt; 1.2 ms</span>
          <span className="spec-card-label">LOOPBACK LATENCY</span>
          <p className="spec-card-desc">
            Atomic HTTP JSONL batch ingestion over 127.0.0.1 loopback socket.
          </p>
        </div>

        <div className="spec-metric-card">
          <span className="spec-card-num">0 KB</span>
          <span className="spec-card-label">CLOUD TELEMETRY</span>
          <p className="spec-card-desc">
            No network calls outside localhost. Your private code and prompts stay on your machine.
          </p>
        </div>

        <div className="spec-metric-card">
          <span className="spec-card-num">&lt; 42 MB</span>
          <span className="spec-card-label">MEMORY FOOTPRINT</span>
          <p className="spec-card-desc">
            Lightweight embedded runtime with Node/TypeScript and SQLite WAL mode.
          </p>
        </div>

        <div className="spec-metric-card">
          <span className="spec-card-num">100%</span>
          <span className="spec-card-label">DETERMINISTIC</span>
          <p className="spec-card-desc">
            All joins between requests, tool calls, and snapshots rely on explicit immutable IDs.
          </p>
        </div>
      </div>

      <div className="quickstart-box">
        <div className="quickstart-header">
          <span className="qs-title">ONE-COMMAND LOCAL QUICKSTART</span>
          <span className="qs-env">NODE 22+ · PNPM / NPX</span>
        </div>
        <div className="terminal-shell">
          <div className="shell-bar">
            <span className="dot r" />
            <span className="dot y" />
            <span className="dot g" />
            <span className="shell-title">terminal — bash</span>
          </div>
          <div className="shell-body">
            <div className="shell-line">
              <span className="prompt-sym">$</span>
              <span className="cmd-text">
                curl -fsSL https:{"//traceframe.dev/install.sh | sh"}
              </span>
            </div>
            <div className="shell-output">
              ✓ Traceframe collector ready on 127.0.0.1:40009
              <br />✓ Embedded SQLite database initialized (WAL enabled)
              <br />✓ Web review workbench ready: http:{"//127.0.0.1:3000"}
            </div>
            <div className="shell-line">
              <span className="prompt-sym">$</span>
              <span className="cmd-text">traceframe capture --root . --checkpoint</span>
            </div>
            <div className="shell-output">
              ✓ Repository baseline sealed: 142 files tracked · 0 unverified diffs
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
