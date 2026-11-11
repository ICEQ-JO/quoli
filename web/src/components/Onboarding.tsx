import { Link, paths } from "../router.ts";

export function Onboarding() {
  return (
    <div className="onboarding">
      <div className="ob-card">
        <div className="brand big">
          <span className="logo" aria-hidden />
          quoli
        </div>
        <h1>See everything your coding agent did.</h1>
        <p>
          Every tool call, every token, every file it touched, the branch it worked on and the
          services that code runs in, on one map.
        </p>
        <ol>
          <li>
            <span>Connect a repository</span>
            <code>pnpm connect /path/to/your/repo</code>
          </li>
          <li>
            <span>Start Claude Code in that repository</span>
            <code>cd /path/to/your/repo && claude</code>
          </li>
          <li>
            <span>Watch it appear here, live.</span>
          </li>
        </ol>
        <p>
          <Link to={paths.projects()} className="btn primary">
            Connect a repository
          </Link>
        </p>
        <p className="faint">
          Want to look around first? Restart with <code>pnpm demo</code> for a sample project with
          three recorded sessions.
        </p>
      </div>
    </div>
  );
}
