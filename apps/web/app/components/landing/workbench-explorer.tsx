"use client";

import * as React from "react";

interface TabItem {
  id: string;
  name: string;
  badge: string;
  title: string;
  description: string;
}

const TABS: TabItem[] = [
  {
    id: "session-doc",
    name: "Session Review",
    badge: "WORKBENCH",
    title: "The Developer Request & Execution Receipt",
    description:
      "Inspect the raw developer prompt, total input/output cache tokens, duration, and unambiguously linked tool dispatches in one unified document.",
  },
  {
    id: "diff-engine",
    name: "Bounded Diffs",
    badge: "INSPECTION",
    title: "Explicit Before/After Code Snapshots",
    description:
      "Compare file changes against actual git working-tree baselines. Unavailable sides are marked explicitly instead of hallucinated as empty files.",
  },
  {
    id: "checks-queue",
    name: "Needs Review",
    badge: "VERIFICATION",
    title: "Capture Gaps & Unverified Claims",
    description:
      "A source-linked queue alerting you whenever an agent claimed tests passed without invoking the test suite or when private files were omitted.",
  },
  {
    id: "evidence-graph",
    name: "Tool Provenance",
    badge: "DETERMINISTIC",
    title: "Exact Tool ID Matching",
    description:
      "Tool calls and tool responses are joined only by strict project ID, session ID, and tool execution ID. No guesswork or heuristic pairing.",
  },
];

export function WorkbenchExplorer() {
  const [activeTab, setActiveTab] = React.useState("session-doc");

  const tab = TABS.find((t) => t.id === activeTab) || TABS[0];

  return (
    <section id="features" className="workbench-section">
      <div className="section-head">
        <h2 className="section-title">The Evidence Inspection Workbench</h2>
        <p className="section-subtitle">
          Designed with the density, speed, and precision of Linear. Built for developers who want
          instant keyboard-friendly navigation and zero fluff.
        </p>
      </div>

      <div className="workbench-container">
        {/* Tab Bar */}
        <div className="workbench-tabs" role="tablist" aria-label="Workbench features">
          {TABS.map((t) => (
            <button
              type="button"
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              className={`workbench-tab-btn ${activeTab === t.id ? "active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span className="tab-name">{t.name}</span>
              <span className="tab-pill">{t.badge}</span>
            </button>
          ))}
        </div>

        {/* Tab Content Display */}
        <div className="workbench-viewport">
          <div className="viewport-header">
            <div className="viewport-meta">
              <span className="vp-tag">{tab.badge}</span>
              <h3 className="vp-title">{tab.title}</h3>
            </div>
            <p className="vp-desc">{tab.description}</p>
          </div>

          <div className="mock-window">
            <div className="mock-window-chrome">
              <span className="chrome-dot red" />
              <span className="chrome-dot yellow" />
              <span className="chrome-dot green" />
              <span className="chrome-url">
                traceframe://workbench/session/7f3a?view={activeTab}
              </span>
              <span className="chrome-status">127.0.0.1:40009 · SYNCED</span>
            </div>

            <div className="mock-window-content">
              {activeTab === "session-doc" && (
                <div className="mock-session-doc">
                  <div className="doc-meta-bar">
                    <span className="doc-id">SESSION #7F3A-89 · 4 TOOLS DISPATCHED</span>
                    <span className="doc-tokens">14,280 IN / 1,420 OUT · 12.4s DURATION</span>
                  </div>
                  <div className="doc-prompt-box">
                    <span className="prompt-label">DEVELOPER REQUEST:</span>
                    <p className="prompt-content">
                      “Investigate slow query performance in audit event table and add composite
                      index.”
                    </p>
                  </div>
                  <div className="doc-tool-list">
                    <div className="doc-tool-row">
                      <span className="tool-idx">01</span>
                      <span className="tool-action">run_command</span>
                      <code className="tool-arg">
                        explain query plan select * from events where project_id = ? order by
                        created_at
                      </code>
                      <span className="tool-tag tag-ok">exit 0</span>
                    </div>
                    <div className="doc-tool-row">
                      <span className="tool-idx">02</span>
                      <span className="tool-action">edit_file</span>
                      <code className="tool-arg">
                        packages/storage/src/migrations/004_indexes.sql
                      </code>
                      <span className="tool-tag tag-diff">+12 / -2</span>
                    </div>
                    <div className="doc-tool-row">
                      <span className="tool-idx">03</span>
                      <span className="tool-action">run_command</span>
                      <code className="tool-arg">pnpm test:storage</code>
                      <span className="tool-tag tag-ok">24 passed</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "diff-engine" && (
                <div className="mock-diff-view">
                  <div className="diff-file-header">
                    <span className="diff-path">
                      packages/storage/src/migrations/004_indexes.sql
                    </span>
                    <span className="diff-stats">+12 / -2 lines · MODIFIED</span>
                  </div>
                  <div className="diff-code-editor">
                    <div className="diff-line neutral">
                      <span className="ln">28</span>
                      <span className="lc">
                        -- Add optimized query indexes for project event scans
                      </span>
                    </div>
                    <div className="diff-line del">
                      <span className="ln">29</span>
                      <span className="lc">
                        - CREATE INDEX idx_events_proj ON events(project_id);
                      </span>
                    </div>
                    <div className="diff-line add">
                      <span className="ln">29</span>
                      <span className="lc">
                        + CREATE INDEX idx_events_proj_created ON events(project_id, created_at
                        DESC);
                      </span>
                    </div>
                    <div className="diff-line add">
                      <span className="ln">30</span>
                      <span className="lc">
                        + CREATE INDEX idx_events_session_cursor ON events(session_id,
                        source_order);
                      </span>
                    </div>
                    <div className="diff-line neutral">
                      <span className="ln">31</span>
                      <span className="lc"> COMMIT;</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "checks-queue" && (
                <div className="mock-queue-view">
                  <div className="queue-item unverified">
                    <div className="queue-top">
                      <span className="queue-badge alert">UNVERIFIED ASSERTION</span>
                      <span className="queue-time">2 mins ago</span>
                    </div>
                    <div className="queue-body">
                      Agent reported: <em>“All regression checks pass.”</em>
                      <span className="queue-detail">
                        Traceframe fact: Command exit code was 0, but assertion count was 0 (no test
                        files matched).
                      </span>
                    </div>
                  </div>
                  <div className="queue-item gap">
                    <div className="queue-top">
                      <span className="queue-badge info">CAPTURE GAP</span>
                      <span className="queue-time">4 mins ago</span>
                    </div>
                    <div className="queue-body">
                      File read: <code>.env.development</code>
                      <span className="queue-detail">
                        Excluded by repository privacy policy: secret token omitted from persistent
                        event log.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "evidence-graph" && (
                <div className="mock-evidence-view">
                  <div className="evidence-header-line">
                    <span>RELATIONSHIP JOIN GRAPH</span>
                    <span>100% DETERMINISTIC BASIS</span>
                  </div>
                  <div className="evidence-tree">
                    <div className="tree-node">
                      <span className="node-type">REQUEST</span>
                      <code>req_98b2c418</code>
                      <span className="tree-arrow">➔</span>
                      <span className="node-type">TOOL_CALL</span>
                      <code>tool_41ae0921 (edit_file)</code>
                      <span className="tree-arrow">➔</span>
                      <span className="node-type">SNAPSHOT</span>
                      <code>snap_7b3a9182</code>
                    </div>
                    <div className="evidence-status-pill">
                      ✓ Linked by explicit matching IDs · Zero probabilistic inference
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
