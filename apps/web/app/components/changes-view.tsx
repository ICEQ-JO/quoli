"use client";

import type {
  ChangeDetail,
  ChangeList,
  ComparisonQuery,
  DiffLine,
} from "@traceframe/schema/changes";
import type { SnapshotPage, SnapshotSummary } from "@traceframe/schema/repository";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui-icon";

type Selection = { before: string; after: string; file: string };
type Props = {
  project: string;
  session: string;
  refresh: number;
  selection: Selection;
  onSelection: (selection: Selection, replace?: boolean) => void;
  onEvidence: (id: string) => void;
};
async function compare<T>(
  project: string,
  session: string,
  query: Partial<ComparisonQuery>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new DOMException("Superseded comparison", "AbortError");
  // Let the small bounded POST body finish even when navigation supersedes it.
  // Aborting during upload causes Next's request adapter to report body-stream errors.
  const response = await fetch("/api/changes", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, session, query }),
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json();
  if (signal?.aborted) throw new DOMException("Superseded comparison", "AbortError");
  if (!response.ok) throw new Error(data.error ?? "Captured versions could not be compared.");
  return data;
}
function captureLabel(snapshot: SnapshotSummary) {
  return `${snapshot.reason === "baseline" ? "Baseline" : "Checkpoint"} · ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(snapshot.capturedAt))} UTC`;
}
function DiffTable({ lines, split }: { lines: DiffLine[]; split: boolean }) {
  const content = (line: DiffLine) => (
    <>
      <code>{line.text.endsWith("\n") ? line.text.slice(0, -1) : line.text}</code>
      {!line.text.endsWith("\n") && <span className="newline-note">No newline at end of file</span>}
    </>
  );
  return (
    <section
      className="diff-scroll"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll wide captured code.
      tabIndex={0}
      aria-label={split ? "Side-by-side code diff" : "Unified code diff"}
    >
      <table className={`diff-table ${split ? "split" : "unified"}`}>
        <caption className="sr-only">Derived line changes between captured versions</caption>
        <thead>
          {split ? (
            <tr>
              <th colSpan={2}>Before</th>
              <th colSpan={2}>After</th>
            </tr>
          ) : (
            <tr>
              <th>Before</th>
              <th>After</th>
              <th className="sr-only">Change</th>
              <th>Captured code</th>
            </tr>
          )}
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr
              key={`${line.kind}-${line.beforeLine}-${line.afterLine}`}
              className={`diff-line ${line.kind}`}
            >
              {split ? (
                <>
                  <td className="line-number">{line.beforeLine ?? ""}</td>
                  <td className={`code-cell ${line.kind === "add" ? "absent-cell" : ""}`}>
                    {line.kind !== "add" && content(line)}
                  </td>
                  <td className="line-number">{line.afterLine ?? ""}</td>
                  <td className={`code-cell ${line.kind === "delete" ? "absent-cell" : ""}`}>
                    {line.kind !== "delete" && content(line)}
                  </td>
                </>
              ) : (
                <>
                  <td className="line-number">{line.beforeLine ?? ""}</td>
                  <td className="line-number">{line.afterLine ?? ""}</td>
                  <td className="diff-sign">
                    {line.kind === "add" ? "+" : line.kind === "delete" ? "−" : ""}
                  </td>
                  <td className="code-cell">{content(line)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
export function ChangesView({
  project,
  session,
  refresh,
  selection,
  onSelection,
  onEvidence,
}: Props) {
  const [snapshots, setSnapshots] = useState<SnapshotPage>({
    snapshots: [],
    total: 0,
    nextCursor: null,
  });
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [list, setList] = useState<ChangeList | null>(null);
  const [detail, setDetail] = useState<ChangeDetail | null>(null);
  const [loading, setLoading] = useState(false),
    [detailLoading, setDetailLoading] = useState(false),
    [busy, setBusy] = useState("");
  const [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [status, setStatus] = useState<ComparisonQuery["status"]>("changed");
  const [split, setSplit] = useState(false);
  const pairEpoch = useRef(0),
    detailEpoch = useRef(0),
    selectRef = useRef(onSelection),
    selectionRef = useRef(selection),
    focusDetail = useRef(false),
    detailHeading = useRef<HTMLHeadingElement>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const { before, after, file } = selection;
  const selectedFile = file || list?.files[0]?.id || "";
  useEffect(() => {
    selectRef.current = onSelection;
    selectionRef.current = selection;
  }, [onSelection, selection]);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 180);
    return () => clearTimeout(timer);
  }, [search]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh/retry explicitly reload immutable capture metadata.
  useEffect(() => {
    const abort = new AbortController();
    setSnapshotLoading(true);
    setError("");
    setSnapshots({ snapshots: [], total: 0, nextCursor: null });
    fetch(
      `/api/data?${new URLSearchParams({ resource: "snapshots", project, session, order: "latest" })}`,
      { cache: "no-store", signal: abort.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Capture list unavailable.");
        return data as SnapshotPage;
      })
      .then((data) => {
        setSnapshots(data);
        const current = selectionRef.current;
        if (!current.after && data.snapshots.length) {
          const latest = data.snapshots[0];
          const baseline = data.snapshots.find(
            (snapshot) => snapshot.reason === "baseline" && snapshot.id !== latest.id,
          );
          selectRef.current({ before: baseline?.id ?? "", after: latest.id, file: "" }, true);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setSnapshotLoading(false);
      });
    return () => abort.abort();
  }, [project, session, refresh, retry]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry/refresh reload the selected pair.
  useEffect(() => {
    const abort = new AbortController(),
      epoch = ++pairEpoch.current;
    setList(null);
    setError("");
    setBusy("");
    if (!after) {
      setLoading(false);
      return () => abort.abort();
    }
    if (before === after) {
      setError("Choose two different captures.");
      setLoading(false);
      return () => abort.abort();
    }
    setLoading(true);
    compare<ChangeList>(
      project,
      session,
      { beforeId: before || null, afterId: after, search: debounced, status, cursor: 0, limit: 50 },
      abort.signal,
    )
      .then((data) => {
        if (epoch === pairEpoch.current) setList(data);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (epoch === pairEpoch.current) setLoading(false);
      });
    return () => abort.abort();
  }, [project, session, before, after, debounced, status, retry, refresh]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry/refresh reload selected file evidence.
  useEffect(() => {
    const abort = new AbortController(),
      epoch = ++detailEpoch.current;
    setDetail(null);
    if (!selectedFile || !after) {
      setDetailLoading(false);
      return () => abort.abort();
    }
    setDetailLoading(true);
    compare<ChangeDetail>(
      project,
      session,
      { beforeId: before || null, afterId: after, fileId: selectedFile, cursor: 0, limit: 100 },
      abort.signal,
    )
      .then((data) => {
        if (epoch === detailEpoch.current) setDetail(data);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (epoch === detailEpoch.current) setDetailLoading(false);
      });
    return () => abort.abort();
  }, [project, session, before, after, selectedFile, retry, refresh]);
  useEffect(() => {
    if (detail && focusDetail.current && window.matchMedia("(max-width: 799px)").matches) {
      focusDetail.current = false;
      detailHeading.current?.focus();
      detailHeading.current?.scrollIntoView({ block: "start" });
    }
  }, [detail]);
  function chooseFile(id: string) {
    focusDetail.current = true;
    onSelection({ before, after, file: id });
  }
  async function more(kind: "files" | "lines" | "captures") {
    if (busy) return;
    setBusy(kind);
    const pair = pairEpoch.current,
      activeDetail = detailEpoch.current;
    try {
      if (kind === "captures" && snapshots.nextCursor !== null) {
        const response = await fetch(
          `/api/data?${new URLSearchParams({ resource: "snapshots", project, session, order: "latest", cursor: String(snapshots.nextCursor) })}`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as SnapshotPage & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Capture list unavailable.");
        if (pair === pairEpoch.current)
          setSnapshots((old) => ({ ...data, snapshots: [...old.snapshots, ...data.snapshots] }));
      } else if (kind === "files" && list?.nextCursor !== null && list?.nextCursor !== undefined) {
        const data = await compare<ChangeList>(project, session, {
          beforeId: before || null,
          afterId: after,
          search: debounced,
          status,
          cursor: list.nextCursor,
          limit: 50,
        });
        if (pair === pairEpoch.current)
          setList((old) => (old ? { ...data, files: [...old.files, ...data.files] } : data));
      } else if (
        kind === "lines" &&
        detail?.diff.nextCursor !== null &&
        detail?.diff.nextCursor !== undefined
      ) {
        const data = await compare<ChangeDetail>(project, session, {
          beforeId: before || null,
          afterId: after,
          fileId: selectedFile,
          cursor: detail.diff.nextCursor,
          limit: 100,
        });
        if (activeDetail === detailEpoch.current)
          setDetail((old) =>
            old
              ? { ...data, diff: { ...data.diff, lines: [...old.diff.lines, ...data.diff.lines] } }
              : data,
          );
      }
    } catch (e) {
      if (pair === pairEpoch.current) setError((e as Error).message);
    } finally {
      if (pair === pairEpoch.current) setBusy("");
    }
  }
  const sources = detail ?? list;
  return (
    <section className="changes-view" aria-label="Captured file changes">
      <div className="changes-intro">
        <div>
          <h2>Captured changes</h2>
          <p>Compare recorded versions. Follow the evidence behind each change.</p>
        </div>
        <span className="basis derived">Derived · snapshot comparison</span>
      </div>
      {error && (
        <div className="error-notice" role="alert">
          <Icon name="alert" />
          <div>
            <strong>Comparison unavailable</strong>
            <p>{error}</p>
          </div>
          <button className="button" type="button" onClick={() => setRetry((v) => v + 1)}>
            Retry comparison
          </button>
        </div>
      )}
      {snapshotLoading && !snapshots.snapshots.length ? (
        <div className="view-loading" role="status">
          Loading captured versions…
          <div className="skeleton-line" />
        </div>
      ) : !snapshots.total && !after ? (
        <div className="capture-empty">
          <Icon name="branch" size={32} />
          <h3>No captured versions in this session</h3>
          <p>
            Tool paths are references, not captured diffs. Register a repository and capture a
            baseline and checkpoint to inspect what changed.
          </p>
          <code>pnpm repository snapshot PROJECT_ID --session REVIEW_ID</code>
          <p>No before-state is reconstructed from HEAD.</p>
        </div>
      ) : (
        <>
          <div className="capture-selectors">
            <label>
              Before
              <select
                aria-label="Before capture"
                value={before}
                onChange={(e) => onSelection({ before: e.target.value, after, file: "" })}
              >
                <option value="">No baseline selected</option>
                {before && !snapshots.snapshots.some((s) => s.id === before) && (
                  <option value={before}>Selected capture · {before}</option>
                )}
                {snapshots.snapshots.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.id === after}>
                    {captureLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <Icon name="arrow-right" size={18} />
            <label>
              After
              <select
                aria-label="After capture"
                value={after}
                onChange={(e) => onSelection({ before, after: e.target.value, file: "" })}
              >
                {after && !snapshots.snapshots.some((s) => s.id === after) && (
                  <option value={after}>Selected capture · {after}</option>
                )}
                {snapshots.snapshots.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.id === before}>
                    {captureLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <div className="capture-count">
              <span>
                {snapshots.snapshots.length} of {snapshots.total} captures loaded
              </span>
              {snapshots.nextCursor !== null && snapshots.snapshots.length < 200 && (
                <button
                  type="button"
                  className="text-button"
                  disabled={Boolean(busy)}
                  onClick={() => void more("captures")}
                >
                  {busy === "captures" ? "Loading…" : "Load older captures"}
                </button>
              )}
              {snapshots.snapshots.length >= 200 && snapshots.nextCursor !== null && (
                <span>Chooser limited to 200 captures.</span>
              )}
            </div>
          </div>
          {sources && (
            <div className="comparison-context">
              <Icon name="info" size={16} />
              <p>
                {!sources.before
                  ? "Before capture unavailable. Changes cannot be established from one observed version."
                  : sources.baselineDirty === true
                    ? "The before capture was already dirty. This comparison isolates differences between the selected captures."
                    : sources.baselineDirty === null
                      ? "Dirty state of the before capture is unknown."
                      : "The before capture reported no raw-byte working-tree differences."}{" "}
                <span>Repository observations do not establish exclusive agent authorship.</span>
              </p>
            </div>
          )}
          <div className="changes-layout">
            <section className="changed-files" aria-label="Files in captured comparison">
              <div className="file-list-toolbar">
                <div className="search-field">
                  <Icon name="search" size={16} />
                  <input
                    aria-label="Search captured paths"
                    placeholder="Find a file…"
                    maxLength={200}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      if (file) onSelection({ before, after, file: "" });
                    }}
                  />
                </div>
                <select
                  aria-label="File change filter"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as ComparisonQuery["status"]);
                    if (file) onSelection({ before, after, file: "" });
                  }}
                >
                  <option value="changed">Changed + unknown</option>
                  <option value="all">All captured paths</option>
                  <option value="unavailable">Unavailable comparisons</option>
                </select>
              </div>
              <div className="file-list-heading">
                <strong>Captured paths</strong>
                <span>{loading ? "Loading…" : `${list?.total ?? 0} results`}</span>
              </div>
              <div className="file-change-list" aria-busy={loading}>
                {loading ? (
                  <div className="file-loading" role="status">
                    Comparing versions…
                    <div className="skeleton-line" />
                    <div className="skeleton-line" />
                  </div>
                ) : list?.files.length ? (
                  list.files.map((item, index) => (
                    <button
                      type="button"
                      key={item.id}
                      ref={(node) => {
                        if (node) rows.current.set(item.id, node);
                        else rows.current.delete(item.id);
                      }}
                      className={`changed-file ${selectedFile === item.id ? "selected" : ""}`}
                      aria-pressed={selectedFile === item.id}
                      onClick={() => chooseFile(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                          event.preventDefault();
                          const next = list.files[index + (event.key === "ArrowDown" ? 1 : -1)];
                          if (next) {
                            rows.current.get(next.id)?.focus();
                            onSelection({ before, after, file: next.id });
                          }
                        }
                      }}
                    >
                      <Icon name="file" size={16} />
                      <span>
                        <strong>{item.path}</strong>
                        <small>
                          {item.beforePath ? `from ${item.beforePath} · ` : ""}
                          {item.status === "renamed"
                            ? "Rename inferred"
                            : item.status === "unavailable"
                              ? "Comparison unavailable"
                              : item.status}
                        </small>
                      </span>
                      <span className={`change-letter ${item.status}`} aria-hidden="true">
                        {item.status === "modified"
                          ? "M"
                          : item.status === "added"
                            ? "A"
                            : item.status === "deleted"
                              ? "D"
                              : item.status === "renamed"
                                ? "R"
                                : item.status === "unavailable"
                                  ? "?"
                                  : "="}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="file-list-empty">
                    <Icon name="search" size={22} />
                    <h3>No matching paths</h3>
                    <p>
                      {search || status !== "changed"
                        ? "Try another path or filter."
                        : "No changed paths were established in this captured pair."}
                    </p>
                    {(search || status !== "changed") && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setSearch("");
                          setStatus("changed");
                        }}
                      >
                        Clear path filters
                      </button>
                    )}
                  </div>
                )}
              </div>
              {list && (
                <div className="file-list-footer">
                  <span>
                    {list.files.length} of {list.total} shown
                  </span>
                  {list.nextCursor !== null && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={Boolean(busy)}
                      onClick={() => void more("files")}
                    >
                      {busy === "files" ? "Loading…" : "More files"}
                    </button>
                  )}
                </div>
              )}
            </section>
            <section className="file-diff-panel" aria-label="Captured code inspection">
              {detailLoading ? (
                <div className="file-loading" role="status">
                  Loading captured code…
                  <div className="skeleton-line" />
                  <div className="skeleton-line" />
                </div>
              ) : detail ? (
                <>
                  <div className="file-diff-heading">
                    <div>
                      <h3 ref={detailHeading} tabIndex={-1}>
                        {detail.change.path}
                      </h3>
                      <p>
                        {detail.change.beforePath && (
                          <span>Previously {detail.change.beforePath} · </span>
                        )}
                        {detail.change.status === "renamed"
                          ? "Rename inferred from captured content"
                          : detail.change.status === "unavailable"
                            ? "Change unavailable"
                            : detail.change.status}
                        <span className={`basis ${detail.change.basis}`}>
                          {detail.change.basis}
                        </span>
                      </p>
                    </div>
                    {detail.diff.state === "available" && (
                      <div className="diff-counts">
                        <span>+{detail.diff.additions}</span>
                        <span>−{detail.diff.deletions}</span>
                        <small>lines</small>
                      </div>
                    )}
                  </div>
                  <div className="diff-toolbar">
                    <fieldset className="diff-mode">
                      <legend className="sr-only">Code diff layout</legend>
                      <button type="button" aria-pressed={!split} onClick={() => setSplit(false)}>
                        Unified
                      </button>
                      <button type="button" aria-pressed={split} onClick={() => setSplit(true)}>
                        Side by side
                      </button>
                    </fieldset>
                    <div className="capture-source-links">
                      {detail.before && (
                        <button
                          type="button"
                          onClick={() => onEvidence(detail.before?.eventId ?? "")}
                        >
                          <Icon name="link" size={13} />
                          Before observation
                        </button>
                      )}
                      <button type="button" onClick={() => onEvidence(detail.after.eventId)}>
                        <Icon name="link" size={13} />
                        After observation
                      </button>
                    </div>
                  </div>
                  {detail.change.uncertainty && (
                    <div className="diff-uncertainty">
                      <Icon name="info" size={15} />
                      <p>{detail.change.uncertainty}</p>
                    </div>
                  )}
                  {detail.diff.state === "available" ? (
                    detail.diff.lines.length ? (
                      <>
                        <DiffTable lines={detail.diff.lines} split={split} />
                        <div className="diff-pagination">
                          <span>
                            {detail.diff.lines.length} of {detail.diff.total} diff lines
                          </span>
                          {detail.diff.nextCursor !== null && (
                            <button
                              type="button"
                              className="button"
                              disabled={Boolean(busy)}
                              onClick={() => void more("lines")}
                            >
                              {busy === "lines" ? "Loading…" : "Load more lines"}
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="unchanged-file">
                        No line changes in these captured versions.
                      </div>
                    )
                  ) : (
                    <div className="unavailable-diff">
                      <div>
                        <Icon name="alert" size={19} />
                        <h4>
                          {detail.diff.state === "bounded"
                            ? "Diff limit reached"
                            : "A complete diff is unavailable"}
                        </h4>
                        <p>{detail.diff.reason}</p>
                      </div>
                      <div className="captured-sides">
                        {(["before", "after"] as const).map((side) => {
                          const content =
                            side === "before" ? detail.beforeContent : detail.afterContent;
                          return (
                            <section key={side}>
                              <h4>
                                {side === "before" ? "Before" : "After"}
                                <span>{content?.state ?? "unavailable"}</span>
                              </h4>
                              <pre>
                                <code>
                                  {content?.text ??
                                    `[${side === "before" && detail.change.status === "added" ? "Not present in before capture" : side === "after" && detail.change.status === "deleted" ? "Not present in after capture" : `${side === "before" ? "Before" : "After"} content unavailable`}]`}
                                </code>
                              </pre>
                            </section>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <details className="diff-provenance">
                    <summary>Comparison rule & evidence</summary>
                    <p>
                      <code>{detail.change.rule}</code>
                    </p>
                    <p>
                      Supporting observations: {detail.evidenceIds.join(", ")}. Code is captured
                      text; displayed relationships do not establish authorship, test coverage, or
                      feature correctness.
                    </p>
                  </details>
                </>
              ) : (
                <div className="capture-empty">
                  <Icon name="file" size={28} />
                  <h3>Select a captured path</h3>
                  <p>Read the before and after versions and inspect the source observations.</p>
                </div>
              )}
            </section>
          </div>
          {sources && (sources.warnings.length > 0 || sources.omitted > 0) && (
            <details className="capture-limitations">
              <summary>
                Capture limitations
                {sources.omitted > 0 ? ` · ${sources.omitted} comparison paths omitted` : ""}
              </summary>
              <ul>
                {[...new Set(sources.warnings)].map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
