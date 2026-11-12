import { useState } from "react";
import type { UsageDay } from "../../../shared/model.ts";
import { compact, tokenSum, usd } from "../format.ts";

const dayLabel = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00`).toLocaleDateString([], opts);

/**
 * Estimated spend per day as bars, one neutral series (hue is reserved for meaning in Quoli).
 * An optional daily budget is drawn as a labelled reference line. Days with usage that could
 * not be priced show as a short hatched stub so they never read as $0.
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
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(budget ?? 0, ...days.map((d) => d.usd ?? 0)) || 1;
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
        <b>{d.usd === null ? (tokenSum(d.tokens) ? "price unknown" : usd(0)) : usd(d.usd)}</b>
        <span className="faint">{compact(tokenSum(d.tokens))} tokens</span>
      </figcaption>
      <div className="sc-plot" style={{ height }} onPointerLeave={() => setHover(null)}>
        {budget ? (
          <div className="sc-budget" style={{ bottom: `${(budget / max) * 100}%` }}>
            <span>Daily budget {usd(budget)}</span>
          </div>
        ) : null}
        {days.map((day, i) => {
          const h = day.usd === null ? 0 : (day.usd / max) * 100;
          const over = budget && day.usd !== null && day.usd > budget;
          return (
            <button
              type="button"
              key={day.date}
              className={`sc-col ${i === shown ? "on" : ""}`}
              style={{ left: `${i * w}%`, width: `${w}%` }}
              onPointerEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${dayLabel(day.date, { weekday: "long", month: "long", day: "numeric" })}: ${
                day.usd === null
                  ? tokenSum(day.tokens)
                    ? "price unknown"
                    : "no usage"
                  : usd(day.usd)
              }`}
            >
              {day.usd === null && tokenSum(day.tokens) > 0 ? (
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
    </figure>
  );
}
