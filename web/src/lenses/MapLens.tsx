import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTypingTarget, modalOpen } from "../a11y.ts";
import { api } from "../api.ts";
import { EmptyState, ErrorState, Icon } from "../components/ui.tsx";
import { navigate, paths } from "../router.ts";
import type { LensContext, Selection } from "../state.ts";
import { CodeCanvas, describeNode, type NodeFlags } from "./map/CodeCanvas.tsx";
import { editedSymbols, editOf } from "./map/edits.ts";
import {
  EXPANSION_BATCH,
  EXPLORATION_LIMIT,
  neighbours,
  type PlacedNode,
  relationLabel,
  revealNodes,
} from "./map/exploration.ts";
import { focusOf, indexGraph, type MapSelection, nodeOf } from "./map/graph.ts";
import { editorLink, Reader, type ReaderTarget } from "./map/Reader.tsx";
import { StackBar } from "./map/StackBar.tsx";
import { searchGraph } from "./map/search.ts";
import "./map/map.css";
import "./map/exploration.css";

const MAX_EDIT_FILES = 24;
const MAP_KINDS = ["symbol", "file", "route", "table"] as const;
export function mapSelection(s: Selection): MapSelection | null {
  return s && (MAP_KINDS as readonly string[]).includes(s.kind) ? (s as MapSelection) : null;
}

export function MapLens(ctx: LensContext) {
  const { graph, building, error, retry } = ctx.codeGraph;
  const idx = useMemo(() => (graph ? indexGraph(graph) : null), [graph]);
  const sel = mapSelection(ctx.selection);
  const [placed, setPlaced] = useState<PlacedNode[]>([]);
  const [trail, setTrail] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [navOpen, setNavOpen] = useState(true);
  const [readerOpen, setReaderOpen] = useState(true);
  const [fit, setFit] = useState(0);
  const [notice, setNotice] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const lastSelection = useRef<string | null>(null);
  const edits = useEditedSymbols(ctx.root, ctx.calls, idx);
  const marks = useMemo(() => {
    const out = new Map<string, { edited: boolean; read: boolean }>();
    for (const call of ctx.calls)
      for (const file of call.files) {
        if (call.category === "edit" && call.status === "failed") continue;
        const value = out.get(file) ?? { edited: false, read: false };
        if (call.category === "edit" && call.status === "ok") value.edited = true;
        else if (call.category === "read" && call.status === "ok") value.read = true;
        out.set(file, value);
      }
    return out;
  }, [ctx.calls]);
  const flagsOf = useCallback(
    (id: string, file: string): NodeFlags => ({
      edited: edits.symbols.has(id),
      fileEdited: marks.get(file)?.edited ?? false,
      read: marks.get(file)?.read ?? false,
    }),
    [edits, marks],
  );

  useEffect(() => {
    if (!idx || !sel) return;
    const key = `${sel.kind}:${sel.id}`;
    if (key === lastSelection.current) return;
    lastSelection.current = key;
    const ids = sel.kind === "file" ? focusOf(idx, sel) : nodeOf(idx, sel.id) ? [sel.id] : [];
    setPlaced((current) => revealNodes(current, ids));
    setTrail((current) => [...current.filter((id) => id !== sel.id), sel.id].slice(-12));
    setReaderOpen(true);
  }, [idx, sel]);

  const pick = useCallback(
    (id: string) => {
      if (!idx) return;
      const node = nodeOf(idx, id);
      if (node) ctx.select({ kind: node.type, id });
    },
    [idx, ctx.select],
  );
  const chooseFile = (file: string) => ctx.select({ kind: "file", id: file });
  const expand = (direction: "in" | "out") => {
    if (!idx || !sel || sel.kind === "file") return;
    const hidden = neighbours(idx, sel.id, direction).filter(
      (id) => !placed.some((p) => p.id === id),
    );
    setPlaced((current) =>
      revealNodes(current, hidden.slice(0, EXPANSION_BATCH), sel.id, direction === "in" ? -1 : 1),
    );
    setNotice(
      placed.length >= EXPLORATION_LIMIT
        ? `Exploration limit reached (${EXPLORATION_LIMIT}). Start a new exploration to follow another path.`
        : `Revealed up to ${Math.min(hidden.length, EXPANSION_BATCH)} related items. Existing nodes stayed in place.`,
    );
  };
  const overview = () => {
    setPlaced([]);
    setTrail([]);
    lastSelection.current = null;
    ctx.select(null);
    setNotice("");
  };
  const target = useMemo<ReaderTarget | null>(() => {
    if (!sel || !idx) return null;
    if (sel.kind === "file")
      return {
        file: sel.id,
        title: sel.id.split("/").pop() ?? sel.id,
        kind: "file",
        start: null,
        end: null,
      };
    const n = nodeOf(idx, sel.id),
      d = describeNode(idx, sel.id);
    if (!n || !d) return null;
    return {
      file: d.file,
      title: d.name,
      kind: d.icon,
      start: d.line,
      end: n.type === "symbol" ? n.symbol.endLine : d.line,
    };
  }, [idx, sel]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTypingTarget(event.target as HTMLElement) ||
        modalOpen()
      )
        return;
      if (event.key === "/") {
        event.preventDefault();
        setNavOpen(true);
        requestAnimationFrame(() =>
          rootRef.current?.querySelector<HTMLInputElement>(".cx-navigation input")?.focus(),
        );
      } else if (event.key === "o" && target && ctx.root) {
        window.location.href = editorLink("vscode", ctx.root, target.file, target.start ?? 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, ctx.root]);
  const fileCalls = target ? ctx.calls.filter((c) => c.files.includes(target.file)) : [];
  const editedLines =
    target && idx
      ? [...(edits.byFile.get(target.file) ?? [])].flatMap((id) => {
          const s = idx.symbols.get(id);
          return s ? [[s.startLine, s.endLine] as [number, number]] : [];
        })
      : [];
  const edges =
    idx && sel && sel.kind !== "file"
      ? [...new Set([...(idx.into.get(sel.id) ?? []), ...(idx.out.get(sel.id) ?? [])])]
      : [];
  const relevantTests =
    target && graph
      ? graph.edges
          .filter(
            (e) =>
              e.kind === "import" &&
              e.to === target.file &&
              /(?:^|\/)(?:tests?|__tests__|spec)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)test_[^/]+\.py$|_test\.(?:py|go)$/.test(
                e.from,
              ),
          )
          .map((e) => e.from)
      : [];
  const allFiles = useMemo(() => {
    const files = new Map(graph?.files.map((f) => [f.path, f]) ?? []);
    for (const f of ctx.code?.files ?? [])
      if (!files.has(f.path))
        files.set(f.path, { path: f.path, language: "Not symbol-indexed", lines: f.lines ?? 0 });
    return [...files.values()];
  }, [graph, ctx.code]);
  const hits = graph && query.trim() ? searchGraph({ ...graph, files: allFiles }, query, 50) : [];
  const overviewVisible = placed.length === 0 && !sel;

  if (!graph || !idx)
    return (
      <div className="map" ref={rootRef}>
        <StackBar graph={null} building={building} />
        <div className="map-state">
          {error ? (
            <ErrorState title="Could not read the code" message={error} retry={retry} />
          ) : (
            <p className="state" role="status">
              {building ? "Reading code relationships…" : "Loading code…"}
            </p>
          )}
        </div>
      </div>
    );
  const selectedNode = sel && sel.kind !== "file" ? nodeOf(idx, sel.id) : null;
  const endpoint = selectedNode?.type === "route" ? selectedNode.route : null;
  return (
    <div className="map code-exploration" ref={rootRef}>
      <StackBar graph={graph} building={building} />
      <div className="cx-toolbar">
        <button
          type="button"
          className="icon-btn"
          aria-label="Browse code"
          aria-pressed={navOpen}
          onClick={() => setNavOpen(!navOpen)}
        >
          {Icon.panel}
        </button>
        <button type="button" className="btn" onClick={overview}>
          Project overview
        </button>
        <h2>Understand this code</h2>
        {placed.length > 0 && (
          <>
            <button type="button" className="btn" onClick={() => window.history.back()}>
              Back
            </button>
            <button type="button" className="btn" onClick={() => setFit((n) => n + 1)}>
              Fit exploration
            </button>
          </>
        )}
        <button type="button" className="btn" onClick={() => setReaderOpen(!readerOpen)}>
          {readerOpen ? "Hide source" : "Show source"}
        </button>
      </div>
      <div className="cx-body">
        {navOpen && (
          <aside className="cx-navigation" aria-label="Code starting points">
            <label htmlFor="cx-search">Find code</label>
            <input
              id="cx-search"
              placeholder="Route, function, table or file…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query.trim() ? (
              <section>
                <h3>Search results</h3>
                {hits.length ? (
                  hits.map((h) => (
                    <button
                      type="button"
                      key={`${h.kind}:${h.id}`}
                      onClick={() => ctx.select({ kind: h.kind, id: h.id })}
                    >
                      <strong>{h.label}</strong>
                      <small>{h.detail}</small>
                    </button>
                  ))
                ) : (
                  <p className="cx-muted">No indexed matches. Try a shorter name.</p>
                )}
              </section>
            ) : (
              <>
                {ctx.session && (
                  <section>
                    <h3>Files edited in this session</h3>
                    {[...marks]
                      .filter(([, v]) => v.edited)
                      .slice(0, 50)
                      .map(([file]) => (
                        <button type="button" key={file} onClick={() => chooseFile(file)}>
                          <strong>{file}</strong>
                          <small>Recorded edit · inspect source or diff</small>
                        </button>
                      ))}
                    {![...marks.values()].some((v) => v.edited) && (
                      <p className="cx-muted">
                        No successful recorded edits at this point in the replay.
                      </p>
                    )}
                  </section>
                )}
                <section>
                  <h3>
                    HTTP entry points <span>{graph.routes?.length ?? 0}</span>
                  </h3>
                  {(graph.routes ?? []).slice(0, 50).map((r) => (
                    <button type="button" key={r.id} onClick={() => pick(r.id)}>
                      <strong>
                        {r.method} {r.path}
                      </strong>
                      <small>
                        {r.framework} ·{" "}
                        {r.pathResolved === false ? "prefix unresolved" : "declared in source"}
                      </small>
                    </button>
                  ))}
                  {!graph.routes?.length && (
                    <p className="cx-muted">
                      No supported literal routes found. Start with a function or file below.
                    </p>
                  )}
                </section>
                <section>
                  <h3>
                    Tables <span>{graph.tables?.length ?? 0}</span>
                  </h3>
                  {(graph.tables ?? []).slice(0, 50).map((t) => (
                    <button type="button" key={t.id} onClick={() => pick(t.id)}>
                      <strong>{t.name}</strong>
                      <small>
                        {t.source} · {t.columns.length} columns
                      </small>
                    </button>
                  ))}
                </section>
                <section>
                  <h3>Exported functions</h3>
                  {graph.symbols
                    .filter((s) => s.exported && s.kind !== "module" && s.kind !== "class")
                    .slice(0, 30)
                    .map((s) => (
                      <button type="button" key={s.id} onClick={() => pick(s.id)}>
                        <strong>{s.qualifiedName}</strong>
                        <small>{s.file}</small>
                      </button>
                    ))}
                </section>
                <section>
                  <h3>
                    Files <span>{allFiles.length}</span>
                  </h3>
                  {allFiles.slice(0, 30).map((f) => (
                    <button type="button" key={f.path} onClick={() => chooseFile(f.path)}>
                      <strong>{f.path}</strong>
                      <small>{f.language}</small>
                    </button>
                  ))}
                </section>
                <p className="cx-muted">
                  Lists show the first 30 functions/files or 50 routes/tables. Search indexed code
                  to find more.
                </p>
              </>
            )}
          </aside>
        )}
        <section className="cx-workspace" aria-label="Persistent code exploration">
          {overviewVisible ? (
            <div className="cx-overview">
              <h2>Start with a feature.</h2>
              <p>
                Choose an endpoint, function or table. Follow its connections and read the source
                while your exploration stays in place.
              </p>
              <div className="cx-overview-summary">
                <span>
                  <b>{graph.routes?.length ?? 0}</b> declared routes
                </span>
                <span>
                  <b>{graph.tables?.length ?? 0}</b> SQL tables
                </span>
                <span>
                  <b>{graph.symbols.filter((s) => s.kind !== "module").length}</b> indexed symbols
                </span>
              </div>
              <h3>Project structure</h3>
              {graph.stack.packages.length ? (
                graph.stack.packages.slice(0, 20).map((p) => (
                  <p key={p.path}>
                    <code>{p.path || "."}</code> · {p.name}
                  </p>
                ))
              ) : (
                <p>Browse files and functions in the navigation, or search for a name.</p>
              )}
              <p className="cx-muted">
                The map is built from current source. Static calls and possible matches are not a
                runtime trace or a guarantee of impact.
              </p>
            </div>
          ) : (
            <>
              <nav className="cx-trail" aria-label="Exploration trail">
                {trail.map((id) => (
                  <button
                    type="button"
                    key={id}
                    className={sel?.id === id ? "active" : ""}
                    onClick={() => (nodeOf(idx, id) ? pick(id) : chooseFile(id))}
                  >
                    {describeNode(idx, id)?.name ?? id}
                  </button>
                ))}
              </nav>
              <div className="cx-expansion">
                {sel?.kind === "file" && (
                  <small>File view starts with up to 12 functions. Search to add others.</small>
                )}
                {selectedNode &&
                  (["in", "out"] as const).map((direction) => {
                    const all = neighbours(idx, selectedNode.id, direction);
                    const hidden = all.filter((id) => !placed.some((p) => p.id === id)).length;
                    return (
                      <button
                        type="button"
                        className="btn"
                        key={direction}
                        disabled={!hidden || placed.length >= EXPLORATION_LIMIT}
                        onClick={() => expand(direction)}
                      >
                        {direction === "in" ? "Who uses this" : "What this uses"} · {hidden} more
                      </button>
                    );
                  })}
                <small>
                  {placed.length}/{EXPLORATION_LIMIT} nodes · reveal up to {EXPANSION_BATCH} at a
                  time
                </small>
              </div>
              <div className="cx-board">
                {placed.length ? (
                  <CodeCanvas
                    idx={idx}
                    placed={placed}
                    selected={sel?.id ?? null}
                    pick={pick}
                    flagsOf={flagsOf}
                    fitKey={`${ctx.projectId}:${placed[0]?.id}:${fit}`}
                  />
                ) : (
                  <EmptyState title="Read this file in the source panel">
                    No indexed symbols are available for this selection.
                  </EmptyState>
                )}
              </div>
              {endpoint && (!endpoint.handler || endpoint.pathResolved === false) && (
                <p className="cx-warning">
                  {!endpoint.handler ? "The handler could not be resolved. " : ""}
                  {endpoint.pathResolved === false
                    ? "This is the declared path; its mounted prefix is unresolved."
                    : ""}
                </p>
              )}
              <div className="cx-relations">
                <h3>
                  Connections in source <span>{edges.length}</span>
                </h3>
                {edges.slice(0, 80).map((e) => {
                  const outgoing = e.from === sel?.id;
                  const id = outgoing ? e.to : e.from;
                  const d = describeNode(idx, id);
                  return (
                    <button
                      type="button"
                      key={`${e.from}:${e.to}:${e.kind}:${e.access ?? ""}:${e.file ?? ""}:${e.line ?? ""}`}
                      onClick={() => {
                        setPlaced((p) => revealNodes(p, [id], sel?.id, outgoing ? 1 : -1));
                        pick(id);
                      }}
                    >
                      <span>
                        {e.certainty === "possible" ? "Possible: " : ""}
                        {outgoing
                          ? relationLabel(e)
                          : e.kind === "query"
                            ? `${e.access === "write" ? "written" : "read"} by`
                            : e.kind === "route"
                              ? "handler for"
                              : "called by"}{" "}
                        <strong>{d?.name ?? id}</strong>
                      </span>
                      <small>
                        {e.file ?? (outgoing ? target?.file : d?.file)}
                        {e.line ? `:${e.line}` : ""}
                      </small>
                    </button>
                  );
                })}
                {!edges.length && (
                  <p>
                    No resolved connections were found for this selection. Dynamic calls and
                    external libraries can be missing.
                  </p>
                )}
                {edges.length > 80 && (
                  <p>Showing 80 connections. Use the expansion controls to continue exploring.</p>
                )}
              </div>
              {!!relevantTests.length && (
                <section className="cx-tests">
                  <h3>Tests importing this file · not evidence of a test run</h3>
                  {[...new Set(relevantTests)].slice(0, 30).map((file) => (
                    <button
                      type="button"
                      className="btn"
                      key={file}
                      onClick={() => chooseFile(file)}
                    >
                      {file}
                    </button>
                  ))}
                </section>
              )}
            </>
          )}
        </section>
        {readerOpen && !overviewVisible && (
          <div className="cx-reader">
            {ctx.root && (
              <Reader
                root={ctx.root}
                target={target}
                editedLines={editedLines}
                calls={fileCalls}
                refreshKey={ctx.session?.toolCalls.length ?? 0}
                onClose={() => setReaderOpen(false)}
                onOpenCall={(id) =>
                  navigate(
                    paths.board(ctx.projectId, ctx.session?.id, {
                      lens: "agents",
                      selection: { kind: "tool", id },
                    }),
                  )
                }
              />
            )}
          </div>
        )}
      </div>
      <p className="cx-status" role="status">
        {notice ||
          (target
            ? `Reading ${target.title}. Source relationships are derived; file activity is recorded.`
            : "Choose a starting point. No session is needed to explore code.")}
      </p>
    </div>
  );
}
/**
 * Functions the session edited, found by locating each edit's new text in the file as it is now
 * (derived, not recorded). Reads each edited file once per change count; at most 24 files.
 */
function useEditedSymbols(
  root: string | null,
  calls: LensContext["calls"],
  idx: ReturnType<typeof indexGraph> | null,
) {
  const pieces = useMemo(() => {
    const byFile = new Map<string, { added: string[]; count: number }>();
    for (const c of calls) {
      const e = editOf(c);
      if (!e) continue;
      const cur = byFile.get(e.file) ?? { added: [], count: 0 };
      cur.added.push(...e.added);
      cur.count++;
      byFile.set(e.file, cur);
    }
    return byFile;
  }, [calls]);
  const [texts, setTexts] = useState<Map<string, string>>(new Map());
  const asked = useRef(new Map<string, number>());

  useEffect(() => {
    if (!root) return;
    let live = true;
    const files = [...pieces]
      .filter(([f, v]) => asked.current.get(f) !== v.count)
      .slice(0, MAX_EDIT_FILES);
    for (const [f, v] of files) asked.current.set(f, v.count);
    Promise.all(
      files.map(([f]) =>
        api
          .file(root, f)
          .then((r) => [f, r.content] as const)
          .catch(() => [f, null] as const),
      ),
    ).then((got) => {
      if (!live || !got.length) return;
      setTexts((cur) => {
        const next = new Map(cur);
        for (const [f, t] of got) if (t !== null) next.set(f, t);
        return next;
      });
    });
    return () => {
      live = false;
    };
  }, [root, pieces]);

  return useMemo(() => {
    const symbols = new Set<string>();
    const byFile = new Map<string, Set<string>>();
    if (idx) {
      for (const [file, v] of pieces) {
        const text = texts.get(file);
        const own = idx.byFile.get(file);
        if (!text || !own) continue;
        const found = editedSymbols(text, own, v.added);
        if (found.size) byFile.set(file, found);
        for (const id of found) symbols.add(id);
      }
    }
    return { symbols, byFile };
  }, [idx, pieces, texts]);
}
