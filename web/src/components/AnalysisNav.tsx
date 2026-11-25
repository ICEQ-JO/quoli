import { AGENT_KINDS } from "../../../shared/model.ts";
import { Link, navigate, useLocation } from "../router.ts";

export function useAnalysis() {
  const { pathname, search } = useLocation();
  const q = new URLSearchParams(search);
  const days = [7, 30, 90].includes(Number(q.get("days"))) ? Number(q.get("days")) : 30;
  const agent = AGENT_KINDS.find((a) => a === q.get("agent")) ?? "";
  const project = q.get("project") ?? "";
  const model = q.get("model") ?? "";
  const set = (key: string, value: string | number) => {
    if (value) q.set(key, String(value));
    else q.delete(key);
    navigate(`${pathname}${q.size ? `?${q}` : ""}`);
  };
  return { days, agent, project, model, set } as const;
}

export function AnalysisNav() {
  const { pathname, search } = useLocation();
  return (
    <nav className="analysis-nav" aria-label="Analysis views">
      <Link to={`/usage${search}`} aria-current={pathname === "/usage" ? "page" : undefined}>
        Spend &amp; tokens
      </Link>
      <Link to={`/insights${search}`} aria-current={pathname === "/insights" ? "page" : undefined}>
        Session trends
      </Link>
    </nav>
  );
}
