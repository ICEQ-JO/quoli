import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTypingTarget, modalOpen } from "../a11y.ts";
import { api } from "../api.ts";
import { EmptyState, ErrorState, Icon } from "../components/ui.tsx";
import { plural } from "../format.ts";
import type { LensContext, Selection } from "../state.ts";
import { Explorer, type Mark } from "./map/Explorer.tsx";
import { editedSymbols, editOf } from "./map/edits.ts";
import { FocusCanvas, type NodeFlags } from "./map/FocusCanvas.tsx";
import {
  defaultFocus,
  fileOfNode,
  focusColumns,
  focusOf,
  indexGraph,
  type MapSelection,
  nodeOf,
} from "./map/graph.ts";
import { editorLink, Reader, type ReaderTarget } from "./map/Reader.tsx";
import { StackBar } from "./map/StackBar.tsx";
import { buildTree } from "./map/tree.ts";
import "./map/map.css";

const NARROW = 1100;
const PHONE = 700;
const MAX_EDIT_FILES = 24;
const MAP_KINDS = ["symbol", "file", "route", "table"] as const;

/** The part of a shared selection the map can show, or null. */
export function mapSelection(s: Selection): MapSelection | null {
  return s && (MAP_KINDS as readonly string[]).includes(s.kind) ? (s as MapSelection) : null;
}

export function MapLens(ctx: LensContext) {
  const { codeGraph, touched, session, selection, select, root, code } = ctx;
  const { graph } = codeGraph;
  const sel = mapSelection(selection);

  const idx = useMemo(() => (graph ? indexGraph(graph) : null), [graph]);
  const tree = useMemo(() => (graph ? buildTree(graph) : null), [graph]);
  const [depth, setDepth] = useState(2);
  const [scopePick, setScopePick] = useState<"session" | "all" | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const hasTouches = touched.size > 0;
  const scope = scopePick ?? (session && hasTouches ? "session" : "all");

  // Panes: auto layout from the width of the lens, overridden by the user's own toggles.
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1400);
  const [treePick, setTreePick] = useState<boolean | null>(null);
  const [readerPick, setReaderPick] = useState<boolean | null>(null);
  const [treeW, setTreeW] = useState(292);
  const [readerW, setReaderW] = useState(440);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    setWidth(el.clientWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = width < NARROW;
  const phone = width < PHONE;
  const treeOpen = treePick ?? !phone;
  const readerOpen = readerPick ?? !narrow;

  /* ---------- what the agent did ---------- */
  const fileMarks = useMemo(() => {
    const m = new Map<string, Mark>();
    for (const [path, t] of touched) m.set(path, t.edited > 0 ? "edit" : "read");
    return m;
  }, [touched]);
  const folderMarks = useMemo(() => {
    const m = new Map<string, Mark>();
    for (const [path, mark] of fileMarks) {
      for (let at = path.lastIndexOf("/"); at > 0; at = path.lastIndexOf("/", at - 1)) {
        const dir = path.slice(0, at);
        if (mark === "edit" || !m.has(dir)) m.set(dir, mark);
      }
    }
    return m;
  }, [fileMarks]);

  const edits = useEditedSymbols(root, ctx.calls, idx);

  const status = useMemo(() => new Map(code?.files.map((f) => [f.path, f.status]) ?? []), [code]);
  const flagsOf = useCallback(
    (id: string, file: string): NodeFlags => {
      const mark = fileMarks.get(file);
      const fileEdit = mark === "edit";
      const symbolMapped = edits.byFile.get(file)?.size;
      const edited = edits.symbols.has(id) || (fileEdit && !symbolMapped);
      const st = status.get(file);
      return {
        edited,
        read: mark === "read" || (fileEdit && !edited),
        isNew: fileEdit && (st === "untracked" || st === "added"),
      };
    },
    [fileMarks, edits, status],
  );

  /* ---------- focus ---------- */
  const view = useMemo(() => {
    if (!idx) return null;
    let ids: string[];
    let why: "selected" | "changed" | "entry";
    if (sel) {
      ids = focusOf(idx, sel);
      why = "selected";
    } else {
      const changed = [...edits.symbols];
      // A file edited with no symbol found (or written whole) still contributes its busiest functions.
      for (const [path, mark] of fileMarks)
        if (mark === "edit" && !edits.byFile.get(path)?.size)
          changed.push(...focusOf(idx, { kind: "file", id: path }));
      const d = defaultFocus(idx, changed);
      ids = d.ids;
      why = d.why;
    }
    return { focus: focusColumns(idx, ids, depth), ids, why };
  }, [idx, sel, depth, edits, fileMarks]);

  /* ---------- reader ---------- */
  const target = useMemo<ReaderTarget | null>(() => {
    if (!idx || !sel) return null;
    if (sel.kind === "file") {
      return {
        file: sel.id,
        title: sel.id.slice(sel.id.lastIndexOf("/") + 1),
        kind: "file",
        start: null,
        end: null,
      };
    }
    const n = nodeOf(idx, sel.id);
    if (!n) return null;
    if (n.type === "symbol")
      return {
        file: n.symbol.file,
        title: n.symbol.qualifiedName,
        kind: n.symbol.kind,
        start: n.symbol.startLine,
        end: n.symbol.endLine,
      };
    if (n.type === "route")
      return {
        file: n.route.file,
        title: `${n.route.method} ${n.route.path}`,
        kind: "route",
        start: n.route.line,
        end: n.route.line,
      };
    return {
      file: n.table.file,
      title: n.table.name,
      kind: "table",
      start: n.table.line,
      end: n.table.line,
    };
  }, [idx, sel]);

  const editedLines = useMemo(
    () =>
      target && idx
        ? [...(edits.byFile.get(target.file) ?? [])].flatMap((id) => {
            const s = idx.symbols.get(id);
            return s ? [[s.startLine, s.endLine] as [number, number]] : [];
          })
        : [],
    [target, idx, edits],
  );
  const fileCalls = useMemo(
    () => (target ? ctx.calls.filter((c) => c.files.includes(target.file)) : []),
    [target, ctx.calls],
  );

  const pick = useCallback(
    (id: string) => {
      if (!idx) return;
      const n = nodeOf(idx, id);
      if (n) select({ kind: n.type, id });
      if (phone) setTreePick(false);
      if (!narrow) setReaderPick(null);
    },
    [idx, select, phone, narrow],
  );

  /* ---------- keyboard ---------- */
  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        isTypingTarget(e.target as HTMLElement) ||
        modalOpen()
      )
        return;
      if (e.key === "[") setDepth((d) => Math.max(1, d - 1));
      else if (e.key === "]") setDepth((d) => Math.min(3, d + 1));
      else if (e.key === "/") {
        e.preventDefault();
        setTreePick(true);
        requestAnimationFrame(() => filterRef.current?.focus());
      } else if (e.key === "o" && targetRef.current && root) {
        const t = targetRef.current;
        window.location.href = editorLink("vscode", root, t.file, t.start ?? 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [root]);

  /* ---------- states without a graph ---------- */
  if (!graph || !idx || !tree || !view) {
    return (
      <div className="map" ref={rootRef}>
        <StackBar graph={null} building={codeGraph.building} />
        <div className="map-state">
          {codeGraph.error ? (
            <ErrorState
              title="Could not read the code"
              message={codeGraph.error}
              retry={codeGraph.retry}
            />
          ) : (
            <p className="state" role="status">
              {codeGraph.building ? "Building the code map…" : "Loading the code map…"}
            </p>
          )}
        </div>
      </div>
    );
  }
  if (graph.symbols.length === 0) {
    return (
      <div className="map" ref={rootRef}>
        <StackBar graph={graph} building={false} />
        <div className="map-state">
          <EmptyState title="No functions found">
            <span>
              Quoli reads TypeScript, JavaScript, Python and Go. This project has none of those
              source files in its tracked files.
            </span>
          </EmptyState>
        </div>
      </div>
    );
  }

  const title =
    view.why === "selected"
      ? (target?.title ?? "Selection")
      : view.why === "changed"
        ? `Changed in this session · ${plural(view.ids.length, "function")}`
        : `Busiest entry points · ${plural(view.ids.length, "starting point")}`;
  const lonely = view.focus.columns.every(
    (c, i) => i === view.focus.centerColumn || c.length === 0,
  );

  return (
    <div
      className="map"
      ref={rootRef}
      data-narrow={narrow || undefined}
      data-phone={phone || undefined}
    >
      <StackBar graph={graph} building={codeGraph.building} />
      <div className="map-body">
        {treeOpen && (
          <>
            <div className="map-tree" style={{ width: phone ? "min(86%, 340px)" : treeW }}>
              <Explorer
                tree={tree}
                byFile={idx.byFile}
                selection={sel}
                onSelect={(s) => {
                  select(s);
                  if (phone) setTreePick(false);
                }}
                fileMarks={fileMarks}
                folderMarks={folderMarks}
                editedSymbols={edits.symbols}
                hasSession={Boolean(session)}
                scope={scope}
                setScope={setScopePick}
                filterRef={filterRef}
              />
            </div>
            {!phone && (
              <Splitter
                label="Resize the explorer"
                value={treeW}
                set={setTreeW}
                min={220}
                max={520}
                dir={1}
              />
            )}
          </>
        )}
        <section className="map-canvas" aria-label="Focus graph">
          <div className="map-bar">
            <button
              type="button"
              className={`icon-btn ${treeOpen ? "on" : ""}`}
              aria-pressed={treeOpen}
              aria-label="Explorer"
              title={treeOpen ? "Hide the explorer" : "Show the explorer"}
              onClick={() => setTreePick(!treeOpen)}
            >
              {Icon.panel}
            </button>
            <div className="map-title">
              <b className="mono" title={title}>
                {title}
              </b>
              {view.focus.hidden > 0 && (
                <span className="faint"> · {view.focus.hidden} more not drawn</span>
              )}
              {view.why !== "selected" && (
                <span className="faint"> · pick a function to follow its calls</span>
              )}
            </div>
            <fieldset className="segmented">
              <legend className="sr-only">Hops shown</legend>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={depth === n}
                  className={depth === n ? "active" : ""}
                  title={`${plural(n, "hop")} each way ([ and ] change it)`}
                  onClick={() => setDepth(n)}
                >
                  {n} {n === 1 ? "hop" : "hops"}
                </button>
              ))}
            </fieldset>
            <button
              type="button"
              className={`icon-btn ${readerOpen ? "on" : ""}`}
              aria-pressed={readerOpen}
              aria-label="Code reader"
              title={readerOpen ? "Hide the code reader" : "Show the code reader"}
              onClick={() => setReaderPick(!readerOpen)}
            >
              {Icon.inspector}
            </button>
          </div>
          <div className="map-board">
            <FocusCanvas
              idx={idx}
              focus={view.focus}
              flagsOf={flagsOf}
              selectedId={sel && sel.kind !== "file" ? sel.id : null}
              fitKey={`${ctx.projectId}:${view.ids.join("|")}:${depth}:${graph.generatedAt}`}
              onPick={pick}
              onClear={() => select(null)}
              empty={
                view.ids.length === 0
                  ? sel
                    ? "Nothing to draw for this selection. Pick a function in the explorer."
                    : "No calls between functions were found. Pick a function in the explorer."
                  : null
              }
            />
            {lonely && view.ids.length > 0 && (
              <p className="map-note">
                No calls to or from {view.ids.length === 1 ? "this" : "these"} were found in the
                code Quoli can resolve. Calls into libraries and dynamic calls are not drawn.
              </p>
            )}
          </div>
        </section>
        {readerOpen && (
          <>
            {!narrow && (
              <Splitter
                label="Resize the code reader"
                value={readerW}
                set={setReaderW}
                min={320}
                max={760}
                dir={-1}
              />
            )}
            <div className="map-reader" style={{ width: narrow ? "min(100%, 480px)" : readerW }}>
              {root && (
                <Reader
                  root={root}
                  target={target}
                  editedLines={editedLines}
                  calls={fileCalls}
                  refreshKey={session?.toolCalls.length ?? 0}
                  onClose={() => setReaderPick(false)}
                  onOpenCall={(id) => select({ kind: "tool", id })}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** A draggable and keyboard-adjustable divider between two panes. */
function Splitter({
  label,
  value,
  set,
  min,
  max,
  dir,
}: {
  label: string;
  value: number;
  set: (n: number) => void;
  min: number;
  max: number;
  dir: 1 | -1;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> cannot take focus or a value
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        const from = e.clientX;
        const start = value;
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const move = (m: PointerEvent) => set(clamp(start + (m.clientX - from) * dir));
        const up = () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") set(clamp(value - 16 * dir));
        else if (e.key === "ArrowRight") set(clamp(value + 16 * dir));
        else return;
        e.preventDefault();
      }}
    />
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
