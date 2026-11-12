import { type CSSProperties, Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { AgentNode, SessionDetail, ToolCall } from "../../../../shared/model.ts";
import { onRoveKey, toolLabel } from "../../a11y.ts";
import { CATEGORY, compact, duration, fileName, plural, tokenSum } from "../../format.ts";
import type { Selection } from "../../state.ts";
import { collapseRuns, runLabel } from "./helpers.ts";

type Block =
  | { type: "prompt"; n: number; text: string }
  | { type: "calls"; agent: AgentNode | undefined; calls: ToolCall[] };

/** Prompts as headers, then consecutive calls of one agent as a block. */
export function buildBlocks(session: SessionDetail, all: ToolCall[]): Block[] {
  const at = new Map<number, number[]>();
  session.turns.forEach((turn, t) => {
    const first = turn.toolCallIds[0];
    let index = first ? all.findIndex((c) => c.id === first) : -1;
    if (index < 0) {
      index = all.findIndex((c) => c.startedAt >= turn.at);
      if (index < 0) index = all.length;
    }
    at.set(index, [...(at.get(index) ?? []), t]);
  });
  const agents = new Map(session.agents.map((a) => [a.id, a]));
  const blocks: Block[] = [];
  const prompts = (i: number) => {
    for (const t of at.get(i) ?? [])
      blocks.push({ type: "prompt", n: t + 1, text: session.turns[t]?.prompt ?? "" });
  };
  all.forEach((call, i) => {
    prompts(i);
    const last = blocks.at(-1);
    if (last?.type === "calls" && last.calls[0]?.agentId === call.agentId) last.calls.push(call);
    else blocks.push({ type: "calls", agent: agents.get(call.agentId), calls: [call] });
  });
  prompts(all.length);
  return blocks;
}

interface Props {
  session: SessionDetail;
  visible: Set<string>;
  selection: Selection;
  cursorId: string | null;
  select: (s: Selection) => void;
}

export function Timeline({ session, visible, selection, cursorId, select }: Props) {
  const all = useMemo(
    () => [...session.toolCalls].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    [session],
  );
  const blocks = useMemo(() => buildBlocks(session, all), [session, all]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const selectedId = selection?.kind === "tool" ? selection.id : null;
  const focusId = selectedId ?? cursorId;
  // One row is in the tab order; arrow keys move between rows.
  const tabId = all.some((c) => c.id === selectedId) ? selectedId : all[0]?.id;

  // Scroll the selected row (or, failing that, the replay cursor) into view.
  useEffect(() => {
    if (!focusId || !root.current) return;
    for (const el of root.current.querySelectorAll<HTMLElement>("[data-ids]")) {
      if ((el.dataset.ids ?? "").split(" ").includes(focusId)) {
        el.scrollIntoView({ block: "nearest" });
        return;
      }
    }
  }, [focusId]);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const renderCalls = (calls: ToolCall[]) =>
    collapseRuns(calls).map((run) => {
      const head = run[0] as ToolCall;
      if (run.length === 1) {
        return (
          <CallRow
            key={head.id}
            call={head}
            selected={selectedId === head.id}
            tabStop={tabId === head.id}
            future={!visible.has(head.id)}
            select={select}
          />
        );
      }
      const expanded = open.has(head.id) || run.some((c) => c.id === selectedId);
      const future = run.every((c) => !visible.has(c.id));
      const cat = CATEGORY[head.category];
      return (
        <Fragment key={head.id}>
          <button
            type="button"
            data-ids={run.map((c) => c.id).join(" ")}
            className={`ag-row ag-run ${future ? "future" : ""}`}
            style={{ "--c": cat.color } as CSSProperties}
            aria-expanded={expanded}
            title={run.map((c) => c.summary).join("\n")}
            onClick={() => toggle(head.id)}
          >
            <span className="ag-bar" />
            <span className="ag-caret">{expanded ? "▾" : "▸"}</span>
            <span className="ag-name">{runLabel(run)}</span>
            <span className="ag-meta">{duration(head.startedAt, run.at(-1)?.endedAt ?? null)}</span>
          </button>
          {expanded && (
            <div className="ag-run-body">
              {run.map((c) => (
                <CallRow
                  key={c.id}
                  call={c}
                  selected={selectedId === c.id}
                  tabStop={tabId === c.id}
                  future={!visible.has(c.id)}
                  select={select}
                />
              ))}
            </div>
          )}
        </Fragment>
      );
    });

  return (
    <div className="ag" ref={root}>
      <div className="ag-inner">
        {blocks.map((b, i) => {
          if (b.type === "prompt") {
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: blocks are rebuilt as a whole
              <h3 className="ag-prompt" key={`p${i}`} title={b.text}>
                <span className="ag-prompt-n">Prompt {b.n}</span>
                <span className="ag-prompt-text">{b.text}</span>
              </h3>
            );
          }
          if (b.agent?.kind === "subagent") {
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: blocks are rebuilt as a whole
              <section className="ag-sub" key={`s${i}`}>
                <header>
                  <span>Subagent · {b.agent.type ?? b.agent.id}</span>
                  <span className="ag-meta">
                    {plural(b.calls.length, "call")} · {compact(tokenSum(b.agent.tokens))} tokens
                  </span>
                </header>
                {renderCalls(b.calls)}
              </section>
            );
          }
          // biome-ignore lint/suspicious/noArrayIndexKey: blocks are rebuilt as a whole
          return <div key={`c${i}`}>{renderCalls(b.calls)}</div>;
        })}
      </div>
    </div>
  );
}

function CallRow({
  call,
  selected,
  tabStop,
  future,
  select,
}: {
  call: ToolCall;
  selected: boolean;
  tabStop: boolean;
  future: boolean;
  select: (s: Selection) => void;
}) {
  const cat = CATEGORY[call.category];
  const shown = call.files.slice(0, 3);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a row that holds file buttons, not a form group
    <div
      role="group"
      tabIndex={tabStop ? 0 : -1}
      aria-label={toolLabel(
        call,
        call.status === "running" ? "" : duration(call.startedAt, call.endedAt),
      )}
      aria-current={selected ? "true" : undefined}
      data-ids={call.id}
      className={`rove ag-row ${call.status} ${selected ? "selected" : ""} ${future ? "future" : ""}`}
      style={{ "--c": cat.color } as CSSProperties}
      onClick={() => select({ kind: "tool", id: call.id })}
      onKeyDown={onRoveKey}
    >
      <span className="ag-bar" />
      <span className="ag-name" title={call.name}>
        {call.name.replace(/^mcp__/, "")}
      </span>
      <span className="ag-summary mono" title={call.summary}>
        {call.summary}
      </span>
      <span className="ag-files">
        {shown.map((f) => (
          <button
            type="button"
            key={f}
            className="ag-chip"
            tabIndex={-1}
            title={f}
            onClick={(e) => {
              e.stopPropagation();
              select({ kind: "file", id: f });
            }}
          >
            {fileName(f)}
          </button>
        ))}
        {call.files.length > shown.length && (
          <span className="ag-more" title={call.files.slice(3).join("\n")}>
            +{call.files.length - shown.length}
          </span>
        )}
      </span>
      <span className={`ag-status ${call.status}`}>
        {call.status === "failed" ? "failed" : call.status === "running" ? "running" : "ok"}
      </span>
      <span className="ag-meta">
        {call.status === "running" ? "" : duration(call.startedAt, call.endedAt)}
      </span>
    </div>
  );
}
