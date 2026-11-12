import { useState } from "react";
import { type AlertConfig, QUIET_MAX_MINUTES } from "../../../shared/alerts.ts";
import { saveAlertConfig, useAlertConfig } from "../alerts.tsx";
import { Link, paths } from "../router.ts";

const canNotify = typeof Notification !== "undefined";

/** Alerts are per browser: saved here as soon as they change, never sent anywhere. */
export function AlertSettings({ dailyBudget }: { dailyBudget: number | null }) {
  const c = useAlertConfig();
  const [permission, setPermission] = useState(canNotify ? Notification.permission : "denied");
  const set = (patch: Partial<AlertConfig>) => saveAlertConfig({ ...c, ...patch });
  const [cost, setCost] = useState(String(c.cost.usd));
  const [quiet, setQuiet] = useState(String(c.quiet.minutes));
  const costOk = Number(cost) >= 0.01 && Number(cost) <= 100_000;
  const quietOk =
    Number.isInteger(Number(quiet)) && Number(quiet) >= 1 && Number(quiet) <= QUIET_MAX_MINUTES;

  const askSystem = async (on: boolean) => {
    if (on && canNotify && Notification.permission === "default") {
      setPermission(await Notification.requestPermission());
    }
    set({ system: on });
  };

  return (
    <section className="card" aria-labelledby="set-alerts">
      <h2 id="set-alerts">Alerts</h2>
      <p className="faint">
        Off until you turn them on. They show in this browser while Quoli is open, at most once per
        session for each kind, with the session title and project name only. Nothing is sent
        anywhere, and Quoli never stops an agent.
      </p>
      <ul className="alert-list">
        <li>
          <label className="check">
            <input
              type="checkbox"
              checked={c.cost.on}
              onChange={(e) => set({ cost: { ...c.cost, on: e.target.checked } })}
            />
            A live session costs more than
          </label>
          <span className="alert-value">
            $
            <input
              className="input tiny"
              inputMode="decimal"
              aria-label="Session cost threshold in USD"
              value={cost}
              aria-invalid={!costOk}
              onChange={(e) => {
                setCost(e.target.value);
                const n = Number(e.target.value);
                if (n >= 0.01 && n <= 100_000) set({ cost: { ...c.cost, usd: n } });
              }}
            />
          </span>
        </li>
        <li>
          <label className="check">
            <input
              type="checkbox"
              checked={c.budget.on}
              onChange={(e) => set({ budget: { on: e.target.checked } })}
            />
            Today's estimated spend reaches the daily budget
          </label>
          {dailyBudget === null && (
            <span className="faint">
              No daily budget is set. <Link to={paths.settings()}>Set one</Link>
            </span>
          )}
        </li>
        <li>
          <label className="check">
            <input
              type="checkbox"
              checked={c.loop.on}
              onChange={(e) => set({ loop: { on: e.target.checked } })}
            />
            A live session shows a possible loop
          </label>
        </li>
        <li>
          <label className="check">
            <input
              type="checkbox"
              checked={c.quiet.on}
              onChange={(e) => set({ quiet: { ...c.quiet, on: e.target.checked } })}
            />
            A live session has been quiet for
          </label>
          <span className="alert-value">
            <input
              className="input tiny"
              inputMode="numeric"
              aria-label={`Quiet minutes, 1 to ${QUIET_MAX_MINUTES}`}
              value={quiet}
              aria-invalid={!quietOk}
              onChange={(e) => {
                setQuiet(e.target.value);
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= QUIET_MAX_MINUTES)
                  set({ quiet: { ...c.quiet, minutes: n } });
              }}
            />
            minutes
          </span>
        </li>
        <li>
          <label className="check">
            <input
              type="checkbox"
              checked={c.ended.on}
              onChange={(e) => set({ ended: { on: e.target.checked } })}
            />
            A live session ends
          </label>
        </li>
      </ul>
      {(!costOk || !quietOk) && (
        <p className="form-error" role="alert">
          {!costOk
            ? "Enter a cost of at least $0.01."
            : `Enter whole minutes from 1 to ${QUIET_MAX_MINUTES}. A session with no event for 10 minutes is no longer live.`}
        </p>
      )}
      <div className="alert-system">
        <label className="check">
          <input
            type="checkbox"
            checked={c.system && permission === "granted"}
            disabled={!canNotify || permission === "denied"}
            onChange={(e) => askSystem(e.target.checked)}
          />
          Also show system notifications
        </label>
        <span className="faint">
          {!canNotify
            ? "This browser has no notifications."
            : permission === "denied"
              ? "Notifications are blocked for this site in the browser's settings."
              : "Otherwise alerts appear inside Quoli only."}
        </span>
      </div>
    </section>
  );
}
