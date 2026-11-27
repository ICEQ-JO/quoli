import { useState } from "react";
import type { UsageDay } from "../../../shared/model.ts";
import { compact, tokenSum, usd } from "../format.ts";
import { chartKeys } from "./chart-keys.ts";

const dayLabel = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00`).toLocaleDateString([], opts);

/**
 * Estimated spend per day as bars, one neutral series (hue is reserved for meaning in Quoli).
 * An optional daily budget is drawn as a labelled reference line. Days with usage that could
 * not be priced show as a short hatched stub so they never read as $0. When nothing in the range
 * cost money (free or unpriced models) but tokens were used, the bars show tokens instead, so
 * the chart is never empty while there was activity.
 */
export function SpendChart({
  days,
  budget,
  height = 120,
}: {
  days: UsageDay[];
  budget?: number | null;
  height?: number;
}) {
  const [entry, setEntry] = useState(days.length - 1);
  const [hover, setHover] = useState<number | null>(null);
  const byTokens = !days.some((d) => (d.usd ?? 0) > 0) && days.some((d) => tokenSum(d.tokens) > 0);
  const value = (d: UsageDay) => (byTokens ? tokenSum(d.tokens) : (d.usd ?? 0));
  const max = Math.max(byTokens ? 0 : (budget ?? 0), ...days.map(value)) || 1;
  const w = 100 / days.length;
  const today = days.length - 1;
  const shown = hover ?? today;
  const d = days[shown];
  const every = Math.ceil(days.length / 7);
  return (
    <figure className="spend-chart">
      <figcaption className="sc-readout" aria-live="polite">
        <span className="sc-date">
          {shown === today
            ? "Today"
            : dayLabel(d.date, { weekday: "short", month: "short", day: "numeric" })}
        </span>
        <b>{d.usd === null ? (tokenSum(d.tokens) ? "Unpriced" : "No usage") : usd(d.usd)}</b>
        <span className="faint">{compact(tokenSum(d.tokens))} tokens</span>
      </figcaption>
      <div
        className="sc-plot"
        style={{ height }}
        onPointerLeave={(e) => {
          if (!e.currentTarget.contains(document.activeElement)) setHover(null);
        }}
      >
        {budget && !byTokens ? (
          <div className="sc-budget" style={{ bottom: `${(budget / max) * 100}%` }}>
            <span>Daily budget {usd(budget)}</span>
          </div>
        ) : null}
        {days.map((day, i) => {
          const h = (value(day) / max) * 100;
          const over = budget && day.usd !== null && day.usd > budget;
          return (
            <button
              type="button"
              key={day.date}
              className={`sc-col ${i === shown ? "on" : ""}`}
              style={{ left: `${i * w}%`, width: `${w}%` }}
              onPointerEnter={() => setHover(i)}
              tabIndex={i === Math.min(entry, days.length - 1) ? 0 : -1}
              onKeyDown={(e) => chartKeys(e, i, days.length)}
              onClick={() => {
                setEntry(i);
                setHover(i);
              }}
              onFocus={() => {
                setEntry(i);
                setHover(i);
              }}
              onBlur={() => setHover(null)}
              aria-label={`${dayLabel(day.date, { weekday: "long", month: "long", day: "numeric" })}: ${
                day.usd === null
                  ? tokenSum(day.tokens)
                    ? "Unpriced, no list price for reported usage"
                    : "No token usage reported"
                  : `Estimated ${usd(day.usd)}`
              }`}
            >
              {!byTokens && day.usd === null && tokenSum(day.tokens) > 0 ? (
                <i className="sc-bar unpriced" style={{ height: 6 }} />
              ) : (
                <i
                  className={`sc-bar ${over ? "over" : ""}`}
                  style={{ height: h ? `max(2px, ${h}%)` : 0 }}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="sc-axis" aria-hidden>
        {days.map((day, i) =>
          i % every === 0 || i === today ? (
            <span key={day.date} style={{ left: `${(i + 0.5) * w}%` }}>
              {i === today ? "Today" : dayLabel(day.date, { month: "short", day: "numeric" })}
            </span>
          ) : null,
        )}
      </div>
      <p className="sc-note faint">
        Arrow keys inspect dates. Activate a bar to inspect its USD estimate and tokens.
      </p>
      {byTokens && <p className="sc-note faint">No cost in this range, so the bars show tokens.</p>}
    </figure>
  );
}
