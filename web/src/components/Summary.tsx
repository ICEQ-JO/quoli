import type { CommandRun, SessionDetail } from "../../../shared/model.ts";
import { clock, compact, fileName, usd } from "../format.ts";
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

/** The session Summary: a readable page of what was asked, changed, run and spent. */
export function Summary({ session, href }: { session: SessionDetail; href: Href }) {
  const { report } = session;
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
  const added = report.changes.reduce((n, c) => n + c.added, 0);
  const removed = report.changes.reduce((n, c) => n + c.removed, 0);
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
                  <p>{t.prompt}</p>
                </li>
              ))}
            </ol>
          )}
        </Sec>

        <Sec
          id="sum-changed"
          title="What changed"
          aside={
            report.changes.length > 0 ? (
              <>
                {report.changes.length} {report.changes.length === 1 ? "file" : "files"} ·{" "}
                <span className="add">+{added}</span> <span className="del">−{removed}</span>
              </>
            ) : undefined
          }
        >
          {report.changes.length === 0 ? (
            <p className="faint">No files were changed.</p>
          ) : (
            <table className="sum-table">
              <caption className="sr-only">Files changed, counted from recorded edits</caption>
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col" className="num">
                    Lines
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.changes.map((c) => (
                  <tr key={c.path}>
                    <td className="ellip" title={c.path}>
                      <Link to={href("code", { kind: "file", id: c.path })} className="path">
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
                      ) : (
                        <>
                          <span className="add">+{c.added}</span>{" "}
                          <span className="del">−{c.removed}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="sum-note">Counted from the edit inputs the agent recorded, not from Git.</p>
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
                          to={href("code", { kind: "file", id: f })}
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
