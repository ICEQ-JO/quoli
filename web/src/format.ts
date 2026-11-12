import type { Cost, TokenTotals, ToolCategory } from "../../shared/model.ts";

export const CATEGORY: Record<ToolCategory, { label: string; color: string }> = {
  read: { label: "Read", color: "var(--read)" },
  edit: { label: "Edit", color: "var(--edit)" },
  run: { label: "Run", color: "var(--run)" },
  search: { label: "Search", color: "var(--search)" },
  agent: { label: "Subagent", color: "var(--agent)" },
  web: { label: "Web / MCP", color: "var(--web)" },
  other: { label: "Other", color: "var(--muted)" },
};

export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return String(n);
}

export const tokenSum = (t: TokenTotals) => t.input + t.output + t.cacheRead + t.cacheWrite;

export function ago(iso: string | null): string {
  if (!iso) return "";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** A length of time: "0.4s", "12s", "3m 5s", "1h 20m". */
export function span(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export function duration(from: string, to: string | null): string {
  const s = Math.max(0, ((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / 1000);
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

/** Compact dollar amount: `$1.23`, `<$0.01`, `—` when nothing could be priced. */
export function usd(n: number | null): string {
  if (n === null) return "—";
  if (n > 0 && n < 0.01) return "<$0.01";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "1 file", "2 files". Pass `many` for irregular plurals. */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Cost of a session or period. With `tokens`, zero tokens means nothing to price: `$0.00`,
 * not `—`. `—` stays for usage that exists but could not be priced.
 */
export function money(c: Cost, tokens?: TokenTotals): string {
  if (c.usd === null && tokens && tokenSum(tokens) === 0) return usd(0);
  return usd(c.usd);
}

export const fileName = (path: string) => path.split("/").at(-1) ?? path;

export function bytes(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.round(n / 1024)} KB`;
}
