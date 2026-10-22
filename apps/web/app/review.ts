import type { StoredEvent } from "@traceframe/schema";
import { kindLabels, number } from "@traceframe/ui";
export type View = "Overview" | "Sessions" | "Timeline" | "Reported usage" | "Capture coverage";
export type ReviewLocation = { project: string; session: string; view: View; event: string };
export const initialLocation: ReviewLocation = {
  project: "demo-quoli",
  session: "session-cache",
  view: "Overview",
  event: "",
};
const viewKeys: Record<View, string> = {
  Overview: "overview",
  Sessions: "sessions",
  Timeline: "activity",
  "Reported usage": "usage",
  "Capture coverage": "coverage",
};
export function readLocation(url: URL): ReviewLocation {
  const id = (value: string | null, fallback: string) =>
    value && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : fallback;
  const view =
    (Object.keys(viewKeys) as View[]).find((v) => viewKeys[v] === url.searchParams.get("view")) ??
    (url.searchParams.get("session") &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(url.searchParams.get("session") ?? "")
      ? "Timeline"
      : "Overview");
  return {
    project: id(url.searchParams.get("project"), initialLocation.project),
    session: id(url.searchParams.get("session"), initialLocation.session),
    view,
    event: id(url.searchParams.get("event"), ""),
  };
}
export function reviewUrl(location: ReviewLocation): string {
  const params = new URLSearchParams({
    project: location.project,
    session: location.session,
    view: viewKeys[location.view],
  });
  if (location.event) params.set("event", location.event);
  return `/?${params}`;
}
export function eventTitle(e: StoredEvent): string {
  const p = e.payload;
  if (p.kind === "repository_snapshot")
    return p.reason === "baseline"
      ? "Repository baseline captured"
      : "Repository checkpoint captured";
  if (p.kind === "tool_call") return p.toolName === "Bash" ? "Run command" : `${p.toolName} file`;
  if (p.kind === "tool_result")
    return `${p.toolName} · ${p.status === "success" ? "success reported" : p.status === "failure" ? "failure reported" : p.status}`;
  if (p.kind === "gap") return p.reason.replaceAll("_", " ");
  return kindLabels[p.kind] ?? p.kind;
}
export function preview(e: StoredEvent): string {
  const p = e.payload;
  if ("content" in p) return p.content.text?.split("\n")[0] ?? `Content ${p.content.state}`;
  if (p.kind === "repository_snapshot")
    return `${p.reason === "baseline" ? "Baseline" : "Checkpoint"} · ${p.state} working tree${p.dirty ? " · dirty" : ""}`;
  if (p.kind === "usage")
    return `${number(p.input)} input · ${number(p.output)} output · ${number(p.cacheRead)} cache read`;
  if (p.kind === "session_end") return `Source reports ${p.reason}. Results may still be missing.`;
  return p.reason === "missing_result"
    ? "A requested tool has no recorded result."
    : p.reason === "missing_end"
      ? "No session end was recorded."
      : p.reason === "capture_disabled"
        ? "Content capture was disabled."
        : "The retained history has a capture gap.";
}
export function eventTone(e: StoredEvent): "neutral" | "positive" | "warning" | "negative" {
  if (e.payload.kind === "gap") return "warning";
  if (e.payload.kind === "tool_result")
    return e.payload.status === "failure"
      ? "negative"
      : e.payload.status === "success"
        ? "positive"
        : "warning";
  return "neutral";
}
export function eventIcon(e: StoredEvent): string {
  return e.payload.kind === "gap"
    ? "alert"
    : e.payload.kind === "prompt"
      ? "activity"
      : e.payload.kind === "usage"
        ? "box"
        : e.payload.kind === "tool_result"
          ? e.payload.status === "failure"
            ? "alert"
            : "check"
          : e.payload.kind === "tool_call"
            ? e.payload.toolName === "Bash"
              ? "terminal"
              : "file"
            : "trace";
}
