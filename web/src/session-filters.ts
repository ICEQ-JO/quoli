import { AGENT_KINDS, type SessionSummary } from "../../shared/model.ts";
import { reportingDay, validZone } from "../../shared/reporting.ts";

export function sessionFilters(search: string) {
  const q = new URLSearchParams(search);
  const day = q.get("day") ?? "";
  const zone = q.get("zone") ?? "";
  return {
    query: q.get("q") ?? "",
    project: q.get("project") ?? "",
    agent: AGENT_KINDS.find((a) => a === q.get("agent")) ?? "",
    status: ["live", "ended"].includes(q.get("status") ?? "") ? (q.get("status") ?? "") : "",
    day:
      /^\d{4}-\d{2}-\d{2}$/.test(day) &&
      !Number.isNaN(Date.parse(`${day}T12:00:00Z`)) &&
      new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day
        ? day
        : "",
    zone: zone && validZone(zone) ? zone : "",
    model: q.get("model") ?? "",
    failedOnly: q.get("failed") === "1",
    loopsOnly: q.get("loops") === "1",
  };
}

export function matchesSessionDay(s: Pick<SessionSummary, "startedAt">, day: string, zone: string) {
  return (
    !day ||
    reportingDay(s.startedAt, zone || Intl.DateTimeFormat().resolvedOptions().timeZone) === day
  );
}

/** Changes only the named view parameter; unknown parameters survive clearing one filter. */
export function filterQuery(search: string, key: string, value: string | boolean): string {
  const q = new URLSearchParams(search);
  if (value) q.set(key, value === true ? "1" : value);
  else q.delete(key);
  return q.size ? `?${q}` : "";
}
