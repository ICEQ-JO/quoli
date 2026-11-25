import {
  createElement,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useSyncExternalStore,
} from "react";
import { BASE } from "./host.ts";
import type { Lens, Selection } from "./state.ts";

/** A tiny History API router: real URLs, real links, back/forward and reload all work. */

export type Route =
  | { name: "home" }
  | { name: "projects" }
  | { name: "sessions" }
  | { name: "settings"; section: SettingsSection }
  | { name: "usage" }
  | { name: "insights" }
  | { name: "board"; projectId: string; sessionId: string | null }
  | { name: "notfound" };

const CHANGE = "quoli:navigate";
export const SETTINGS_SECTIONS = [
  "general",
  "alerts",
  "prices",
  "sync",
  "data",
  "appearance",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
const LENSES: Lens[] = ["summary", "review", "agents", "map", "git", "infra"];
const KINDS = ["file", "symbol", "route", "table", "tool", "service", "commit", "branch"] as const;
/** URL prefix of a selection kind; symbols are `sym:` to keep links short. */
const PREFIX: Record<string, string> = { symbol: "sym" };
const KIND_OF = Object.fromEntries(Object.entries(PREFIX).map(([k, v]) => [v, k]));

export function parseRoute(pathname: string): Route {
  const parts = pathname
    .split("/")
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
  if (parts.length === 0) return { name: "home" };
  const [a, b, c, d] = parts;
  if (
    parts.length === 1 &&
    (a === "projects" || a === "sessions" || a === "usage" || a === "insights")
  )
    return { name: a };
  if (a === "settings" && parts.length <= 2) {
    const section = (b ?? "general") as SettingsSection;
    return SETTINGS_SECTIONS.includes(section)
      ? { name: "settings", section }
      : { name: "notfound" };
  }
  if (a === "projects" && b && parts.length === 2)
    return { name: "board", projectId: b, sessionId: null };
  if (a === "projects" && b && c === "sessions" && d && parts.length === 4)
    return { name: "board", projectId: b, sessionId: d };
  return { name: "notfound" };
}

export interface BoardView {
  lens: Lens | null;
  selection: Selection;
}

const readable = (v: string) => encodeURIComponent(v).replace(/%2F/gi, "/").replace(/%3A/gi, ":");

export function boardQuery(view: BoardView): string {
  const q: string[] = [];
  if (view.lens) q.push(`lens=${view.lens}`);
  if (view.selection)
    q.push(
      `sel=${PREFIX[view.selection.kind] ?? view.selection.kind}:${readable(view.selection.id)}`,
    );
  return q.length ? `?${q.join("&")}` : "";
}

export function parseBoardQuery(search: string): BoardView {
  const q = new URLSearchParams(search);
  const lens = q.get("lens");
  const sel = q.get("sel");
  let selection: Selection = null;
  if (sel) {
    const at = sel.indexOf(":");
    const kind = KIND_OF[sel.slice(0, at)] ?? sel.slice(0, at);
    const id = sel.slice(at + 1);
    if (at > 0 && id && (KINDS as readonly string[]).includes(kind))
      selection = { kind, id } as Selection;
  }
  // Links from before the Code lens became the Map keep working.
  const named = lens === "code" ? "map" : lens;
  return { lens: LENSES.includes(named as Lens) ? (named as Lens) : null, selection };
}

export const paths = {
  home: () => "/",
  projects: () => "/projects",
  sessions: () => "/sessions",
  settings: (section?: SettingsSection) =>
    section && section !== "general" ? `/settings/${section}` : "/settings",
  usage: () => "/usage",
  insights: () => "/insights",
  /** The Sessions list, optionally pre-filtered (Insights links a day to its sessions). */
  sessionsWhere: (f: {
    day?: string;
    agent?: string;
    project?: string;
    model?: string;
    zone?: string;
  }) => {
    const q = new URLSearchParams(Object.entries(f).filter((e): e is [string, string] => !!e[1]));
    return `/sessions${q.size ? `?${q}` : ""}`;
  },
  board: (projectId: string, sessionId?: string | null, view?: BoardView) =>
    `/projects/${encodeURIComponent(projectId)}${
      sessionId ? `/sessions/${encodeURIComponent(sessionId)}` : ""
    }${view ? boardQuery(view) : ""}`,
};

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  window.addEventListener(CHANGE, cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener(CHANGE, cb);
  };
};
/** The app's own paths never include where the site mounts it (BASE, see host.ts). */
const snapshot = () => (location.pathname.slice(BASE.length) || "/") + location.search;
const href = (to: string) => (to.startsWith("/") ? BASE + to : to);

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (to === snapshot()) return;
  if (opts.replace) history.replaceState(null, "", href(to));
  else history.pushState(null, "", href(to));
  window.dispatchEvent(new Event(CHANGE));
}

/** The current location, re-rendering on navigation. */
export function useLocation() {
  const url = useSyncExternalStore(subscribe, snapshot);
  const at = url.indexOf("?");
  const pathname = at < 0 ? url : url.slice(0, at);
  return { url, pathname, search: at < 0 ? "" : url.slice(at), route: parseRoute(pathname) };
}

export function useNavigate() {
  return useCallback(navigate, []);
}

/** A real anchor; plain left-clicks navigate in-app, modified clicks open normally. */
export function Link(props: {
  to: string;
  className?: string;
  title?: string;
  children?: ReactNode;
  "aria-current"?: "page" | "true";
  "aria-label"?: string;
  onClick?: () => void;
}) {
  const { to, children, onClick, ...rest } = props;
  return createElement(
    "a",
    {
      ...rest,
      href: href(to),
      onClick: (e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.();
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        )
          return;
        e.preventDefault();
        navigate(to);
      },
    },
    children,
  );
}
