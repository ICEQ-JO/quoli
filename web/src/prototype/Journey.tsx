import { useEffect, useReducer, useRef } from "react";
import { createRoot } from "react-dom/client";
import { highlight } from "../lenses/map/highlight.ts";
import { setThemePref, useTheme } from "../theme.ts";
import {
  initialJourney,
  mainPath,
  navigateJourney,
  relationships,
  type ShopNode,
  shop,
} from "./shop.ts";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "../styles.css";
import "./journey.css";

function JourneyPrototype() {
  const [state, dispatch] = useReducer(navigateJourney, initialJourney);
  const theme = useTheme();
  const readerTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state.selected) readerTitle.current?.focus({ preventScroll: true });
  }, [state.selected]);
  const select = (id: ShopNode) => dispatch({ type: "select", id });
  const current = state.selected ? shop[state.selected] : null;
  const visible = new Set<ShopNode>(state.selected ? mainPath : []);
  if (state.calculation) visible.add("total");
  if (state.tests) visible.add("test");
  const edges = relationships.filter((e) => visible.has(e.from) && visible.has(e.to));
  const tokens = current ? highlight(current.code, current.file) : [];

  return (
    <div className="journey-app">
      <a className="journey-skip" href="#journey-main">
        Skip to code exploration
      </a>
      <header className="journey-top">
        <a className="journey-brand" href="/">
          Quoli<span> / </span>Code
        </a>
        <span className="journey-prototype">Interactive prototype · synthetic shop</span>
        <button type="button" onClick={() => setThemePref(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </button>
      </header>
      <div className="journey-layout">
        <aside className="journey-sidebar" aria-label="Project navigation">
          <h2>
            shop<span>Hono · TypeScript · SQLite</span>
          </h2>
          <button
            type="button"
            className="journey-overview"
            aria-pressed={!current}
            onClick={() => dispatch({ type: "overview" })}
          >
            Project overview
          </button>
          <h3>
            Entry points <span>1</span>
          </h3>
          <button type="button" className="journey-endpoint" onClick={() => select("route")}>
            <span className="journey-method">POST</span>
            <code>/orders</code>
            <small>Create an order</small>
          </button>
          <div className="journey-packages">
            <h3>Inside this example</h3>
            <p>
              <code>api/</code>
              <span>Accept requests</span>
            </p>
            <p>
              <code>services/</code>
              <span>Calculate totals</span>
            </p>
            <p>
              <code>data/</code>
              <span>Store orders</span>
            </p>
          </div>
          <p className="journey-disclosure">
            Authored example. No repository is opened, no sessions are read and no code is executed.
          </p>
        </aside>
        <main className="journey-workspace" id="journey-main" tabIndex={-1}>
          <header className="journey-heading">
            <div>
              <h1>{current ? "How an order is saved" : "Find your way through the code"}</h1>
              <p>
                {current
                  ? "Follow the request. Select any part to read the code behind it."
                  : "Start with something the application does, then follow it to the data."}
              </p>
            </div>
            {current && (
              <button
                type="button"
                disabled={!state.history.length}
                onClick={() => dispatch({ type: "back" })}
              >
                Back to previous selection
              </button>
            )}
          </header>
          {!current ? (
            <section className="journey-start" aria-label="Project overview">
              <div className="journey-start-copy">
                <h2>A small shop, from request to record.</h2>
                <p>
                  One endpoint receives an order. A service calculates its total, then a data
                  function saves it to SQLite.
                </p>
                <button type="button" className="journey-primary" onClick={() => select("route")}>
                  Explore POST /orders <Arrow />
                </button>
              </div>
              <ol className="journey-overview-flow">
                <li>
                  <span>Request</span>
                  <strong>API</strong>
                  <code>POST /orders</code>
                </li>
                <li>
                  <span>Business rules</span>
                  <strong>Order service</strong>
                  <code>createOrder</code>
                </li>
                <li>
                  <span>Persistence</span>
                  <strong>Database</strong>
                  <code>orders</code>
                </li>
              </ol>
              <p className="journey-boundary">
                This prototype explores one authored flow. Automatic discovery and agent-change
                overlays are subsequent increments.
              </p>
            </section>
          ) : (
            <>
              <nav className="journey-trail" aria-label="Request path">
                {mainPath.map((id, i) => (
                  <span key={id}>
                    {i > 0 && <Arrow />}
                    <button
                      type="button"
                      aria-current={state.selected === id ? "location" : undefined}
                      onClick={() => select(id)}
                    >
                      {shop[id].name}
                    </button>
                  </span>
                ))}
              </nav>
              <div className="journey-detail-layout">
                <section className="journey-map" aria-label="Order request relationships">
                  <div className="journey-map-toolbar">
                    <span>Request to storage</span>
                    <small>Static source relationships</small>
                  </div>
                  <section
                    className="journey-map-scroll"
                    aria-label="Scrollable relationship map"
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll the wide map.
                    tabIndex={0}
                  >
                    <div className="journey-canvas">
                      <div className="journey-area" style={{ left: 8 }}>
                        <span>API</span>
                      </div>
                      <div className="journey-area" style={{ left: 218 }}>
                        <span>Business logic</span>
                      </div>
                      <div className="journey-area" style={{ left: 428 }}>
                        <span>Data</span>
                      </div>
                      <svg className="journey-edges" viewBox="0 0 640 450" aria-hidden="true">
                        <defs>
                          <marker
                            id="journey-arrow"
                            viewBox="0 0 10 10"
                            refX="8"
                            refY="5"
                            markerWidth="5"
                            markerHeight="5"
                            orient="auto-start-reverse"
                          >
                            <path d="M 0 0 L 10 5 L 0 10 z" />
                          </marker>
                        </defs>
                        {edges.map((e) => {
                          const a = shop[e.from],
                            b = shop[e.to];
                          const vertical = a.x === b.x;
                          const d = vertical
                            ? `M ${a.x + 90} ${a.y + 91} V ${b.y - 6}`
                            : `M ${a.x + 180} ${a.y + 46} H ${b.x - 6}`;
                          return (
                            <g key={`${e.from}-${e.to}`}>
                              <path d={d} markerEnd="url(#journey-arrow)" />
                              <text
                                x={vertical ? a.x + 100 : (a.x + 180 + b.x) / 2}
                                y={vertical ? (a.y + 91 + b.y) / 2 : a.y + 35}
                                textAnchor={vertical ? "start" : "middle"}
                              >
                                {e.label}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                      {[...visible].map((id) => (
                        <button
                          key={id}
                          type="button"
                          className="journey-node"
                          style={{ left: shop[id].x, top: shop[id].y }}
                          aria-pressed={state.selected === id}
                          onClick={() => select(id)}
                        >
                          <span>{shop[id].kind}</span>
                          <strong>{shop[id].name}</strong>
                          <small>{shop[id].file}</small>
                        </button>
                      ))}
                      {!state.calculation && (
                        <button
                          type="button"
                          className="journey-expand"
                          style={{ left: 230, top: 270 }}
                          onClick={() => select("total")}
                        >
                          Show calculation <span>1 function</span>
                        </button>
                      )}
                      {state.calculation && !state.tests && (
                        <button
                          type="button"
                          className="journey-expand"
                          style={{ left: 20, top: 270 }}
                          onClick={() => select("test")}
                        >
                          Show related test <span>Not run</span>
                        </button>
                      )}
                    </div>
                  </section>
                  <p className="journey-map-note">
                    Arrows show source relationships, not execution order or a recorded runtime
                    trace.
                  </p>
                </section>
                <section className="journey-reader" aria-label="Source and explanation">
                  <header>
                    <span>{current.kind}</span>
                    <h2 ref={readerTitle} tabIndex={-1}>
                      {current.name}
                    </h2>
                    <p>{current.description}</p>
                  </header>
                  <div className="journey-source-head">
                    <code>{current.file}</code>
                    <span>Example source</span>
                  </div>
                  <section
                    aria-label={`Source of ${current.name}`}
                    className="journey-source-scroll"
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: source needs keyboard scrolling.
                    tabIndex={0}
                  >
                    <pre>
                      <code>
                        {tokens.map((line, i) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: static source lines have stable positions within each file.
                          <span className="journey-code-line" key={`${current.file}-${i}`}>
                            <span className="journey-line-number" aria-hidden="true">
                              {i + 1}
                            </span>
                            <span>
                              {line.map((t, j) => (
                                <span
                                  className={`journey-token-${t.cls || "plain"}`}
                                  // biome-ignore lint/suspicious/noArrayIndexKey: static syntax tokens keep their source positions.
                                  key={j}
                                >
                                  {t.text}
                                </span>
                              ))}
                            </span>
                          </span>
                        ))}
                      </code>
                    </pre>
                  </section>
                  <div className="journey-connections">
                    <h3>Connected code</h3>
                    {relationships
                      .filter((e) => e.from === state.selected || e.to === state.selected)
                      .map((e) => {
                        const outgoing = e.from === state.selected;
                        const other = outgoing ? e.to : e.from;
                        return (
                          <button
                            type="button"
                            key={`${e.from}-${e.to}`}
                            onClick={() => select(other)}
                          >
                            <span>
                              {outgoing
                                ? e.label
                                : e.label === "tests"
                                  ? "tested by"
                                  : e.label === "writes"
                                    ? "written by"
                                    : "called by"}{" "}
                              <strong>{shop[other].name}</strong>
                            </span>
                            <small>
                              {shop[e.from].file}:{e.line}
                            </small>
                            <Arrow />
                          </button>
                        );
                      })}
                  </div>
                </section>
              </div>
              <p className="journey-announcement" role="status">
                Reading {current.name}. The request path stays in view.
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8h10m-4-4 4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
createRoot(document.getElementById("root") as HTMLElement).render(<JourneyPrototype />);
