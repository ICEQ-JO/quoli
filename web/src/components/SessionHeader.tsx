import type { SessionDetail } from "../../../shared/model.ts";
import { ago, duration, money, tokenSum } from "../format.ts";
import { Link } from "../router.ts";
import { Trace } from "./Trace.tsx";
import { useNow } from "./ui.tsx";

/** What the selected session is, at a glance, above every lens. */
export function SessionHeader({
  session,
  projectName,
  summaryHref,
}: {
  session: SessionDetail;
  projectName: string;
  /** The Summary URL for this session; its cost section is scrolled into view. */
  summaryHref: string;
}) {
  useNow();
  const unpriced = session.cost.unpriced;
  const when = new Date(session.startedAt).toLocaleString();
  return (
    <section className="session-head" aria-label="Selected session">
      <div className="sh-row">
        <span className={`sh-status ${session.live ? "live" : ""}`}>
          <i aria-hidden />
          {session.live ? "Live" : "Ended"}
        </span>
        <h1 title={session.title}>{session.title}</h1>
        <Trace trace={session.trace} max={64} />
        <Link
          to={summaryHref}
          className="sh-cost"
          title="Estimate from list prices. Open the cost breakdown."
          onClick={() =>
            setTimeout(
              () => document.getElementById("sum-cost")?.scrollIntoView({ block: "start" }),
              50,
            )
          }
        >
          {session.cost.usd === null && tokenSum(session.tokens) > 0 ? (
            "price unknown"
          ) : (
            <>
              <b>{money(session.cost, session.tokens)}</b> est.
            </>
          )}
        </Link>
      </div>
      <p className="sh-meta">
        <span title="Project">{projectName}</span>
        {session.branch && (
          <span className="mono" title={`Branch ${session.branch}`}>
            {session.branch}
          </span>
        )}
        <span title={when}>
          started {ago(session.startedAt)} · {duration(session.startedAt, session.endedAt)}
        </span>
        <span>
          {session.toolCount} {session.toolCount === 1 ? "call" : "calls"}
          {session.failures > 0 && <span className="fail"> · {session.failures} failed</span>}
        </span>
        {session.models.length > 0 && (
          <span className="mono" title={session.models.join(", ")}>
            {session.models.join(", ")}
          </span>
        )}
      </p>
      {unpriced.length > 0 && (
        <span
          className="sh-warn"
          title={`No price for: ${unpriced.join(", ")}. Their tokens are not in the estimate.`}
        >
          ⚠ unpriced: {unpriced.join(", ")}
        </span>
      )}
    </section>
  );
}
