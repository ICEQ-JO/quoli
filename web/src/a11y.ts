import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ToolCall } from "../../shared/model.ts";
import { plural } from "./format.ts";

/** Pure helpers and small DOM utilities for keyboard use and screen readers. */

export { plural };

/** "⌘" on Apple platforms, "Ctrl" elsewhere. */
export const modKey = (platform = typeof navigator === "undefined" ? "" : navigator.platform) =>
  /mac|iphone|ipad/i.test(platform) ? "⌘" : "Ctrl";

/** True when a key press belongs to a text field and must not trigger a shortcut. */
export function isTypingTarget(
  el: { tagName?: string; isContentEditable?: boolean } | null | undefined,
): boolean {
  if (!el?.tagName) return false;
  if (el.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName.toUpperCase());
}

/** An open dialog owns the keyboard: page shortcuts stay quiet while one is showing. */
export const modalOpen = () =>
  typeof document !== "undefined" && !!document.querySelector('[aria-modal="true"]');

export interface Shortcut {
  keys: string[];
  does: string;
}
export interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

export const shortcutGroups = (mod = modKey()): ShortcutGroup[] => [
  {
    title: "Navigation",
    items: [
      {
        keys: ["1", "2", "3", "4", "5", "6"],
        does: "Switch lens: Summary, Review, Agents, Code, Git, Infra",
      },
      { keys: [mod, "K"], does: "Search files, tool calls, sessions and pages" },
      { keys: ["Esc"], does: "Close a dialog, or clear the current selection" },
      { keys: ["Tab"], does: "Move between regions; “Skip to content” is the first stop" },
    ],
  },
  {
    title: "Canvas and lists",
    items: [
      { keys: ["↑", "↓", "←", "→"], does: "Move between nodes or rows once one is focused" },
      { keys: ["Enter"], does: "Open the focused node or row in the inspector" },
    ],
  },
  {
    title: "Review lens",
    items: [
      { keys: ["J", "K"], does: "Next or previous changed file" },
      { keys: ["Enter"], does: "Move to the diff of the selected file" },
      { keys: ["X"], does: "Mark the selected file reviewed or not" },
    ],
  },
  {
    title: "Timeline (when focused)",
    items: [
      { keys: ["←", "→"], does: "Step back or forward one tool call" },
      { keys: ["Home", "End"], does: "Jump to the first call or back to the latest" },
      { keys: ["Space"], does: "Play or pause the replay" },
    ],
  },
  { title: "Global", items: [{ keys: ["?"], does: "Show this list of shortcuts" }] },
];

/** Label for a file chip on the code canvas. */
export function fileLabel(path: string, edited: number, read: number, gitStatus?: string): string {
  const parts = [path];
  if (edited) parts.push(`edited ${plural(edited, "time")}`);
  if (read) parts.push(`read ${plural(read, "time")}`);
  if (!edited && !read) parts.push("not touched by this session");
  if (gitStatus && gitStatus !== "clean") parts.push(`${gitStatus} in git`);
  return parts.join(", ");
}

export function folderLabel(path: string, files: number, edited: number, read: number): string {
  const parts = [`Folder ${path || "/"}`, plural(files, "file")];
  if (edited) parts.push(`${edited} edited`);
  if (read) parts.push(`${read} read`);
  if (!edited && !read) parts.push("untouched");
  return parts.join(", ");
}

export function toolLabel(call: Pick<ToolCall, "name" | "summary" | "status">, took = ""): string {
  const status = call.status === "failed" ? "failed" : call.status === "running" ? "running" : "ok";
  return [call.name.replace(/^mcp__/, ""), call.summary, status, took].filter(Boolean).join(", ");
}

/** What a screen reader hears about calls that arrived since the last announcement. */
export function announceCalls(fresh: Pick<ToolCall, "name" | "summary" | "status">[]): string {
  if (!fresh.length) return "";
  const last = fresh[fresh.length - 1];
  const failed = fresh.filter((c) => c.status === "failed").length;
  const head = `${plural(fresh.length, "new tool call")}`;
  const tail = `Latest: ${last.name.replace(/^mcp__/, "")} ${last.summary}`.slice(0, 140);
  return `${head}${failed ? `, ${failed} failed` : ""}. ${tail}`;
}

/** Index to focus after an arrow key within a list of `n` items, or null when the key is not ours. */
export function roveTarget(key: string, index: number, n: number): number | null {
  if (n <= 0) return null;
  if (key === "ArrowDown" || key === "ArrowRight") return Math.min(n - 1, index + 1);
  if (key === "ArrowUp" || key === "ArrowLeft") return Math.max(0, index - 1);
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  return null;
}

const ROVE_ROOT = ".react-flow, .g-scroll, .ag";

/**
 * Keyboard handler for a focusable canvas node or list row: Enter and Space click it, arrow keys
 * move focus to the previous or next `.rove` element in the same board. Only one element per
 * board is in the tab order, so hundreds of nodes do not become hundreds of tab stops.
 */
export function onRoveKey(e: ReactKeyboardEvent<HTMLElement>) {
  const el = e.currentTarget;
  if (e.target !== el) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    el.click();
    return;
  }
  const items = Array.from(el.closest(ROVE_ROOT)?.querySelectorAll<HTMLElement>(".rove") ?? []);
  const next = roveTarget(e.key, items.indexOf(el), items.length);
  if (next === null) return;
  e.preventDefault();
  e.stopPropagation();
  for (const item of items) item.tabIndex = -1;
  const to = items[next];
  to.tabIndex = 0;
  to.focus();
}

/** Props that make a canvas node a labelled button inside a roving tab order. */
export function nodeA11y(label: string, tabStop: boolean) {
  return {
    className: "rove",
    ariaLabel: label,
    ariaRole: "button",
    focusable: true,
    domAttributes: { onKeyDown: onRoveKey, tabIndex: tabStop ? 0 : -1 },
  } as const;
}

/** Nodes that are only decoration or section labels stay out of the tab order. */
export const quietNode = { focusable: false } as const;
