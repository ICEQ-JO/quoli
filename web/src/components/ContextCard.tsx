import { useState } from "react";
import type { SessionContext } from "../../../shared/model.ts";
import { clock, compact } from "../format.ts";

const W = 600;
const H = 96;

const REASON: Record<string, string> = {
  session_start: "at start",
  nested_traversal: "entering a folder",
  path_glob_match: "matching a path rule",
  include: "included by another file",
  compact: "after compaction",
};

/**
 * What the agent had in its context window: the prompt size of every model request (input +
 * cache), compactions, the instruction files it loaded and the commands the user ran. All recorded;
 * the window's limit is not shown because agents do not report it.
 */
export function ContextCard({ context: c }: { context: SessionContext }) {
  const [hover, setHover] = useState<number | null>(null);
  const has = c.sizes.length > 0;
  const empty =
    !has &&
    !c.instructions.length &&
    !c.commands.length &&
    !c.compactions.length &&
    !c.modelSwitches.length;
  if (empty) return null;

  const t0 = has ? Date.parse(c.sizes[0].at) : 0;
  const t1 = has ? Math.max(t0 + 1, Date.parse(c.sizes.at(-1)?.at ?? "")) : 1;
  const max = Math.max(1, c.peak ?? 0);
  const x = (at: string) => ((Date.parse(at) - t0) / (t1 - t0)) * W;
  const y = (n: number) => H - 4 - (n / max) * (H - 12);
  const path = c.sizes
    .map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.tokens).toFixed(1)}`)
    .join("");
  const shown = hover === null ? null : c.sizes[hover];

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const at = t0 + ((e.clientX - box.left) / box.width) * (t1 - t0);
    let best = 0;
    c.sizes.forEach((p, i) => {
      if (Math.abs(Date.parse(p.at) - at) < Math.abs(Date.parse(c.sizes[best].at) - at)) best = i;
    });
    setHover(best);
  };

  return (
    <div className="ctx">
      {has && (
        <>
          <p className="ctx-stats" aria-live="polite">
            {shown ? (
              <>
                <span className="faint">{clock(shown.at)}</span>
                <b className="num">{compact(shown.tokens)}</b> tokens sent
                {shown.model && <span className="faint mono"> · {shown.model}</span>}
              </>
            ) : (
              <>
                Peak <b className="num">{compact(c.peak ?? 0)}</b>
                <span aria-hidden="true"> · </span>
                last request <b className="num">{compact(c.current ?? 0)}</b>
                <span aria-hidden="true"> · </span>
                <b className="num">{c.compactions.length}</b>{" "}
                {c.compactions.length === 1 ? "compaction" : "compactions"}
              </>
            )}
          </p>
          <svg
            className="ctx-chart"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Context size per model request, from ${compact(c.sizes[0].tokens)} to a peak of ${compact(c.peak ?? 0)} tokens`}
            onPointerMove={pick}
            onPointerLeave={() => setHover(null)}
          >
            <line className="ctx-base" x1="0" x2={W} y1={H - 4} y2={H - 4} />
            {c.compactions.map((k) => (
              <line key={k.at} className="ctx-compact" x1={x(k.at)} x2={x(k.at)} y1="0" y2={H} />
            ))}
            <path className="ctx-line" d={path} vectorEffect="non-scaling-stroke" />
            {shown && (
              <line
                className="ctx-cross"
                x1={x(shown.at)}
                x2={x(shown.at)}
                y1="0"
                y2={H}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          <p className="sum-note">
            Tokens each request sent (input and cache) as the context grew; dashed lines are
            compactions. Main agent only.
          </p>
        </>
      )}

      {c.compactions.length > 0 && (
        <ul className="ctx-list">
          {c.compactions.map((k) => (
            <li key={k.at}>
              <span className="faint">{clock(k.at)}</span>
              <span>
                {k.trigger === "manual"
                  ? "Compacted by you"
                  : k.trigger === "auto"
                    ? "Compacted automatically"
                    : "Compacted"}
              </span>
              <span className="num faint">
                {k.before !== null ? compact(k.before) : "?"} →{" "}
                {k.after !== null ? compact(k.after) : "?"} tokens
              </span>
            </li>
          ))}
        </ul>
      )}

      {c.instructions.length > 0 && (
        <>
          <h3 className="sum-sub">Instruction files loaded</h3>
          <ul className="ctx-list">
            {c.instructions.map((f) => (
              <li key={f.path}>
                <span className="mono ctx-path" title={f.path}>
                  {f.path}
                </span>
                <span className="faint">
                  {[f.scope, f.reason ? (REASON[f.reason] ?? f.reason) : null]
                    .filter(Boolean)
                    .join(" · ")}
                  {f.reloads > 0 && ` · reloaded ${f.reloads}×`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {c.commands.length > 0 && (
        <>
          <h3 className="sum-sub">Commands and skills you ran</h3>
          <ul className="ctx-list">
            {c.commands.map((k) => (
              <li key={`${k.at}${k.name}`}>
                <span className="faint">{clock(k.at)}</span>
                <span className="mono">
                  /{k.name}
                  {k.args && <span className="faint"> {k.args}</span>}
                </span>
                <span className="faint">
                  {k.kind === "mcp_prompt" ? "MCP prompt" : (k.source ?? "")}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {c.modelSwitches.length > 0 && (
        <>
          <h3 className="sum-sub">Model switches</h3>
          <ul className="ctx-list">
            {c.modelSwitches.map((m) => (
              <li key={m.at}>
                <span className="faint">{clock(m.at)}</span>
                <span className="mono">
                  {m.from ?? "?"} → {m.to ?? "?"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
