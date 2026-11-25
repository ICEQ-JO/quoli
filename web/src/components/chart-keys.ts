import type { KeyboardEvent } from "react";

/** One chart entry; arrows inspect dates, Tab leaves, Enter keeps the chart's own action. */
export function chartKeys(e: KeyboardEvent<HTMLButtonElement>, index: number, count: number) {
  const next =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? count - 1
        : e.key === "ArrowLeft"
          ? Math.max(0, index - 1)
          : e.key === "ArrowRight"
            ? Math.min(count - 1, index + 1)
            : null;
  if (next === null) return;
  e.preventDefault();
  e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
}
