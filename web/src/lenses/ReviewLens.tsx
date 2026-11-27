import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { ReviewFile, SessionDetail, SessionReview, ToolCall } from "../../../shared/model.ts";
import { branchLine, prSummary } from "../../../shared/review.ts";
import { isTypingTarget, modalOpen } from "../a11y.ts";
import { api, useData } from "../api.ts";
import { RecordedChange } from "../components/Diff.tsx";
import { EmptyState, ErrorState, Loading } from "../components/ui.tsx";
import { ago, clock, fileName, plural } from "../format.ts";
import { Link, paths } from "../router.ts";
import type { LensContext } from "../state.ts";
import "./review.css";

type Sort = "risk" | "size" | "path";
type Tab = "git" | "edits" | "source";

const PAGE = 100;
const MAX_LINES = 2000;
const CHIPS = 3;

/* ---------- reviewed marks, kept in this browser per session ---------- */

const storeKey = (sid: string) => `quoli.reviewed.${sid}`;

function loadReviewed(sid: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(sid)) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : []);
  } catch {
    return new Set();
  }
}

function saveReviewed(sid: string, set: Set<string>) {
  try {
    localStorage.setItem(storeKey(sid), JSON.stringify([...set]));
  } catch {}
}

/* ---------- ordering ---------- */

const size = (f: ReviewFile) => (f.added ?? 0) + (f.removed ?? 0);

interface Group {
  name: string;
  files: ReviewFile[];
  added: number;
  removed: number;
}

/** Files grouped by package or folder; both the groups and the files in them follow the sort. */
export function arrange(files: ReviewFile[], sort: Sort): Group[] {
  const by = new Map<string, ReviewFile[]>();
  for (const f of files) by.set(f.group, [...(by.get(f.group) ?? []), f]);
  const cmp = {
    risk: (a: ReviewFile, b: ReviewFile) => b.risk - a.risk || size(b) - size(a),
    size: (a: ReviewFile, b: ReviewFile) => size(b) - size(a) || b.risk - a.risk,
    path: (a: ReviewFile, b: ReviewFile) => a.path.localeCompare(b.path),
  }[sort];
  const groups = [...by].map(([name, fs]) => ({
    name,
    files: [...fs].sort((a, b) => cmp(a, b) || a.path.localeCompare(b.path)),
    added: fs.reduce((n, f) => n + (f.added ?? 0), 0),
    removed: fs.reduce((n, f) => n + (f.removed ?? 0), 0),
  }));
  const rank = (g: Group) =>
    sort === "risk"
      ? Math.max(...g.files.map((f) => f.risk))
      : sort === "size"
        ? g.added + g.removed
        : 0;
  return groups.sort((a, b) =>
    sort === "path"
      ? a.name.localeCompare(b.name)
      : rank(b) - rank(a) || a.name.localeCompare(b.name),
  );
}

/* ---------- diff rendering ---------- */

interface Row {
  kind: "add" | "del" | "ctx" | "hunk" | "meta";
  old: number | null;
  now: number | null;
  text: string;
}

const HEADER =
  /^(diff --git |index |--- |\+\+\+ |similarity index |rename (from|to) |new file mode |deleted file mode |old mode |new mode )/;

/** Unified diff text as rows with old and new line numbers. */
export function parseDiff(text: string): Row[] {
  const rows: Row[] = [];
  let o = 0;
  let n = 0;
  let inHunk = false;
  for (const line of text.split("\n")) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (h) {
      o = Number(h[1]);
      n = Number(h[2]);
      inHunk = true;
      rows.push({ kind: "hunk", old: null, now: null, text: line });
    } else if (line.startsWith("@@")) {
      o = 0;
      n = 1;
      inHunk = true;
      rows.push({ kind: "hunk", old: null, now: null, text: line });
    } else if (!inHunk && HEADER.test(line)) continue;
    else if (line.startsWith("Binary files") || line.startsWith("\\"))
      rows.push({ kind: "meta", old: null, now: null, text: line });
    else if (!inHunk) continue;
    else if (line.startsWith("+"))
      rows.push({ kind: "add", old: null, now: n++, text: line.slice(1) });
    else if (line.startsWith("-"))
      rows.push({ kind: "del", old: o++, now: null, text: line.slice(1) });
    else if (line === "" && rows.at(-1)?.text === "") continue;
    else rows.push({ kind: "ctx", old: o++, now: n++, text: line.slice(1) });
  }
  // The text ends with a newline, which leaves one empty context row.
  while (rows.length && rows.at(-1)?.kind === "ctx" && rows.at(-1)?.text === "") rows.pop();
  return rows;
}

function sourceRows(text: string): Row[] {
  const lines = text.replace(/\n$/, "").split("\n");
  return lines.map((t, i) => ({ kind: "ctx", old: null, now: i + 1, text: t }));
}

function Code({ rows, wrap, label }: { rows: Row[]; wrap: boolean; label: string }) {
  const [all, setAll] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: collapse again for the next file
  useEffect(() => setAll(false), [label]);
  const shown = all ? rows : rows.slice(0, MAX_LINES);
  return (
    <>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard */}
      <section className={`rv-code ${wrap ? "wrap" : ""}`} aria-label={label} tabIndex={0}>
        {shown.map((r, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static rows
          <div key={i} className={`rv-line ${r.kind}`}>
            <span className="rv-n" aria-hidden>
              {r.old ?? ""}
            </span>
            <span className="rv-n" aria-hidden>
              {r.now ?? ""}
            </span>
            <span className="rv-sign" aria-hidden>
              {r.kind === "add" ? "+" : r.kind === "del" ? "−" : ""}
            </span>
            <code>{r.text || " "}</code>
          </div>
        ))}
      </section>
      {shown.length < rows.length && (
        <button type="button" className="btn rv-more" onClick={() => setAll(true)}>
          Show all {rows.length} lines
        </button>
      )}
    </>
  );
}

/* ---------- pieces ---------- */

const CHIP_TONE: Record<string, string> = {
  "failed run after": "bad",
  "edited after tests": "bad",
};

function Chips({ f }: { f: ReviewFile }) {
  const labels = [
    ...(f.status && f.status !== "modified" ? [f.status === "added" ? "new" : f.status] : []),
    ...f.reasons.filter((r) => r.label !== "large").map((r) => r.label),
    ...(f.outsideEdits ? ["not in edits"] : []),
  ];
  if (labels.length === 0) return null;
  return (
    <span className="rv-chips">
      {labels.slice(0, CHIPS).map((l) => (
        <span key={l} className={`rv-chip ${CHIP_TONE[l] ?? ""}`}>
          {l}
        </span>
      ))}
      {labels.length > CHIPS && (
        <span className="rv-chip" title={labels.slice(CHIPS).join(", ")}>
          +{labels.length - CHIPS}
        </span>
      )}
    </span>
  );
}

function Delta({ f }: { f: Pick<ReviewFile, "added" | "removed"> }) {
  if (f.added === null && f.removed === null) return <span className="faint">binary</span>;
  return (
    <>
      <span className="add">+{f.added ?? 0}</span> <span className="del">−{f.removed ?? 0}</span>
    </>
  );
}

function BranchPanel({ review, copy }: { review: SessionReview; copy: () => Promise<boolean> }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const b = review.branch;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const click = async () => {
    setState((await copy()) ? "done" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2500);
  };
  return (
    <div className="rv-top">
      <div className="rv-branch">
        {b ? (
          <details>
            <summary>
              <span className="mono">{branchLine(b)}</span>
            </summary>
            <div className="rv-commits">
              {b.commits === null ? (
                <p className="faint">Commits could not be read.</p>
              ) : b.commits.length === 0 ? (
                <p className="faint">No commits were made while this session ran.</p>
              ) : (
                <ul>
                  {b.commits.map((c) => (
                    <li key={c.sha}>
                      <span className="mono faint">{c.sha.slice(0, 7)}</span>
                      <span className="rv-subject" title={c.subject}>
                        {c.subject}
                      </span>
                      <span className="faint">{ago(c.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="faint rv-fine">
                {b.upstream
                  ? `Upstream ${b.upstream}. `
                  : "No upstream branch, so unpushed is unknown. "}
                Uncommitted counts every changed or new file in the working tree.
              </p>
            </div>
          </details>
        ) : (
          <span className="faint">Branch details are not available for this session.</span>
        )}
      </div>
      <span className="rv-copy-state" role="status">
        {state === "done" ? "Copied" : state === "failed" ? "Copy was blocked by the browser" : ""}
      </span>
      <button type="button" className="btn" onClick={click}>
        Copy PR summary
      </button>
    </div>
  );
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}
  try {
    const t = document.createElement("textarea");
    t.value = text;
    t.setAttribute("readonly", "");
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  } catch {
    return false;
  }
}

/* ---------- the lens ---------- */

type Props = Pick<LensContext, "projectId" | "selection" | "select"> & {
  session: SessionDetail;
  review: SessionReview | null;
  error: string | null;
  retry: () => void;
};

export function ReviewLens(p: Props) {
  const { session, review, error, retry } = p;
  const sid = session.id;
  const [sort, setSort] = useState<Sort>("risk");
  const [limit, setLimit] = useState(PAGE);
  const [reviewed, setReviewed] = useState(() => loadReviewed(sid));
  useEffect(() => setReviewed(loadReviewed(sid)), [sid]);

  const groups = useMemo(() => (review ? arrange(review.files, sort) : []), [review, sort]);
  const flat = useMemo(() => groups.flatMap((g) => g.files), [groups]);
  const wanted = p.selection?.kind === "file" ? p.selection.id : null;
  const current = flat.find((f) => f.path === wanted) ?? flat[0] ?? null;
  const index = current ? flat.indexOf(current) : -1;
  const visible = Math.max(limit, index + 1);

  const toggle = (path: string) => {
    const next = new Set(reviewed);
    if (!next.delete(path)) next.add(path);
    setReviewed(next);
    saveReviewed(sid, next);
  };

  const detail = useRef<HTMLElement>(null);
  const keys = useRef({ flat, index, current, visible });
  keys.current = { flat, index, current, visible };
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
      const k = keys.current;
      const move = (to: number) => {
        const f = k.flat[Math.max(0, Math.min(Math.min(k.visible, k.flat.length) - 1, to))];
        if (f) p.select({ kind: "file", id: f.path }, true);
      };
      if (e.key === "j") move(k.index + 1);
      else if (e.key === "k") move(k.index - 1);
      else if (e.key === "x" && k.current) toggle(k.current.path);
      else if (e.key === "Enter" && k.current && (e.target as HTMLElement).tagName !== "BUTTON") {
        detail.current?.scrollIntoView({ block: "nearest" });
        detail.current?.focus();
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: keep the selected row in view
  useEffect(() => {
    if (current) document.getElementById(rowId(current.path))?.scrollIntoView({ block: "nearest" });
  }, [current?.path]);

  if (error && !review)
    return <ErrorState title="Could not build the review" message={error} retry={retry} />;
  if (!review) return <Loading label="Reading the changes…" />;

  const done = review.files.filter((f) => reviewed.has(f.path)).length;
  const copy = () => writeClipboard(prSummary(session.title, review, session.report.commands));

  return (
    <div className="review-lens">
      <BranchPanel review={review} copy={copy} />
      {review.note && <p className="rv-note">{review.note}</p>}
      {review.noNetChange.length > 0 && (
        <p className="rv-note">
          {plural(review.noNetChange.length, "recorded edit")} left no net change in Git (reverted
          or ignored): {review.noNetChange.slice(0, 3).join(", ")}
          {review.noNetChange.length > 3 ? ` and ${review.noNetChange.length - 3} more` : ""}.
        </p>
      )}
      {review.files.length === 0 ? (
        <EmptyState title="No file changes to review">
          <p>
            {review.source === "git"
              ? "Git shows no difference from where this session began. If the agent edits files, they’ll appear here for review."
              : "No file edits were recorded for this session. When an agent edits files, Review shows the diff here."}
          </p>
        </EmptyState>
      ) : (
        <div className="rv-body">
          <nav className="rv-list" aria-label="Changed files">
            <div className="rv-listhead">
              <span className="rv-progress">
                <b>
                  {done}/{review.files.length}
                </b>{" "}
                reviewed by you
              </span>
              <fieldset className="segmented">
                <legend className="sr-only">Sort files by</legend>
                {(["risk", "size", "path"] as const).map((s) => (
                  <button
                    type="button"
                    key={s}
                    aria-pressed={sort === s}
                    onClick={() => setSort(s)}
                  >
                    {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </fieldset>
            </div>
            <div
              className="rv-bar"
              role="progressbar"
              aria-label="Files reviewed"
              aria-valuemin={0}
              aria-valuemax={review.files.length}
              aria-valuenow={done}
            >
              <i style={{ width: `${(done / review.files.length) * 100}%` }} />
            </div>
            <p className="rv-scope">
              Your own checklist, kept in this browser. It is not shared with anyone and is not an
              approval.
            </p>
            <FileGroups
              groups={groups}
              visible={visible}
              current={current?.path ?? null}
              reviewed={reviewed}
              toggle={toggle}
              select={(path) => p.select({ kind: "file", id: path }, true)}
            />
            {visible < flat.length && (
              <button
                type="button"
                className="btn rv-more"
                onClick={() => setLimit(visible + PAGE)}
              >
                Show {Math.min(PAGE, flat.length - visible)} more of {flat.length - visible}
              </button>
            )}
          </nav>
          {current && (
            <FileDetail
              key={current.path}
              ref={detail}
              session={session}
              projectId={p.projectId}
              file={current}
              review={review}
              reviewed={reviewed.has(current.path)}
              toggle={() => toggle(current.path)}
            />
          )}
        </div>
      )}
    </div>
  );
}

const rowId = (path: string) => `rv-row-${path}`;

function FileGroups({
  groups,
  visible,
  current,
  reviewed,
  toggle,
  select,
}: {
  groups: Group[];
  visible: number;
  current: string | null;
  reviewed: Set<string>;
  toggle: (path: string) => void;
  select: (path: string) => void;
}) {
  let left = visible;
  return (
    <div className="rv-groups">
      {groups.map((g) => {
        const files = g.files.slice(0, Math.max(0, left));
        left -= files.length;
        if (files.length === 0) return null;
        return (
          <section key={g.name} aria-label={g.name}>
            <h3 className="rv-group">
              <span className="mono ellip" title={g.name}>
                {g.name}
              </span>
              <span className="rv-count">{g.files.length}</span>
              <span className="rv-gdelta">
                <span className="add">+{g.added}</span> <span className="del">−{g.removed}</span>
              </span>
            </h3>
            <ul>
              {files.map((f) => {
                const sel = f.path === current;
                const done = reviewed.has(f.path);
                return (
                  <li
                    key={f.path}
                    id={rowId(f.path)}
                    className={`rv-row ${sel ? "sel" : ""} ${done ? "done" : ""} lvl-${f.level}`}
                  >
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggle(f.path)}
                      aria-label={`Mark ${f.path} reviewed`}
                    />
                    <button
                      type="button"
                      className="rv-file"
                      aria-current={sel ? "true" : undefined}
                      onClick={() => select(f.path)}
                      title={f.path}
                    >
                      <span className="rv-name">
                        <b>{fileName(f.path)}</b>
                        <span className="rv-dir">
                          {f.path.slice(0, -fileName(f.path).length - 1)}
                        </span>
                      </span>
                      <span className="rv-delta">
                        <Delta f={f} />
                      </span>
                      <Chips f={f} />
                      {f.level !== "low" && <span className="sr-only">{f.level} risk</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const FileDetail = forwardRef<
  HTMLElement,
  {
    session: SessionDetail;
    projectId: string;
    file: ReviewFile;
    review: SessionReview;
    reviewed: boolean;
    toggle: () => void;
  }
>(function FileDetail({ session, projectId, file, review, reviewed, toggle }, ref) {
  const [choice, setChoice] = useState<Tab | null>(null);
  const [wrap, setWrap] = useState(false);
  const [diff, retryDiff, diffError] = useData(
    `rvd:${session.id}:${file.path}:${file.added}:${file.removed}`,
    () => api.reviewDiff(session.id, file.path),
  );
  const calls = useMemo(() => {
    const ids = new Set(file.toolCallIds);
    return session.toolCalls
      .filter((c) => ids.has(c.id))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }, [session, file]);

  const hasGit = review.source === "git";
  const tab: Tab =
    choice ??
    (hasGit && (diff === null || diff.gitDiff) ? "git" : calls.length ? "edits" : "source");
  const href = (c: ToolCall) =>
    paths.board(projectId, session.id, { lens: "agents", selection: { kind: "tool", id: c.id } });

  const body = () => {
    if (tab === "edits") {
      return calls.length === 0 ? (
        <p className="rv-empty">
          The agent has no recorded edit of this file. It changed some other way: a command, another
          tool or you.
        </p>
      ) : (
        <div className="rv-edits">
          {calls.map((c) => (
            <div key={c.id}>
              <p className="rv-edithead">
                <span className="mono">
                  {c.name} · {clock(c.startedAt)}
                </span>
                <Link to={href(c)}>Open in Agents</Link>
              </p>
              <RecordedChange call={c} />
            </div>
          ))}
        </div>
      );
    }
    if (diffError && !diff)
      return <ErrorState title="Could not read the file" message={diffError} retry={retryDiff} />;
    if (!diff) return <Loading label="Reading the file…" />;
    if (tab === "git") {
      if (!hasGit)
        return <p className="rv-empty">Git is not available for this session. See Agent edits.</p>;
      if (!diff.gitDiff)
        return (
          <p className="rv-empty">
            Git shows no text difference for this file (binary or unchanged).
          </p>
        );
      return (
        <>
          <Code rows={parseDiff(diff.gitDiff)} wrap={wrap} label={`Git diff of ${file.path}`} />
          {diff.truncated && (
            <p className="rv-empty">The diff is long and was cut at 300,000 characters.</p>
          )}
        </>
      );
    }
    if (diff.source === null)
      return (
        <p className="rv-empty">
          {file.status === "deleted"
            ? "The file is deleted."
            : "The file is binary, over 1 MB, or no longer on disk."}
        </p>
      );
    return <Code rows={sourceRows(diff.source)} wrap={wrap} label={`Source of ${file.path}`} />;
  };

  const prompts = file.turnIndexes
    .map((i) => session.turns[i]?.prompt)
    .filter((t): t is string => !!t);
  const edited =
    file.editAdded !== null && (file.editAdded !== file.added || file.editRemoved !== file.removed);
  return (
    <section className="rv-detail" ref={ref} tabIndex={-1} aria-label={`Changes to ${file.path}`}>
      <header className="rv-dhead">
        <div className="rv-title">
          <h2 className="mono" title={file.path}>
            {file.oldPath ? `${file.oldPath} → ` : ""}
            {file.path}
          </h2>
          <label className="rv-check">
            <input type="checkbox" checked={reviewed} onChange={toggle} />
            Reviewed by me
          </label>
        </div>
        <p className="rv-meta">
          {file.status && <span>{file.status}</span>}
          <span>
            <Delta f={file} />
            {review.source === "git" ? " in Git" : " from edits"}
          </span>
          {edited && (
            <span className="faint" title="Lines counted from the agent's recorded edit inputs">
              agent edits +{file.editAdded} −{file.editRemoved}
            </span>
          )}
          {file.timesEdited > 0 && <span>{plural(file.timesEdited, "edit")} by the agent</span>}
        </p>
      </header>

      <dl className="rv-why">
        {file.reasons.length > 0 && (
          <>
            <dt>Risk</dt>
            <dd>
              <ul>
                {file.reasons.map((r) => (
                  <li key={r.label}>{r.text}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {prompts.length > 0 && (
          <>
            <dt>Asked</dt>
            <dd>
              <ul>
                {prompts.slice(0, 2).map((t) => (
                  <li key={t} className="clamp">
                    {t}
                  </li>
                ))}
                {prompts.length > 2 && (
                  <li className="faint">and {prompts.length - 2} more prompts</li>
                )}
              </ul>
            </dd>
          </>
        )}
        {calls.length > 0 && (
          <>
            <dt>Edits</dt>
            <dd className="rv-calls">
              {calls.slice(0, 6).map((c) => (
                <Link key={c.id} to={href(c)} className="rv-call" title={c.summary}>
                  {c.name} <span className="faint">{clock(c.startedAt)}</span>
                </Link>
              ))}
              {calls.length > 6 && <span className="faint">+{calls.length - 6} more</span>}
            </dd>
          </>
        )}
        {calls.length > 0 && (
          <>
            <dt>Then ran</dt>
            <dd>
              {file.after.length === 0 ? (
                <span className="faint">No command ran after the last edit.</span>
              ) : (
                <ul>
                  {file.after.map((c) => (
                    <li key={c.toolCallId} className="rv-ran">
                      <span className={`rv-res ${c.status}`}>
                        {c.status === "ok" ? "ok" : c.status}
                      </span>
                      <Link
                        to={paths.board(projectId, session.id, {
                          lens: "agents",
                          selection: { kind: "tool", id: c.toolCallId },
                        })}
                        className="mono ellip"
                        title={c.command}
                      >
                        {c.command.split("\n")[0]}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </>
        )}
        {file.functions && file.functions.length > 0 && (
          <>
            <dt>Functions</dt>
            <dd>
              <ul>
                {file.functions.map((f) => (
                  <li key={f.name}>
                    <span className="mono">{f.name}</span>{" "}
                    <span className="faint">
                      {f.kind}, {f.change}
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>

      <div className="rv-tabs">
        <fieldset className="segmented">
          <legend className="sr-only">Show</legend>
          {(
            [
              ["git", "Git diff"],
              ["edits", "Agent edits"],
              ["source", "Source"],
            ] as const
          ).map(([id, label]) => (
            <button type="button" key={id} aria-pressed={tab === id} onClick={() => setChoice(id)}>
              {label}
            </button>
          ))}
        </fieldset>
        {tab !== "edits" && (
          <label className="rv-check">
            <input type="checkbox" checked={wrap} onChange={() => setWrap(!wrap)} />
            Wrap lines
          </label>
        )}
      </div>
      {body()}
    </section>
  );
});
