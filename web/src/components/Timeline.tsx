import { useEffect, useRef, useState } from "react";
import type { SessionDetail, ToolCall } from "../../../shared/model.ts";
import { CATEGORY, clock, compact, tokenSum } from "../format.ts";
import type { Selection } from "../state.ts";

interface Props {
  session: SessionDetail;
  calls: ToolCall[];
  cursor: number | null;
  setCursor: (c: number | null) => void;
  selection: Selection;
  select: (s: Selection) => void;
}

/** One slot per tool call, in order. Scrub or play to replay the session across every lens. */
export function Timeline({ session, calls, cursor, setCursor, selection, select }: Props) {
  const [playing, setPlaying] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const n = calls.length;
  const at = cursor ?? n - 1;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const next = (cursor ?? -1) + 1;
      if (next >= n) {
        setPlaying(false);
        setCursor(null);
      } else {
        setCursor(next);
      }
    }, 550);
    return () => clearInterval(timer);
  }, [playing, cursor, n, setCursor]);

  const subLane = new Map(
    session.agents.filter((a) => a.kind === "subagent").map((a, i) => [a.id, i + 1]),
  );
  const lanes = Math.max(1, subLane.size + 1);
  const promptAt = session.turns
    .map((t) => calls.findIndex((c) => c.id === t.toolCallIds[0]))
    .filter((i) => i >= 0);

  // Cumulative tokens reported up to each call.
  const usage = [...session.usage].sort((a, b) => a.at.localeCompare(b.at));
  const total = tokenSum(session.tokens) || 1;
  let acc = 0;
  let u = 0;
  const cumulative = calls.map((c) => {
    while (u < usage.length && usage[u].at <= (c.endedAt ?? c.startedAt))
      acc += tokenSum(usage[u++].tokens);
    return acc;
  });

  const pick = (clientX: number) => {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect || !n) return;
    const i = Math.min(n - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * n)));
    setPlaying(false);
    setCursor(i === n - 1 ? null : i);
    select({ kind: "tool", id: calls[i].id });
  };

  const current = calls[at];
  return (
    <footer className="timeline">
      <div className="tl-controls">
        <button
          type="button"
          onClick={() => {
            if (!playing && cursor === null) setCursor(-1);
            setPlaying(!playing);
          }}
          aria-label={playing ? "Pause replay" : "Replay session"}
          title="Replay the session"
          disabled={!n}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          onClick={() => setCursor(Math.max(0, at - 1))}
          aria-label="Previous step"
          disabled={!n}
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setCursor(at + 1 >= n - 1 ? null : at + 1)}
          aria-label="Next step"
          disabled={!n}
        >
          ›
        </button>
        <div className="tl-label">
          <b>{cursor === null ? (session.live ? "Live" : "End") : `Step ${at + 1}`}</b>
          <span>
            {n ? `${at + 1} / ${n}` : "no tool calls"}
            {current ? ` · ${clock(current.startedAt)}` : ""}
          </span>
        </div>
      </div>
      <div
        className="tl-track"
        ref={bar}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => e.buttons === 1 && pick(e.clientX)}
        role="slider"
        aria-label="Session timeline"
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={at + 1}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setCursor(Math.max(0, at - 1));
          if (e.key === "ArrowRight") setCursor(at + 1 >= n - 1 ? null : at + 1);
        }}
      >
        <svg
          viewBox={`0 0 ${Math.max(n, 1)} 100`}
          preserveAspectRatio="none"
          className="tl-svg"
          aria-hidden
        >
          <polyline
            className="tl-tokens"
            points={cumulative.map((v, i) => `${i + 0.5},${36 - (v / total) * 32}`).join(" ")}
            vectorEffect="non-scaling-stroke"
          />
          {calls.map((c, i) => {
            const lane = subLane.get(c.agentId) ?? 0;
            const h = 52 / lanes;
            return (
              <rect
                key={c.id}
                x={i + 0.12}
                width={0.76}
                y={42 + lane * h}
                height={h - 3}
                rx={0.2}
                fill={c.status === "failed" ? "var(--fail)" : CATEGORY[c.category].color}
                opacity={
                  i > at ? 0.22 : selection?.kind === "tool" && selection.id === c.id ? 1 : 0.85
                }
              />
            );
          })}
          {promptAt.map((i) => (
            <line
              key={`p${i}`}
              x1={i}
              x2={i}
              y1={2}
              y2={98}
              className="tl-prompt"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1={at + 1}
            x2={at + 1}
            y1={0}
            y2={100}
            className="tl-cursor"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="tl-tokens-label" title="Tokens reported up to this step">
        <b>{compact(cumulative[at] ?? 0)}</b>
        <span>of {compact(tokenSum(session.tokens))} tokens</span>
      </div>
    </footer>
  );
}
