import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CodeSymbol } from "../../../../shared/model.ts";
import { Icon } from "../../components/ui.tsx";
import type { MapSelection } from "./graph.ts";
import { KindIcon } from "./KindIcon.tsx";
import { flatten, pathKeys, type TreeNode, type TreeRow } from "./tree.ts";

export type Mark = "edit" | "read";
export const ROW_H = 26;

interface Props {
  tree: TreeNode;
  byFile: Map<string, CodeSymbol[]>;
  selection: MapSelection | null;
  onSelect: (s: MapSelection) => void;
  fileMarks: Map<string, Mark>;
  folderMarks: Map<string, Mark>;
  /** Symbols the session edited, derived from edit text matched against the current file. */
  editedSymbols: Set<string>;
  hasSession: boolean;
  scope: "session" | "all";
  setScope: (s: "session" | "all") => void;
  filterRef: RefObject<HTMLInputElement | null>;
}

const markLabel = { edit: "edited by the agent", read: "read by the agent" } as const;

export function Explorer(p: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(400);
  const box = useRef<HTMLDivElement>(null);
  const only = useMemo(
    () => (p.scope === "session" ? new Set(p.fileMarks.keys()) : null),
    [p.scope, p.fileMarks],
  );

  const rows = useMemo(
    () => flatten(p.tree, { expanded, byFile: p.byFile, filter, only }),
    [p.tree, expanded, p.byFile, filter, only],
  );

  // Reveal the selection: open the folders and the file that hold it.
  const sel = p.selection;
  const selFile =
    sel?.kind === "file"
      ? sel.id
      : sel?.kind === "symbol"
        ? sel.id.slice(0, sel.id.lastIndexOf("#"))
        : null;
  useEffect(() => {
    if (!selFile) return;
    setExpanded((cur) => {
      const next = new Set(cur);
      for (const k of pathKeys(p.tree, selFile)) next.add(k);
      return next;
    });
  }, [selFile, p.tree]);

  const selKey =
    sel?.kind === "symbol" ? `s:${sel.id}` : sel?.kind === "file" ? `f:${sel.id}` : null;
  const at = (key: string | null) => (key ? rows.findIndex((r) => r.key === key) : -1);

  const reveal = useCallback((index: number) => {
    const el = box.current;
    if (!el || index < 0) return;
    const y = index * ROW_H;
    if (y < el.scrollTop) el.scrollTop = y;
    else if (y + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = y + ROW_H - el.clientHeight;
  }, []);

  // Scroll the selected row into view when it changes (rows are already expanded by then).
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the selection moves
  useEffect(() => {
    const i = at(selKey);
    if (i >= 0) {
      setActive(selKey);
      requestAnimationFrame(() => {
        const el = box.current;
        if (el) el.scrollTop = Math.max(0, i * ROW_H - el.clientHeight / 2);
      });
    }
  }, [selKey, rows.length === 0]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toggle = (row: TreeRow) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(row.key)) next.delete(row.key);
      else next.add(row.key);
      return next;
    });

  const choose = (row: TreeRow) => {
    setActive(row.key);
    if (row.kind === "symbol" && row.id) p.onSelect({ kind: "symbol", id: row.id });
    else if (row.kind === "file") {
      p.onSelect({ kind: "file", id: row.path });
      if (row.open === false) toggle(row);
    } else toggle(row);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey || !rows.length) return;
    const i = Math.max(0, at(active));
    const move = (to: number) => {
      const n = Math.min(rows.length - 1, Math.max(0, to));
      setActive(rows[n].key);
      reveal(n);
    };
    const row = rows[i];
    if (e.key === "ArrowDown" || e.key === "j") move(i + 1);
    else if (e.key === "ArrowUp" || e.key === "k") move(i - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(rows.length - 1);
    else if (e.key === "ArrowRight") {
      if (row.open === false) toggle(row);
      else if (row.open) move(i + 1);
    } else if (e.key === "ArrowLeft") {
      if (row.open && !filter) toggle(row);
      else {
        const parent = [...rows.slice(0, i)].reverse().find((r) => r.depth < row.depth);
        if (parent) move(rows.indexOf(parent));
      }
    } else if (e.key === "Enter") choose(row);
    else return;
    e.preventDefault();
  };

  const first = Math.max(0, Math.floor(top / ROW_H) - 8);
  const last = Math.min(rows.length, Math.ceil((top + height) / ROW_H) + 8);
  const visible = rows.slice(first, last);

  return (
    <div className="explorer">
      <div className="ex-tools">
        <label className="ex-filter">
          {Icon.search}
          <input
            ref={p.filterRef}
            value={filter}
            placeholder="Filter files and functions"
            aria-label="Filter files and functions"
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && filter) {
                e.stopPropagation();
                setFilter("");
              }
              if (e.key === "ArrowDown" || e.key === "Enter") {
                e.preventDefault();
                box.current?.focus();
              }
            }}
          />
          <kbd>/</kbd>
        </label>
        <fieldset className="segmented ex-scope">
          <legend className="sr-only">Which files</legend>
          <button
            type="button"
            aria-pressed={p.scope === "session"}
            className={p.scope === "session" ? "active" : ""}
            disabled={!p.hasSession}
            title={p.hasSession ? "Only files this session touched" : "Open a session to use this"}
            onClick={() => p.setScope("session")}
          >
            This session
          </button>
          <button
            type="button"
            aria-pressed={p.scope === "all"}
            className={p.scope === "all" ? "active" : ""}
            onClick={() => p.setScope("all")}
          >
            Whole codebase
          </button>
        </fieldset>
      </div>
      <div
        ref={box}
        className="ex-tree"
        role="tree"
        aria-label="Code explorer"
        aria-activedescendant={active ? `ex-${active}` : undefined}
        tabIndex={0}
        onScroll={(e) => setTop(e.currentTarget.scrollTop)}
        onKeyDown={onKey}
      >
        <div style={{ height: rows.length * ROW_H, position: "relative" }}>
          {visible.map((row, n) => {
            const i = first + n;
            const mark =
              row.kind === "symbol"
                ? p.editedSymbols.has(row.id as string)
                  ? "edit"
                  : null
                : row.kind === "file"
                  ? (p.fileMarks.get(row.path) ?? null)
                  : (p.folderMarks.get(row.path) ?? null);
            const selected = row.key === selKey;
            return (
              <div
                key={row.key}
                id={`ex-${row.key}`}
                role="treeitem"
                tabIndex={-1}
                aria-selected={selected}
                aria-level={row.depth + 1}
                aria-expanded={row.open ?? undefined}
                className={`ex-row ${row.kind} ${selected ? "selected" : ""} ${active === row.key ? "active" : ""}`}
                style={{ top: i * ROW_H, paddingLeft: 8 + row.depth * 14 }}
                title={
                  row.kind === "symbol" ? `${row.label} · ${row.symbolKind}` : row.path || row.label
                }
                onClick={() => choose(row)}
                onKeyDown={undefined}
              >
                <span className={`ex-twist ${row.open === null ? "none" : ""}`} aria-hidden="true">
                  {row.open === null ? "" : row.open ? "▾" : "▸"}
                </span>
                <KindIcon
                  kind={row.kind === "symbol" ? (row.symbolKind ?? "function") : row.kind}
                />
                <span className="ex-label">{row.label}</span>
                {row.kind !== "symbol" && row.count > 0 && row.kind !== "file" && (
                  <span className="ex-count">{row.count}</span>
                )}
                {mark && (
                  <span
                    className={`ex-dot ${mark}`}
                    role="img"
                    aria-label={
                      row.kind === "symbol"
                        ? "edited by the agent (derived from the edit text)"
                        : markLabel[mark]
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
        {rows.length === 0 && (
          <p className="ex-empty">
            {filter
              ? `Nothing matches “${filter}”.`
              : p.scope === "session"
                ? "This session touched no files that have code in the map."
                : "No files."}
          </p>
        )}
      </div>
    </div>
  );
}
