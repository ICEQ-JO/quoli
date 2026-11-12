import { type ToolCategory, TRACE_CODES } from "../../../shared/model.ts";
import { CATEGORY } from "../format.ts";

const COLOR: Record<string, string> = Object.fromEntries([
  ...Object.entries(TRACE_CODES).map(([cat, code]) => [code, CATEGORY[cat as ToolCategory].color]),
  ["f", "var(--fail)"],
]);
const LABEL: Record<string, string> = Object.fromEntries([
  ...Object.entries(TRACE_CODES).map(([cat, code]) => [code, CATEGORY[cat as ToolCategory].label]),
  ["f", "Failed"],
]);

/**
 * The activity trace: one tick per tool call, coloured by kind, in time order. Long traces are
 * sampled down to `max` ticks; a failure inside a sampled bucket always shows.
 */
export function Trace({ trace, max = 48, label }: { trace: string; max?: number; label?: string }) {
  if (!trace) return <span className="trace empty" aria-hidden />;
  const ticks: string[] = [];
  const step = Math.max(1, trace.length / max);
  for (let i = 0; i < trace.length && ticks.length < max; i += step) {
    const bucket = trace.slice(Math.floor(i), Math.floor(i + step)) || trace[Math.floor(i)];
    ticks.push(bucket.includes("f") ? "f" : bucket[0]);
  }
  const counts = new Map<string, number>();
  for (const c of trace) counts.set(c, (counts.get(c) ?? 0) + 1);
  const summary = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${n} ${LABEL[c]?.toLowerCase() ?? c}`)
    .join(", ");
  return (
    <span className="trace" role="img" aria-label={label ?? `Activity: ${summary}`} title={summary}>
      {ticks.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: ticks are positional
        <i key={i} style={{ background: COLOR[c] ?? "var(--muted)" }} />
      ))}
    </span>
  );
}
