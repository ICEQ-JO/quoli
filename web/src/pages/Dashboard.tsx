import {
  AGENT_NAMES,
  type Collision,
  type CollisionSide,
  type Overview,
  type Project,
} from "../../../shared/model.ts";
import { api, useData, useLiveEvents } from "../api.ts";
import { setFirstRunSkipped } from "../components/FirstRun.tsx";
import { LiveRow } from "../components/Live.tsx";
import { SpendChart } from "../components/SpendChart.tsx";
import {
  EmptyState,
  ErrorState,
  LiveDot,
  Loading,
  PageHead,
  SessionRow,
  useNow,
} from "../components/ui.tsx";
import { ago, compact, money, plural, tokenSum, usd } from "../format.ts";
import { Link, paths } from "../router.ts";

/** Where you land: what is running, what needs a look, what it cost. */
export function DashboardPage() {
  const [overview, refresh, error] = useData("overview", api.overview);
  const [projects, refreshProjects] = useData("projects", api.projects);
  const [usage, refreshUsage] = useData("usage:14", () => api.usage(14));
  const [settings] = useData("settings", api.settings);
  useNow();
  useLiveEvents(() => {
    refresh();
    refreshProjects();
    refreshUsage();
  });

  if (!overview) {
    return (
      <div className="page">
        <PageHead title="Dashboard" />
        {error ? <ErrorState message={error} retry={refresh} /> : <Loading />}
      </div>
    );
  }
  if (overview.counts.projects === 0)
    return (
      <div className="page">
        <PageHead title="Dashboard" />
        <EmptyState title="No sessions yet">
          <p>
            Start your coding agent in a project Quoli records, and its sessions appear here as they
            happen.
          </p>
          <button type="button" className="btn" onClick={() => setFirstRunSkipped(false)}>
            Show the setup steps
          </button>
        </EmptyState>
      </div>
    );

  const { live, needsReview, recent } = overview;
  const budgets = settings?.settings;
  return (
    <div className="page wide">
      <PageHead title="Dashboard">{headline(overview)}</PageHead>
      {error && <ErrorState title="Showing the last data we had" message={error} retry={refresh} />}

      <section className="panel spend" aria-labelledby="d-spend">
        <div className="sec-head">
          <h2 id="d-spend">Spend</h2>
          <span className="faint">estimated at list prices</span>
          <Link to={paths.usage()} className="panel-link">
            Usage details
          </Link>
        </div>
        <div className="spend-body">
          <dl className="spend-stats">
            <Stat
              label="Today"
              value={money(overview.cost.today, overview.tokens.today)}
              detail={`${compact(tokenSum(overview.tokens.today))} tokens`}
              spent={usage?.spend.today ?? overview.cost.today.usd}
              budget={budgets?.budgetDailyUsd ?? null}
              budgetLabel="daily budget"
            />
            <Stat
              label="Last 7 days"
              value={money(overview.cost.week, overview.tokens.week)}
              detail={`${compact(tokenSum(overview.tokens.week))} tokens`}
            />
            <Stat
              label="This month"
              value={usage ? usd(usage.spend.month ?? 0) : "…"}
              spent={usage?.spend.month ?? null}
              budget={budgets?.budgetMonthlyUsd ?? null}
              budgetLabel="monthly budget"
            />
          </dl>
          <div className="spend-chart-wrap">
            {usage ? (
              <SpendChart days={usage.days} budget={budgets?.budgetDailyUsd} height={96} />
            ) : (
              <Loading label="Loading spend…" />
            )}
          </div>
        </div>
        {overview.cost.week.unpriced.length > 0 && (
          <p className="panel-note">
            No price for {overview.cost.week.unpriced.join(", ")}; their tokens are not in these
            amounts. <Link to={paths.settings("prices")}>Edit prices</Link>
          </p>
        )}
      </section>

      <div className="dash-grid">
        <div className="dash-col">
          {live.length > 0 && (
            <section className="panel" aria-labelledby="d-live">
              <div className="sec-head">
                <h2 id="d-live">Live now</h2>
                <span className="sec-count">{live.length}</span>
              </div>
              <ul className="slist">
                {live.map((s) => (
                  <LiveRow key={s.id} s={s} projects={projects} />
                ))}
              </ul>
            </section>
          )}
          {overview.collisions.length > 0 && <CollisionsPanel collisions={overview.collisions} />}
          <section className="panel" aria-labelledby="d-review">
            <div className="sec-head">
              <h2 id="d-review">Needs review</h2>
              {needsReview.length > 0 && <span className="sec-count">{needsReview.length}</span>}
              <span
                className="faint"
                title="Derived from recorded events; never a claim that the work is correct"
              >
                last 7 days
              </span>
            </div>
            {needsReview.length === 0 ? (
              <EmptyState title="Nothing to review">
                <span>
                  No session in the last 7 days had failed calls or unusually wide changes.
                </span>
              </EmptyState>
            ) : (
              <ul className="slist">
                {needsReview.map(({ session, reasons }) => (
                  <li key={session.id} className="review">
                    <ul className="slist inner">
                      <SessionRow session={session} projects={projects} />
                    </ul>
                    <ul className="reasons">
                      {reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="dash-col">
          <section className="panel" aria-labelledby="d-recent">
            <div className="sec-head">
              <h2 id="d-recent">Recent sessions</h2>
              <Link to={paths.sessions()} className="panel-link">
                All sessions
              </Link>
            </div>
            {recent.length === 0 ? (
              <EmptyState title="No sessions yet">
                <span>Start a Claude Code session in a connected repository.</span>
              </EmptyState>
            ) : (
              <ul className="slist">
                {recent.slice(0, 8).map((s) => (
                  <SessionRow key={s.id} session={s} projects={projects} />
                ))}
              </ul>
            )}
          </section>
          <ProjectsPanel projects={projects} overview={overview} />
        </div>
      </div>
    </div>
  );
}

function headline(o: Overview) {
  const parts = [
    o.live.length ? `${o.live.length} live` : "Nothing running",
    o.needsReview.length ? `${o.needsReview.length} to review` : "nothing to review",
    `${plural(o.counts.sessionsToday, "session")} today`,
  ];
  return parts.join(" · ");
}

function Stat({
  label,
  value,
  detail,
  spent,
  budget,
  budgetLabel,
}: {
  label: string;
  value: string;
  detail?: string;
  spent?: number | null;
  budget?: number | null;
  budgetLabel?: string;
}) {
  const share = budget && spent !== undefined ? (spent ?? 0) / budget : null;
  const tone = share === null ? "" : share >= 1 ? "over" : share >= 0.8 ? "near" : "";
  return (
    <div className="figure-stat">
      <dt>{label}</dt>
      <dd>
        <b className="num">{value}</b>
        {detail && <span className="faint">{detail}</span>}
        {share !== null && budget && (
          <span className={`budget ${tone}`}>
            <span className="meter" aria-hidden>
              <i style={{ width: `${Math.min(100, share * 100)}%` }} />
            </span>
            <span>
              {tone === "over" ? "Over" : `${Math.round(share * 100)}% of`} {usd(budget)}{" "}
              {budgetLabel}
            </span>
          </span>
        )}
      </dd>
    </div>
  );
}

function ProjectsPanel({ projects, overview }: { projects: Project[] | null; overview: Overview }) {
  return (
    <section className="panel" aria-labelledby="d-projects">
      <div className="sec-head">
        <h2 id="d-projects">Projects</h2>
        <Link to={paths.projects()} className="panel-link">
          Manage
        </Link>
      </div>
      {!projects ? (
        <Loading />
      ) : (
        <ul className="plist">
          {projects.map((p) => {
            const live = overview.live.some((s) => s.projectId === p.id);
            return (
              <li key={p.id}>
                <LiveDot live={live} />
                <Link to={paths.board(p.id)} className="plist-name" title={p.root}>
                  {p.name}
                </Link>
                <span className="faint">{plural(p.sessions, "session")}</span>
                <span className="faint">
                  {p.lastActivity ? ago(p.lastActivity) : "no events yet"}
                </span>
                <span className={`hook ${p.hookStatus}`}>
                  {p.hookStatus === "receiving"
                    ? "Receiving"
                    : p.hookStatus === "installed"
                      ? "Waiting for events"
                      : "Not connected"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Parallel agents that edited the same files (#17): recorded overlap, inferred merge conflicts. */
function CollisionsPanel({ collisions }: { collisions: Collision[] }) {
  return (
    <section className="panel" aria-labelledby="d-collide">
      <div className="sec-head">
        <h2 id="d-collide">Agents on the same files</h2>
        <span className="sec-count">{collisions.length}</span>
        <span className="faint" title="Sessions in the same repository, worktrees included">
          last 24 hours
        </span>
      </div>
      <ul className="slist collisions">
        {collisions.map((c) => (
          <li key={`${c.a.sessionId}:${c.b.sessionId}`} className="collision">
            <p className="collision-pair">
              <CollisionLink c={c} side={c.a} />
              <span className="faint" aria-hidden="true">
                and
              </span>
              <CollisionLink c={c} side={c.b} />
            </p>
            <p className="collision-files">
              Both edited <FileList files={c.files} />
            </p>
            {c.conflicts && c.conflicts.length > 0 && (
              <p
                className="collision-conflict"
                title="Inferred: Git's merge-tree on the two branches' committed work"
              >
                Merging these branches will conflict in <FileList files={c.conflicts} />
              </p>
            )}
            {c.conflicts && c.conflicts.length === 0 && (
              <p className="faint collision-note">Their committed work still merges cleanly.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CollisionLink({ c, side }: { c: Collision; side: CollisionSide }) {
  return (
    <Link
      to={paths.board(c.projectId, side.sessionId)}
      className="collision-side"
      title={side.title}
    >
      <LiveDot live={side.live} />
      <span>{AGENT_NAMES[side.agent]}</span>
      {side.branch && <code>{side.branch}</code>}
    </Link>
  );
}

/** Up to three repo-relative paths by file name (full path on hover), then how many more. */
function FileList({ files }: { files: string[] }) {
  const shown = files.slice(0, 3);
  return (
    <>
      {shown.map((f, i) => (
        <span key={f}>
          {i > 0 && (i === shown.length - 1 && files.length <= 3 ? " and " : ", ")}
          <code title={f}>{f.split("/").pop()}</code>
        </span>
      ))}
      {files.length > 3 && ` and ${plural(files.length - 3, "more file")}`}
    </>
  );
}
