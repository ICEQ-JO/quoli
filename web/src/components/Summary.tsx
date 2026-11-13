import { useState } from "react";
import {
  AGENT_NAMES,
  type CommandRun,
  type SessionDetail,
  type SessionReview,
} from "../../../shared/model.ts";
import { clock, compact, fileName, span, tokenSum, usd } from "../format.ts";
import { Link, paths } from "../router.ts";
import type { Lens, Selection } from "../state.ts";

/** Builds a board URL for the current project and session. */
export type Href = (lens: Lens, selection: Selection) => string;

const KIND_LABEL: Record<CommandRun["kind"], string> = {
  test: "test",
  build: "build",
  lint: "lint",
  typecheck: "typecheck",
  other: "other",
};

function Sec({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="sum-sec" aria-labelledby={`${id}-h`} id={id}>
      <h2 id={`${id}-h`}>
        {title}
        {aside != null && <span className="aside">{aside}</span>}
      </h2>
      {children}
    </section>
  );
}

const EXT_KIND = { mcp: "MCP", skill: "Skill", subagent: "Subagent" } as const;

/** The session Summary: a readable page of what was asked, changed, run and spent. */
export function Summary({
  session,
  review,
  href,
}: {
  session: SessionDetail;
  review: SessionReview | null;
  href: Href;
}) {
  const { report } = session;
  // The same files as the header and the Review lens; recorded edits only until those load.
  const fromGit = review?.source === "git";
  const changes: {
    path: string;
    added: number | null;
    removed: number | null;
    rewrite: boolean;
  }[] = review
    ? review.files.map((f) => ({
        path: f.path,
        added: f.added,
        removed: f.removed,
        rewrite:
          review.source === "edits" &&
          (report.changes.find((c) => c.path === f.path)?.rewrite ?? false),
      }))
    : report.changes;
  const totalCost = session.cost;
  const sum = report.costByModel.reduce(
    (t, r) => ({
      input: t.input + r.tokens.input,
      output: t.output + r.tokens.output,
      cacheRead: t.cacheRead + r.tokens.cacheRead,
      cacheWrite: t.cacheWrite + r.tokens.cacheWrite,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  );
  const added = changes.reduce((n, c) => n + (c.added ?? 0), 0);
  const removed = changes.reduce((n, c) => n + (c.removed ?? 0), 0);
  return (
    <div className="summary">
      <div className="sum-inner">
        <Sec id="sum-asked" title="What you asked" aside={session.turns.length}>
          {session.turns.length === 0 ? (
            <p className="faint">No prompts were recorded for this session.</p>
          ) : (
            <ol className="sum-prompts">
              {session.turns.map((t, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: turns are ordered
                <li key={i}>
                  <span className="time">{clock(t.at)}</span>
                  <div>
                    <p>{t.prompt}</p>
                    {t.reply && <Reply text={t.reply} agent={AGENT_NAMES[session.agent]} />}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Sec>

        <Sec
          id="sum-changed"
          title="What changed"
          aside={
            changes.length > 0 ? (
              <>
                {changes.length} {changes.length === 1 ? "file" : "files"} ·{" "}
                <span className="add">+{added}</span> <span className="del">−{removed}</span>
              </>
            ) : undefined
          }
        >
          {changes.length === 0 ? (
            <p className="faint">No files were changed.</p>
          ) : (
            <table className="sum-table">
              <caption className="sr-only">
                Files changed, {fromGit ? "lines from Git" : "lines from recorded edits"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col" className="num">
                    Lines
                  </th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.path}>
                    <td className="ellip" title={c.path}>
                      <Link to={href("review", { kind: "file", id: c.path })} className="path">
                        <b>{fileName(c.path)}</b>
                        <span className="faint">{c.path.slice(0, -fileName(c.path).length)}</span>
                      </Link>
                    </td>
                    <td className="num nowrap">
                      {c.rewrite ? (
                        <span
                          className="faint"
                          title="The whole file was written; removed lines are unknown"
                        >
                          rewritten <span className="add">+{c.added}</span>
                        </span>
                      ) : c.added === null && c.removed === null ? (
                        <span className="faint">binary</span>
                      ) : (
                        <>
                          <span className="add">+{c.added ?? 0}</span>{" "}
                          <span className="del">−{c.removed ?? 0}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="sum-note">
            {fromGit
              ? "Files and lines are what differs in Git from where the session began, so they include changes the agent made through commands. Open Review to read them."
              : "Counted from the edit inputs the agent recorded, not from Git. Open Review for the details."}
          </p>
        </Sec>

        <Sec id="sum-ran" title="What it ran" aside={report.commands.length || undefined}>
          {report.commands.length === 0 ? (
            <p className="faint">No commands were run.</p>
          ) : (
            <table className="sum-table">
              <caption className="sr-only">Commands the agent ran</caption>
              <thead>
                <tr>
                  <th scope="col">Kind</th>
                  <th scope="col">Command</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.commands.map((c) => (
                  <tr key={c.toolCallId}>
                    <td className="c-kind">
                      <span className={`kind ${c.kind}`}>{KIND_LABEL[c.kind]}</span>
                    </td>
                    <td className="ellip" title={c.command}>
                      <Link
                        to={href("agents", { kind: "tool", id: c.toolCallId })}
                        className="mono cmd"
                      >
                        {c.command}
                      </Link>
                    </td>
                    <td className="c-status">
                      <span className={`st ${c.status}`}>{c.status}</span>
                    </td>
                    <td className="num nowrap time">{clock(c.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Sec>

        <TimeAndMoney session={session} href={href} />

        <Sec id="sum-cost" title="What it cost" aside={usd(totalCost.usd)}>
          {totalCost.unpriced.length > 0 && (
            <p className="sum-warn" role="note">
              No price for {totalCost.unpriced.map((m) => `"${m}"`).join(", ")}. Those tokens are
              left out of the total. Add a price in{" "}
              <Link to={`${paths.settings()}#prices`}>Settings → Prices</Link>.
            </p>
          )}
          {report.costByModel.length === 0 ? (
            <p className="faint">No token usage has been reported for this session yet.</p>
          ) : (
            <table className="sum-table">
              <caption className="sr-only">Tokens and estimated cost per model</caption>
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col" className="num">
                    Input
                  </th>
                  <th scope="col" className="num">
                    Output
                  </th>
                  <th scope="col" className="num">
                    Cache read
                  </th>
                  <th scope="col" className="num">
                    Cache write
                  </th>
                  <th scope="col" className="num">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.costByModel.map((r) => (
                  <tr key={r.model ?? "none"}>
                    <td
                      className="ellip mono"
                      title={r.model ?? "Usage reported without a model id"}
                    >
                      {r.model ?? <span className="faint">unknown model</span>}
                    </td>
                    <td className="num" title={r.tokens.input.toLocaleString()}>
                      {compact(r.tokens.input)}
                    </td>
                    <td className="num" title={r.tokens.output.toLocaleString()}>
                      {compact(r.tokens.output)}
                    </td>
                    <td className="num" title={r.tokens.cacheRead.toLocaleString()}>
                      {compact(r.tokens.cacheRead)}
                    </td>
                    <td className="num" title={r.tokens.cacheWrite.toLocaleString()}>
                      {compact(r.tokens.cacheWrite)}
                    </td>
                    <td
                      className="num strong"
                      title={r.usd === null ? "No price for this model" : undefined}
                    >
                      {usd(r.usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {report.costByModel.length > 1 && (
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td className="num">{compact(sum.input)}</td>
                    <td className="num">{compact(sum.output)}</td>
                    <td className="num">{compact(sum.cacheRead)}</td>
                    <td className="num">{compact(sum.cacheWrite)}</td>
                    <td className="num strong">{usd(totalCost.usd)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
          <p className="sum-note">
            Estimate from list prices ({report.priceVersion}), not an invoice.{" "}
            <Link to={`${paths.settings()}#prices`}>Edit prices</Link>
          </p>
        </Sec>

        {report.loops.length > 0 && (
          <Sec id="sum-loops" title="Possible loops" aside={report.loops.length}>
            <p className="sum-note lead">
              Inferred by simple rules: patterns worth a look, not proof the agent was stuck.
            </p>
            <ul className="sum-review">
              {report.loops.map((item) => (
                <li key={item.id}>
                  <p>{item.text}</p>
                  <p className="refs">
                    <span className="faint" title="The rule that found this">
                      Rule: {item.rule}.
                    </span>
                    {item.files.map((f) => (
                      <Link
                        key={f}
                        to={href("map", { kind: "file", id: f })}
                        className="ref mono"
                        title={f}
                      >
                        {fileName(f)}
                      </Link>
                    ))}
                    {item.toolCallIds.slice(0, 8).map((id, i) => (
                      <Link
                        key={id}
                        to={href("agents", { kind: "tool", id })}
                        className="ref"
                        title={`Open tool call ${id} in the Agents lens`}
                      >
                        call {i + 1}
                      </Link>
                    ))}
                    {item.toolCallIds.length > 8 && (
                      <span className="faint">+{item.toolCallIds.length - 8} more</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </Sec>
        )}

        {report.extensions.length > 0 && (
          <Sec
            id="sum-ext"
            title="MCP servers, skills and subagents"
            aside={report.extensions.length}
          >
            <ul className="sum-ext">
              {report.extensions.map((x) => (
                <li key={`${x.kind}:${x.plugin}:${x.name}`}>
                  <span className={`ext-kind ${x.kind}`}>{EXT_KIND[x.kind]}</span>
                  <span className="ext-name">
                    <b className="mono">{x.name}</b>
                    {x.plugin && <span className="faint"> from plugin {x.plugin}</span>}
                    {x.tools.length > 0 && (
                      <span className="ext-tools mono faint" title={x.tools.join(", ")}>
                        {x.tools.join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="ext-count num">
                    {x.calls} {x.calls === 1 ? "call" : "calls"}
                    {x.failures > 0 && <span className="fail"> · {x.failures} failed</span>}
                  </span>
                  <span className="refs">
                    {x.toolCallIds.slice(0, 6).map((id, i) => (
                      <Link
                        key={id}
                        to={href("agents", { kind: "tool", id })}
                        className="ref"
                        title={`Open tool call ${id} in the Agents lens`}
                      >
                        call {i + 1}
                      </Link>
                    ))}
                    {x.toolCallIds.length > 6 && (
                      <span className="faint">+{x.toolCallIds.length - 6}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Sec>
        )}

        <Sec id="sum-review" title="Review checklist" aside={report.checklist.length || undefined}>
          <p className="sum-note lead">
            Derived — prompts for your review, not proof anything works.
          </p>
          {report.checklist.length === 0 ? (
            <p className="faint">Nothing stood out. That does not mean the change is correct.</p>
          ) : (
            <ul className="sum-review">
              {report.checklist.map((item) => (
                <li key={item.id}>
                  <p>{item.text}</p>
                  {(item.files.length > 0 || item.toolCallIds.length > 0) && (
                    <p className="refs">
                      {item.files.map((f) => (
                        <Link
                          key={f}
                          to={href("map", { kind: "file", id: f })}
                          className="ref mono"
                          title={f}
                        >
                          {fileName(f)}
                        </Link>
                      ))}
                      {item.toolCallIds.map((id, i) => (
                        <Link
                          key={id}
                          to={href("agents", { kind: "tool", id })}
                          className="ref"
                          title={`Open tool call ${id} in the Agents lens`}
                        >
                          tool call {i + 1}
                        </Link>
                      ))}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Sec>
      </div>
    </div>
  );
}

const TURNS_SHOWN = 12;

/** First line of a prompt, for a table cell. */
const firstLine = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean) ?? "(empty prompt)";

/**
 * Per-prompt time, calls, failures, tokens and cost, and the slowest calls. Tokens and cost are
 * attributed to a prompt by the time each model request was reported, so they are derived.
 */
function TimeAndMoney({ session, href }: { session: SessionDetail; href: Href }) {
  const { turns, slowest } = session.report;
  const [all, setAll] = useState(false);
  if (!turns.length && !slowest.length) return null;
  const total = turns.reduce((n, t) => n + t.ms, 0);
  const longest = Math.max(1, ...turns.map((t) => t.ms));
  const priced = turns.filter((t) => t.cost.usd !== null);
  // Marking the top three only means something when there are more than three prompts.
  const costliest = new Set(
    [...(turns.length > 3 ? priced : [])]
      .sort((a, b) => (b.cost.usd ?? 0) - (a.cost.usd ?? 0))
      .slice(0, 3)
      .filter((t) => (t.cost.usd ?? 0) > 0)
      .map((t) => t.index),
  );
  const calls = new Map(session.toolCalls.map((c) => [c.id, c]));
  const shown = all ? turns : turns.slice(0, TURNS_SHOWN);
  return (
    <Sec
      id="sum-time"
      title="Where the time and money went"
      aside={
        total > 0
          ? `${span(total)} across ${turns.length} ${turns.length === 1 ? "prompt" : "prompts"}`
          : undefined
      }
    >
      {turns.length > 0 && (
        <>
          <table className="sum-table sum-turns">
            <caption className="sr-only">
              Time, tool calls, tokens and estimated cost after each prompt
            </caption>
            <thead>
              <tr>
                <th scope="col">Prompt</th>
                <th scope="col">Time</th>
                <th scope="col" className="num" title="Time with a tool call running">
                  In tools
                </th>
                <th scope="col" className="num">
                  Calls
                </th>
                <th scope="col" className="num">
                  Failed
                </th>
                <th scope="col" className="num">
                  Tokens
                </th>
                <th scope="col" className="num">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const prompt = session.turns[t.index]?.prompt ?? "";
                const first = session.turns[t.index]?.toolCallIds[0];
                const label = `${t.index + 1}. ${firstLine(prompt)}`;
                return (
                  <tr key={t.index} className={costliest.has(t.index) ? "costly" : undefined}>
                    <td className="ellip" title={prompt}>
                      {first ? (
                        <Link to={href("agents", { kind: "tool", id: first })}>{label}</Link>
                      ) : (
                        label
                      )}
                    </td>
                    <td className="c-bar" title={`${clock(t.at)} to ${clock(t.endAt)}`}>
                      <span className="bar" aria-hidden="true">
                        <i style={{ width: `${(t.ms / longest) * 100}%` }} />
                      </span>
                      <span className="num">{span(t.ms)}</span>
                    </td>
                    <td className="num">
                      {t.calls ? span(t.toolMs) : <span className="faint">—</span>}
                    </td>
                    <td className="num">{t.calls}</td>
                    <td className={`num ${t.failures ? "fail" : "faint"}`}>{t.failures}</td>
                    <td className="num" title={tokenSum(t.tokens).toLocaleString()}>
                      {tokenSum(t.tokens) ? (
                        compact(tokenSum(t.tokens))
                      ) : (
                        <span className="faint">—</span>
                      )}
                    </td>
                    <td
                      className="num strong"
                      title={
                        t.cost.unpriced.length
                          ? `No price for ${t.cost.unpriced.join(", ")}`
                          : costliest.has(t.index)
                            ? "One of the most expensive prompts"
                            : undefined
                      }
                    >
                      {tokenSum(t.tokens) ? usd(t.cost.usd) : <span className="faint">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {turns.length > TURNS_SHOWN && (
            <p className="sum-note">
              <button type="button" className="btn" onClick={() => setAll((v) => !v)}>
                {all ? "Show fewer" : `Show all ${turns.length} prompts`}
              </button>
            </p>
          )}
          <p className="sum-note">
            Time runs from each prompt to the next. Tokens and cost are matched to a prompt by when
            each model request was reported, so they are derived, not recorded per prompt. Time
            outside tools includes the model thinking and any wait for you.
          </p>
        </>
      )}

      {slowest.length > 0 && (
        <>
          <h3 className="sum-sub">Slowest tool calls</h3>
          <ol className="sum-slow">
            {slowest.map((s) => {
              const c = calls.get(s.toolCallId);
              if (!c) return null;
              return (
                <li key={s.toolCallId}>
                  <Link
                    to={href("agents", { kind: "tool", id: c.id })}
                    className="ellip"
                    title={c.summary}
                  >
                    <span className="mono">{c.name}</span>{" "}
                    <span className="faint">{c.summary}</span>
                  </Link>
                  <span className={`num ${c.status === "failed" ? "fail" : ""}`}>
                    {span(s.ms)}
                    {c.status === "failed" && " · failed"}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </Sec>
  );
}

/** The agent's final reply to a prompt, as recorded. Long replies open on request. */
function Reply({ text, agent }: { text: string; agent: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 480 || text.split("\n").length > 6;
  return (
    <div className="sum-reply">
      <span className="sum-reply-who">{agent} replied</span>
      <p className={long && !open ? "clamped" : undefined}>{text}</p>
      {long && (
        <button type="button" className="sum-reply-more" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Show the whole reply"}
        </button>
      )}
    </div>
  );
}
