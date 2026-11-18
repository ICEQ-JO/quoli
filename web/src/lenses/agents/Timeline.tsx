import {
  type CSSProperties,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { explainCall } from "../../../../shared/explain.ts";
import type {
  AgentNode,
  AgentNote,
  SessionDetail,
  ToolCall,
  ToolCategory,
} from "../../../../shared/model.ts";
import { onRoveKey, toolLabel } from "../../a11y.ts";
import { RecordedChange } from "../../components/Diff.tsx";
import { CATEGORY, clock, compact, fileName, plural, span, tokenSum } from "../../format.ts";
import type { Selection } from "../../state.ts";
import {
  type CallFilter,
  callText,
  collapseRuns,
  matchesFilter,
  type PromptView,
  readableOutput,
  readPrompt,
  runLabel,
  took,
} from "./helpers.ts";

type Group = { agent: AgentNode | undefined; calls: ToolCall[] };
export type Section = { n: number; prompt: PromptView | null; at: string | null; groups: Group[] };

/**
 * One section per prompt, holding the calls it led to; inside, consecutive calls of one agent
 * form a group so subagent work reads as its own thread. Calls before the first prompt get a
 * section without one.
 */
export function buildSections(session: SessionDetail, all: ToolCall[]): Section[] {
  const starts: { index: number; t: number }[] = session.turns.map((turn, t) => {
    const first = turn.toolCallIds[0];
    let index = first ? all.findIndex((c) => c.id === first) : -1;
    if (index < 0) {
      index = all.findIndex((c) => c.startedAt >= turn.at);
      if (index < 0) index = all.length;
    }
    return { index, t };
  });
  starts.sort((a, b) => a.index - b.index || a.t - b.t);
  const agents = new Map(session.agents.map((a) => [a.id, a]));
  const sections: Section[] = [];
  let current: Section = { n: 0, prompt: null, at: null, groups: [] };
  const flush = () => {
    if (current.prompt || current.groups.length) sections.push(current);
  };
  let s = 0;
  all.forEach((call, i) => {
    while (s < starts.length && (starts[s]?.index ?? 0) <= i) {
      flush();
      const t = starts[s++]?.t ?? 0;
      const turn = session.turns[t];
      current = {
        n: t + 1,
        prompt: readPrompt(turn?.prompt ?? ""),
        at: turn?.at ?? null,
        groups: [],
      };
    }
    const last = current.groups.at(-1);
    if (last && last.calls[0]?.agentId === call.agentId) last.calls.push(call);
    else current.groups.push({ agent: agents.get(call.agentId), calls: [call] });
  });
  while (s < starts.length) {
    flush();
    const t = starts[s++]?.t ?? 0;
    const turn = session.turns[t];
    current = {
      n: t + 1,
      prompt: readPrompt(turn?.prompt ?? ""),
      at: turn?.at ?? null,
      groups: [],
    };
  }
  flush();
  return sections;
}

interface Props {
  session: SessionDetail;
  visible: Set<string>;
  selection: Selection;
  cursorId: string | null;
  select: (s: Selection) => void;
  filter: CallFilter;
}

export function Timeline({ session, visible, selection, cursorId, select, filter }: Props) {
  const all = useMemo(
    () => [...session.toolCalls].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    [session],
  );
  const sections = useMemo(() => buildSections(session, all), [session, all]);
  const loopOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of session.report.loops ?? [])
      for (const id of f.toolCallIds) if (!m.has(id)) m.set(id, f.text);
    return m;
  }, [session]);
  const mainId = session.agents.find((a) => a.kind === "main")?.id ?? "main";
  // What the agent wrote, placed before the call it led to (#46); only in the unfiltered view.
  const { notesBefore, notesAfter } = useMemo(() => {
    const before = new Map<string, AgentNote[]>();
    const after = new Map<number, AgentNote[]>();
    if (filter !== "all") return { notesBefore: before, notesAfter: after };
    for (const note of session.notes ?? []) {
      if (note.beforeCallId) {
        before.set(note.beforeCallId, [...(before.get(note.beforeCallId) ?? []), note]);
        continue;
      }
      // Closing words: under the last prompt that started before them.
      let n = 0;
      for (const sec of sections) if (sec.at && sec.at <= note.at) n = sec.n;
      after.set(n, [...(after.get(n) ?? []), note]);
    }
    return { notesBefore: before, notesAfter: after };
  }, [session, sections, filter]);
  const shown = useMemo(() => {
    if (filter === "all") return sections;
    return sections
      .map((sec) => ({
        ...sec,
        groups: sec.groups
          .map((g) => ({ ...g, calls: g.calls.filter((c) => matchesFilter(c, filter, mainId)) }))
          .filter((g) => g.calls.length),
      }))
      .filter((sec) => sec.groups.length);
  }, [sections, filter, mainId]);

  const [open, setOpen] = useState<Set<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const selectedId = selection?.kind === "tool" ? selection.id : null;
  const focusId = selectedId ?? cursorId;
  const tabId = all.some((c) => c.id === selectedId) ? selectedId : all[0]?.id;

  // A call selected elsewhere (the Code lens, ⌘K, the replay bar) opens here.
  useEffect(() => {
    if (selectedId)
      setOpen((prev) => (prev.has(selectedId) ? prev : new Set(prev).add(selectedId)));
  }, [selectedId]);

  useEffect(() => {
    if (!focusId || !root.current) return;
    for (const el of root.current.querySelectorAll<HTMLElement>("[data-ids]")) {
      if ((el.dataset.ids ?? "").split(" ").includes(focusId)) {
        el.scrollIntoView({ block: "nearest" });
        return;
      }
    }
  }, [focusId]);

  const toggle = useCallback(
    (id: string) =>
      setOpen((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );
  // Rows are memoised; they get stable callbacks that read the latest state through a ref.
  const latest = useRef({ open, select });
  latest.current = { open, select };
  const stableSelect = useCallback((s: Selection) => latest.current.select(s), []);
  const toggleCall = useCallback(
    (id: string) => {
      const wasOpen = latest.current.open.has(id);
      toggle(id);
      if (!wasOpen) latest.current.select({ kind: "tool", id });
    },
    [toggle],
  );

  const notes = (list: AgentNote[] | undefined, future: boolean) =>
    list?.map((note) => (
      <Note key={`${note.at}:${note.kind}:${note.text.slice(0, 24)}`} note={note} future={future} />
    ));

  const row = (call: ToolCall) => [
    notes(notesBefore.get(call.id), !visible.has(call.id)),
    <CallRow
      key={call.id}
      call={call}
      open={open.has(call.id)}
      selected={selectedId === call.id}
      tabStop={tabId === call.id}
      future={!visible.has(call.id)}
      loop={loopOf.get(call.id)}
      onToggle={toggleCall}
      select={stableSelect}
    />,
  ];

  const renderCalls = (calls: ToolCall[]) =>
    collapseRuns(calls).map((run) => {
      const head = run[0] as ToolCall;
      if (run.length === 1) return row(head);
      const lead = notesBefore.get(head.id);
      const key = `run:${head.id}`;
      const expanded = open.has(key) || run.some((c) => c.id === selectedId);
      return (
        <div className="ag-run" key={key} data-ids={run.map((c) => c.id).join(" ")}>
          {notes(lead, !visible.has(head.id))}
          <button
            type="button"
            className={`ag-run-head ${run.every((c) => !visible.has(c.id)) ? "future" : ""}`}
            aria-expanded={expanded}
            onClick={() => toggle(key)}
          >
            <KindIcon category={head.category} />
            <span className="ag-run-label">{runLabel(run)}</span>
            <span className="ag-run-files">
              {run
                .slice(0, 4)
                .map((c) => (c.files[0] ? fileName(c.files[0]) : c.summary))
                .join(", ")}
              {run.length > 4 ? `, +${run.length - 4}` : ""}
            </span>
            <Chevron open={expanded} />
          </button>
          {expanded && (
            <div className="ag-run-body">
              {run.map((c, i) => (i === 0 ? row(c).slice(1) : row(c)))}
            </div>
          )}
        </div>
      );
    });

  if (!shown.length) {
    return (
      <div className="ag" ref={root}>
        <p className="ag-empty">{EMPTY[filter]}</p>
      </div>
    );
  }

  return (
    <div className="ag" ref={root}>
      <div className="ag-inner">
        {shown.map((sec) => (
          <section className="ag-section" key={`s${sec.n}`} aria-label={`Prompt ${sec.n}`}>
            {sec.prompt && <PromptHead n={sec.n} at={sec.at} prompt={sec.prompt} />}
            {sec.groups.map((g, i) =>
              g.agent?.kind === "subagent" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: groups are rebuilt as a whole
                <div className="ag-thread" key={i}>
                  <div className="ag-thread-head">
                    <KindIcon category="agent" />
                    <b>Subagent</b>
                    <span className="mono">{g.agent.type ?? g.agent.id.slice(0, 8)}</span>
                    <span className="faint">
                      {plural(g.calls.length, "call")} · {compact(tokenSum(g.agent.tokens))} tokens
                    </span>
                  </div>
                  <div className="ag-thread-body">{renderCalls(g.calls)}</div>
                </div>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: groups are rebuilt as a whole
                <div className="ag-group" key={i}>
                  {renderCalls(g.calls)}
                </div>
              ),
            )}
            {notes(notesAfter.get(sec.n), false)}
          </section>
        ))}
      </div>
    </div>
  );
}

const EMPTY: Record<CallFilter, string> = {
  all: "This session has no prompts or tool calls yet.",
  failed: "No call failed in this session.",
  edits: "This session edited no files.",
  commands: "This session ran no commands.",
  subagents: "This session started no subagents.",
};

/** Something the agent wrote: what it said between calls, or its recorded thinking (#46). */
function Note({ note, future }: { note: AgentNote; future: boolean }) {
  const [more, setMore] = useState(false);
  if (note.kind === "thinking") {
    const first = note.text.split("\n").find((l) => l.trim()) ?? "";
    return (
      <details className={`ag-note thinking ${future ? "future" : ""}`}>
        <summary>
          <span className="ag-note-label">Thinking</span>
          <span className="ag-note-peek">{first}</span>
        </summary>
        <p className="ag-note-text">{note.text}</p>
        <p className="ag-note-src faint">As recorded in the agent's transcript, {clock(note.at)}</p>
      </details>
    );
  }
  const long = note.text.length > 320 || note.text.split("\n").length > 4;
  return (
    <div className={`ag-note said ${future ? "future" : ""}`}>
      <span className="ag-note-label">Agent</span>
      <div>
        <p className={`ag-note-text ${long && !more ? "clamped" : ""}`}>{note.text}</p>
        {long && (
          <button type="button" className="ag-more" onClick={() => setMore(!more)}>
            {more ? "Show less" : "Show all"}
          </button>
        )}
      </div>
    </div>
  );
}

function PromptHead({ n, at, prompt }: { n: number; at: string | null; prompt: PromptView }) {
  const [more, setMore] = useState(false);
  if (prompt.kind === "notice") {
    return (
      <div className="ag-notice">
        <span className="ag-notice-dot" aria-hidden />
        <span>{prompt.title}</span>
        {prompt.detail && <span className="faint">{prompt.detail}</span>}
        {at && <time className="faint">{clock(at)}</time>}
      </div>
    );
  }
  const long = prompt.text.length > 280 || prompt.text.split("\n").length > 4;
  return (
    <header className="ag-prompt">
      <div className="ag-prompt-meta">
        <span className="ag-you">Prompt {n}</span>
        {at && <time className="faint">{clock(at)}</time>}
      </div>
      <p className={`ag-prompt-text ${long && !more ? "clamped" : ""}`}>{prompt.text}</p>
      {long && (
        <button type="button" className="ag-more" onClick={() => setMore(!more)}>
          {more ? "Show less" : "Show the whole prompt"}
        </button>
      )}
    </header>
  );
}

const CallRow = memo(function CallRow({
  call,
  open,
  selected,
  tabStop,
  future,
  loop,
  onToggle,
  select,
}: {
  call: ToolCall;
  open: boolean;
  selected: boolean;
  tabStop: boolean;
  future: boolean;
  /** The text of a loop finding that includes this call. */
  loop?: string;
  onToggle: (id: string) => void;
  select: (s: Selection) => void;
}) {
  const time = took(call);
  return (
    <div
      data-ids={call.id}
      className={`ag-call ${call.status} ${open ? "open" : ""} ${selected ? "selected" : ""} ${future ? "future" : ""}`}
    >
      <button
        type="button"
        className="ag-call-head rove"
        tabIndex={tabStop ? 0 : -1}
        aria-expanded={open}
        aria-label={toolLabel(call, time)}
        onClick={() => onToggle(call.id)}
        onKeyDown={onRoveKey}
      >
        <KindIcon category={call.category} />
        <span className="ag-what">
          <span className="ag-say">{explainCall(call)}</span>
          <span className="ag-raw">
            <span className="ag-tool" title={call.name}>
              {call.name.replace(/^mcp__/, "")}
            </span>
            <span className={`ag-text ${call.files.length ? "" : "mono"}`}>{callText(call)}</span>
          </span>
        </span>
        <span className="ag-end">
          {loop && (
            <span className="ag-badge loop" title={`Possible loop (inferred): ${loop}`}>
              Loop
            </span>
          )}
          {call.status === "failed" ? (
            <span className="ag-badge failed">Failed</span>
          ) : call.status === "running" ? (
            <span className="ag-badge running">Running</span>
          ) : null}
          {time && <span className="ag-took">{time}</span>}
          <Chevron open={open} />
        </span>
      </button>
      {open && <CallDetail call={call} select={select} />}
    </div>
  );
});

const asRecord = (v: unknown) => (v && typeof v === "object" ? v : {}) as Record<string, unknown>;

/** Everything recorded for one call, in place: the change, the command, the result. */
function CallDetail({ call, select }: { call: ToolCall; select: (s: Selection) => void }) {
  const input = asRecord(call.input);
  const parts: ReactNode[] = [];
  if (call.category === "edit") {
    parts.push(
      <Block key="change" title="Requested change">
        <RecordedChange call={call} />
      </Block>,
    );
  } else if (typeof input.command === "string") {
    parts.push(
      <Block
        key="cmd"
        title={typeof input.description === "string" ? input.description : "Command"}
      >
        <pre className="ag-pre">{input.command}</pre>
      </Block>,
    );
  } else if (call.category === "agent" && typeof input.prompt === "string") {
    parts.push(
      <Block key="task" title="Task given to the subagent">
        <pre className="ag-pre prose">{input.prompt}</pre>
      </Block>,
    );
  } else if (call.category !== "read") {
    parts.push(
      <Block key="input" title="Input">
        <pre className="ag-pre">{JSON.stringify(call.input, null, 2)}</pre>
      </Block>,
    );
  }
  const out = readableOutput(call.output);
  parts.push(
    <Block key="out" title={call.status === "failed" ? "Error" : "Result"} note={out?.note ?? null}>
      <pre className={`ag-pre ${call.status === "failed" ? "error" : ""}`}>
        {out?.text ?? (call.status === "running" ? "Still running…" : "No result recorded.")}
      </pre>
    </Block>,
  );
  return (
    <div className="ag-detail">
      {parts}
      <div className="ag-detail-foot">
        {call.files.map((f) => (
          <button
            type="button"
            key={f}
            className="ag-file"
            title={`Show ${f} in the details panel`}
            onClick={() => select({ kind: "file", id: f })}
          >
            {f}
          </button>
        ))}
        <span className="faint">
          Started {clock(call.startedAt)}
          {call.endedAt
            ? ` · took ${span(Date.parse(call.endedAt) - Date.parse(call.startedAt))}`
            : " · still running"}
        </span>
      </div>
    </div>
  );
}

function Block({
  title,
  note = null,
  children,
}: {
  title: string;
  note?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="ag-block">
      <div className="ag-block-title">
        {title}
        {note && <span className="faint">{note}</span>}
      </div>
      {children}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`ag-chev ${open ? "open" : ""}`} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

const KIND_PATHS: Record<ToolCategory, ReactNode> = {
  read: (
    <>
      <path d="M5 2.5h4.5L12 5v8.5H5z" />
      <path d="M7 8h3M7 10.5h3" />
    </>
  ),
  edit: <path d="M3.5 12.5l.6-2.6L10.6 3.4l2 2-6.5 6.5z" />,
  run: <path d="M3.5 4.5L7 8l-3.5 3.5M8.5 12h4" />,
  search: (
    <>
      <circle cx="7" cy="7" r="3.8" />
      <path d="M12.5 12.5L9.8 9.8" />
    </>
  ),
  agent: (
    <>
      <circle cx="4.5" cy="4.5" r="1.8" />
      <circle cx="11.5" cy="11.5" r="1.8" />
      <path d="M4.5 6.3v1.7a3 3 0 003 3h2.2" />
    </>
  ),
  web: (
    <>
      <circle cx="8" cy="8" r="5.3" />
      <path d="M2.7 8h10.6M8 2.7c2 2 2 8.6 0 10.6M8 2.7c-2 2-2 8.6 0 10.6" />
    </>
  ),
  other: <rect x="4" y="4" width="8" height="8" rx="1.5" />,
};

export function KindIcon({ category }: { category: ToolCategory }) {
  return (
    <span
      className="ag-kind"
      style={{ "--c": CATEGORY[category].color } as CSSProperties}
      title={CATEGORY[category].label}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {KIND_PATHS[category]}
      </svg>
    </span>
  );
}
