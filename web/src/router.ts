import {
  createElement,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useSyncExternalStore,
} from "react";
import type { Lens, Selection } from "./state.ts";

/** A tiny History API router: real URLs, real links, back/forward and reload all work. */

export type Route =
  | { name: "home" }
  | { name: "projects" }
  | { name: "sessions" }
  | { name: "settings" }
  | { name: "board"; projectId: string; sessionId: string | null }
  | { name: "notfound" };

const CHANGE = "quoli:navigate";
const LENSES: Lens[] = ["summary", "agents", "code", "git", "infra"];
const KINDS = ["file", "tool", "service", "commit", "branch"] as const;

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
  if (parts.length === 1 && (a === "projects" || a === "sessions" || a === "settings"))
    return { name: a };
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
  if (view.selection) q.push(`sel=${view.selection.kind}:${readable(view.selection.id)}`);
  return q.length ? `?${q.join("&")}` : "";
}

export function parseBoardQuery(search: string): BoardView {
  const q = new URLSearchParams(search);
  const lens = q.get("lens");
  const sel = q.get("sel");
  let selection: Selection = null;
  if (sel) {
    const at = sel.indexOf(":");
    const kind = sel.slice(0, at);
    const id = sel.slice(at + 1);
    if (at > 0 && id && (KINDS as readonly string[]).includes(kind))
      selection = { kind, id } as Selection;
  }
  return { lens: LENSES.includes(lens as Lens) ? (lens as Lens) : null, selection };
}

export const paths = {
  home: () => "/",
  projects: () => "/projects",
  sessions: () => "/sessions",
  settings: () => "/settings",
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
const snapshot = () => location.pathname + location.search;

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (to === snapshot()) return;
  if (opts.replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
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
      href: to,
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
