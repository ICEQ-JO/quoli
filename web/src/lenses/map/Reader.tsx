import { useEffect, useMemo, useRef, useState } from "react";
import type { ToolCall } from "../../../../shared/model.ts";
import { api, useData } from "../../api.ts";
import { RecordedChange, UnifiedDiff } from "../../components/Diff.tsx";
import { ErrorState, Icon, Loading } from "../../components/ui.tsx";
import { CATEGORY, clock } from "../../format.ts";
import { highlight } from "./highlight.ts";

export const LINE_H = 20;

export interface ReaderTarget {
  file: string;
  /** What is shown above the code: a qualified name, or the file name. */
  title: string;
  kind: string;
  start: number | null;
  end: number | null;
}

interface Props {
  root: string;
  target: ReaderTarget | null;
  /** Line ranges of functions the agent edited in this file (derived). */
  editedLines: [number, number][];
  /** The session's tool calls on this file. */
  calls: ToolCall[];
  refreshKey: number;
  onClose: () => void;
  onOpenCall: (id: string) => void;
}

type Tab = "source" | "session" | "diff";

export const editorLink = (scheme: "vscode" | "cursor", root: string, file: string, line: number) =>
  `${scheme}://file/${encodeURI(`${root.replace(/\\/g, "/").replace(/\/$/, "")}/${file}`)}:${line}`;

export function Reader({
  root,
  target,
  editedLines,
  calls,
  refreshKey,
  onClose,
  onOpenCall,
}: Props) {
  const [tab, setTab] = useState<Tab>("source");
  const [copied, setCopied] = useState(false);
  const file = target?.file ?? null;
  const [data, reload, error] = useData(file && `read:${root}:${file}:${refreshKey}`, () =>
    api.file(root, file as string),
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new file starts on its source
  useEffect(() => setTab("source"), [file]);

  const edits = calls.filter((c) => c.category === "edit");
  const line = target?.start ?? 1;

  const copy = () => {
    if (!file) return;
    navigator.clipboard
      ?.writeText(file)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  return (
    <aside className="reader" aria-label="Code reader">
      <header className="rd-head">
        <div className="rd-title">
          <b className="mono" title={target?.title}>
            {target?.title ?? "Code"}
          </b>
          {target && <span className="rd-kind">{target.kind}</span>}
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close the reader"
          >
            {Icon.close}
          </button>
        </div>
        {target && (
          <p className="rd-path mono" title={target.file}>
            {target.file}
            {target.start ? `:${target.start}` : ""}
          </p>
        )}
        {target && (
          <div className="rd-actions">
            <a className="btn" href={editorLink("vscode", root, target.file, line)}>
              Open in VS Code
            </a>
            <a className="btn" href={editorLink("cursor", root, target.file, line)}>
              Open in Cursor
            </a>
            <button type="button" className="btn" onClick={copy}>
              {copied ? "Copied" : "Copy path"}
            </button>
          </div>
        )}
        {target && (
          <div className="tabs" role="tablist" aria-label="Reader views">
            {(
              [
                ["source", "Source", true],
                [
                  "session",
                  `Agent edits${edits.length ? ` (${edits.length})` : ""}`,
                  edits.length > 0,
                ],
                ["diff", "Git diff", Boolean(data?.diff)],
              ] as const
            ).map(([id, label, on]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "active" : ""}
                disabled={!on}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="rd-body">
        {!target ? (
          <p className="rd-empty">
            Select a function, route or file to read its code here. <kbd>o</kbd> opens it in your
            editor.
          </p>
        ) : tab === "session" ? (
          <div className="rd-scroll">
            {edits.map((c) => (
              <div key={c.id} className="call-card">
                <button type="button" className="call-line" onClick={() => onOpenCall(c.id)}>
                  <span className="cat" style={{ background: CATEGORY[c.category].color }} />
                  <span>{c.name}</span>
                  <span className="time">{clock(c.startedAt)}</span>
                  <span className={`st ${c.status}`}>{c.status}</span>
                </button>
                <RecordedChange call={c} />
              </div>
            ))}
          </div>
        ) : tab === "diff" && data?.diff ? (
          <div className="rd-scroll">
            <UnifiedDiff text={data.diff} />
          </div>
        ) : error && !data ? (
          <ErrorState title="Could not read this file" message={error} retry={reload} />
        ) : !data ? (
          <div className="pad">
            <Loading lines={8} />
          </div>
        ) : data.content === null ? (
          <p className="rd-empty">No preview: the file is binary, over 1 MB, or no longer there.</p>
        ) : (
          <Source
            key={`${data.path}`}
            text={data.content}
            path={data.path}
            range={target.start && target.end ? [target.start, target.end] : null}
            editedLines={editedLines}
          />
        )}
      </div>
    </aside>
  );
}

function Source({
  text,
  path,
  range,
  editedLines,
}: {
  text: string;
  path: string;
  range: [number, number] | null;
  editedLines: [number, number][];
}) {
  const lines = useMemo(() => highlight(text, path), [text, path]);
  const box = useRef<HTMLElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(600);
  const start = range?.[0] ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the range when the target changes
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setHeight(el.clientHeight);
    el.scrollTop = start ? Math.max(0, (start - 4) * LINE_H) : 0;
  }, [start, range?.[1], path]);

  const first = Math.max(0, Math.floor(top / LINE_H) - 10);
  const last = Math.min(lines.length, Math.ceil((top + height) / LINE_H) + 10);
  const width = String(lines.length).length;
  return (
    <section
      ref={box}
      className="rd-code"
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll region must be keyboard reachable
      tabIndex={0}
      aria-label={`Source of ${path}`}
    >
      <div style={{ height: lines.length * LINE_H, position: "relative" }}>
        {lines.slice(first, last).map((tokens, n) => {
          const no = first + n + 1;
          const inRange = range && no >= range[0] && no <= range[1];
          const edited = editedLines.some(([a, b]) => no >= a && no <= b);
          return (
            <div
              key={no}
              className={`rd-line ${inRange ? "in" : ""} ${edited ? "edited" : ""}`}
              style={{ top: (no - 1) * LINE_H }}
            >
              <span className="rd-no" style={{ width: `${width + 1}ch` }}>
                {no}
              </span>
              <span className="rd-text">
                {tokens.length === 0
                  ? " "
                  : tokens.map((t, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: tokens are positional
                      <span key={i} className={t.cls ? `tk-${t.cls}` : undefined}>
                        {t.text}
                      </span>
                    ))}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
