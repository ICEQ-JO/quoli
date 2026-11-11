import type { Project, TokenTotals } from "../../../shared/model.ts";
import { api, useData, useLiveEvents } from "../api.ts";
import { Onboarding } from "../components/Onboarding.tsx";
import {
  EmptyState,
  ErrorState,
  Loading,
  PageHead,
  SessionRow,
  TokenBreakdown,
  useNow,
} from "../components/ui.tsx";
import { compact, tokenSum } from "../format.ts";
import { Link, paths } from "../router.ts";

export function HomePage() {
  const [overview, refresh, error] = useData("overview", api.overview);
  const [projects, refreshProjects] = useData("projects", api.projects);
  useNow();
  useLiveEvents(() => {
    refresh();
    refreshProjects();
  });

  if (!overview) {
    return (
      <div className="page">
        <PageHead title="Home" />
        {error ? <ErrorState message={error} retry={refresh} /> : <Loading />}
      </div>
    );
  }
  if (overview.counts.projects === 0) return <Onboarding />;

  const { live, needsReview, recent, tokens, counts } = overview;
  return (
    <div className="page">
      <PageHead title="Home">
        {counts.projects} {counts.projects === 1 ? "project" : "projects"} · {counts.sessions}{" "}
        {counts.sessions === 1 ? "session" : "sessions"} recorded · {counts.sessionsToday} today
      </PageHead>
      {error && <ErrorState title="Showing the last data we had" message={error} retry={refresh} />}

      <div className="cards">
        <section className="card" aria-labelledby="h-live">
          <h2 id="h-live">Live now</h2>
          <p className="big">{live.length}</p>
          {live.length === 0 ? (
            <p className="faint">No session is running. Start Claude Code in a connected repo.</p>
          ) : (
            <ul className="slist compact">
              {live.slice(0, 4).map((s) => (
                <SessionRow key={s.id} session={s} projects={projects} />
              ))}
            </ul>
          )}
        </section>
        <TokenCard id="h-today" title="Tokens today" tokens={tokens.today} />
        <TokenCard id="h-week" title="Tokens this week" tokens={tokens.week} />
      </div>

      <div className="columns">
        <section className="card" aria-labelledby="h-review">
          <h2 id="h-review">
            Needs review <span className="faint">derived</span>
          </h2>
          {needsReview.length === 0 ? (
            <EmptyState title="Nothing to review">
              <span>No recent session had failed calls or unusually wide changes.</span>
            </EmptyState>
          ) : (
            <ul className="slist">
              {needsReview.map(({ session, reasons }) => (
                <li key={session.id} className="review">
                  <ul className="slist inner">
                    <SessionRow session={session} projects={projects} />
                  </ul>
                  <p className="reasons">{reasons.join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card" aria-labelledby="h-recent">
          <h2 id="h-recent">Recent sessions</h2>
          {recent.length === 0 ? (
            <EmptyState title="No sessions yet">
              <span>Start a new Claude Code session in a connected repository.</span>
              <Link to={paths.projects()} className="btn">
                Go to Projects
              </Link>
            </EmptyState>
          ) : (
            <ul className="slist">
              {recent.map((s) => (
                <SessionRow key={s.id} session={s} projects={projects as Project[] | null} />
              ))}
            </ul>
          )}
          {recent.length > 0 && (
            <p className="card-foot">
              <Link to={paths.sessions()}>All sessions →</Link>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function TokenCard({ id, title, tokens }: { id: string; title: string; tokens: TokenTotals }) {
  const total = tokenSum(tokens);
  return (
    <section className="card" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <p className="big" title={total.toLocaleString()}>
        {compact(total)}
      </p>
      <TokenBreakdown tokens={tokens} />
    </section>
  );
}
