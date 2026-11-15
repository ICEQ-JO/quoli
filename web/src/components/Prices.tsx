import { useEffect, useState } from "react";
import type { PriceTable } from "../../../shared/model.ts";
import { api, useData } from "../api.ts";
import { ago } from "../format.ts";
import { ErrorState, Loading } from "./ui.tsx";

const FIELDS = ["input", "output", "cacheRead", "cacheWrite"] as const;
const LABEL: Record<(typeof FIELDS)[number], string> = {
  input: "Input",
  output: "Output",
  cacheRead: "Cache read",
  cacheWrite: "Cache write",
};

/** A row being edited: numbers stay strings until saved so partial typing is not lost. */
interface Row {
  key: number;
  model: string;
  input: string;
  output: string;
  cacheRead: string;
  cacheWrite: string;
}

let nextKey = 1;
const toRows = (t: PriceTable): Row[] =>
  t.prices.map((p) => ({
    key: nextKey++,
    model: p.model,
    input: String(p.input),
    output: String(p.output),
    cacheRead: String(p.cacheRead),
    cacheWrite: String(p.cacheWrite),
  }));

const sameRows = (a: Row[], b: Row[]) =>
  a.length === b.length &&
  a.every((r, i) => r.model === b[i].model && FIELDS.every((f) => r[f] === b[i][f]));

export function PricesSection() {
  const [table, refresh, loadError] = useData("prices", api.prices);
  const [rows, setRows] = useState<Row[]>([]);
  const [version, setVersion] = useState("");
  const [base, setBase] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [edited, setEdited] = useState(false);

  const adopt = (t: PriceTable) => {
    const r = toRows(t);
    setRows(r);
    setBase(r);
    setVersion(t.version);
    setEdited(t.edited ?? false);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: adopt only sets state
  useEffect(() => {
    if (table) adopt(table);
  }, [table]);

  const loaded = !!table;
  useEffect(() => {
    if (loaded && location.hash === "#prices")
      document.getElementById("prices")?.scrollIntoView({ block: "start" });
  }, [loaded]);

  const dirty = !!table && !sameRows(rows, base);
  const edit = (key: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setMessage(null);
  };
  const invalidNumber = (v: string) =>
    v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) < 0;
  const clientInvalid = rows.some(
    (r) => !r.model.trim() || FIELDS.some((f) => invalidNumber(r[f])),
  );

  // Search narrows what is shown; every row is still saved (#40). New, empty rows always show.
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => !r.model.trim() || r.model.toLowerCase().includes(q)) : rows;

  const save = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api.savePrices({
        version: version || "custom",
        currency: "USD",
        prices: rows.map((r) => ({
          model: r.model.trim(),
          input: Number(r.input),
          output: Number(r.output),
          cacheRead: Number(r.cacheRead),
          cacheWrite: Number(r.cacheWrite),
        })),
      });
      adopt(saved);
      setMessage("Saved. Every session was re-priced.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const reset = async () => {
    if (
      !window.confirm(
        dirty
          ? "Replace your prices with the built-in defaults? Your unsaved changes and your saved prices will be lost."
          : "Replace your prices with the built-in defaults? Your saved prices will be lost.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      adopt(await api.resetPrices());
      setMessage("Reset to the built-in defaults.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  return (
    <section className="card" aria-labelledby="prices-h" id="prices">
      <h2 id="prices-h">
        Prices <span className="faint">{table ? table.version : ""}</span>
      </h2>
      <p className="faint">
        USD per million tokens. A model id matches exactly or as a prefix (date-suffixed ids). Costs
        are estimates, not invoices.
      </p>
      <LivePrices />
      {table && (
        <div className="price-source">
          <p>
            <b>This table:</b>{" "}
            {edited ? "your own prices (saved by you)" : "the built-in list prices"}.
          </p>
          <p className="faint">
            Which price a session uses:{" "}
            {edited
              ? "your row for the model, else a live price from models.dev (when on), else none (unpriced)."
              : "a live price from models.dev (when on), else this built-in row, else none (unpriced). Saving your own prices puts your rows first."}
          </p>
        </div>
      )}
      {!table && (loadError ? <ErrorState message={loadError} retry={refresh} /> : <Loading />)}
      {table && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!clientInvalid) save();
          }}
        >
          <div className="price-search">
            <label htmlFor="price-q" className="sr-only">
              Find a model
            </label>
            <input
              id="price-q"
              className="input"
              type="search"
              placeholder="Find a model, e.g. sonnet or gpt-5"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <span className="faint" aria-live="polite">
              {q ? `${shown.length} of ${rows.length} models` : `${rows.length} models`}
            </span>
          </div>
          <div className="price-wrap">
            <table className="price-table">
              <caption className="sr-only">Model prices in USD per million tokens</caption>
              <thead>
                <tr>
                  <th scope="col">Model id</th>
                  {FIELDS.map((f) => (
                    <th scope="col" className="num" key={f}>
                      {LABEL[f]}
                    </th>
                  ))}
                  <th scope="col">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.key}>
                    <td>
                      <input
                        className="input mono"
                        value={r.model}
                        aria-label={`Model id, row ${i + 1}`}
                        title={r.model}
                        spellCheck={false}
                        aria-invalid={!r.model.trim()}
                        onChange={(e) => edit(r.key, { model: e.target.value })}
                      />
                    </td>
                    {FIELDS.map((f) => (
                      <td key={f}>
                        <input
                          className="input num-in"
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          value={r[f]}
                          aria-label={`${LABEL[f]} price for ${r.model || `row ${i + 1}`}`}
                          aria-invalid={invalidNumber(r[f])}
                          onChange={(e) => edit(r.key, { [f]: e.target.value })}
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="btn danger sm"
                        aria-label={`Remove ${r.model || `row ${i + 1}`}`}
                        onClick={() => {
                          setRows((rs) => rs.filter((x) => x.key !== r.key));
                          setMessage(null);
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length > 0 && shown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="faint">
                      No model matches “{query.trim()}”.
                    </td>
                  </tr>
                )}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="faint">
                      No prices. Every model will show as unpriced.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="form-foot">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setQuery("");
                setRows((rs) => [
                  ...rs,
                  {
                    key: nextKey++,
                    model: "",
                    input: "0",
                    output: "0",
                    cacheRead: "0",
                    cacheWrite: "0",
                  },
                ]);
              }}
            >
              Add model
            </button>
            {dirty && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  setRows(base);
                  setMessage(null);
                }}
              >
                Discard changes
              </button>
            )}
            <button type="button" className="btn" disabled={busy} onClick={reset}>
              Reset to defaults
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={busy || !dirty || clientInvalid}
            >
              {busy ? "Working…" : "Save prices"}
            </button>
            {dirty && !clientInvalid && !busy && (
              <span className="price-dirty" role="status">
                Unsaved changes
              </span>
            )}
            {clientInvalid && dirty && (
              <span className="faint">
                Every row needs a model id and four numbers of 0 or more.
              </span>
            )}
            {message && (
              <span className="ok" role="status">
                {message}
              </span>
            )}
            {error && (
              <span className="form-error" role="alert">
                {error}
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * Live prices from models.dev: on by default, fetched once a day, used for models this table does
 * not price (and, while the table is the built-in one, in place of its older rows).
 */
function LivePrices() {
  const [status, refresh] = useData("live-prices", api.livePrices);
  const [busy, setBusy] = useState(false);
  if (!status) return null;
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await api.saveSettings({ livePrices: on });
    } catch {}
    // The first fetch runs in the background; look again once it has had time to finish.
    refresh();
    if (on) setTimeout(refresh, 4000);
    setBusy(false);
  };
  return (
    <div className="live-prices">
      <label className="check">
        <input
          type="checkbox"
          checked={status.enabled}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
        />
        Use current prices from{" "}
        <a href="https://models.dev" target="_blank" rel="noreferrer">
          models.dev
        </a>
      </label>
      <p className="faint">
        {status.enabled && status.fetchedAt
          ? `${status.models} models, updated ${ago(status.fetchedAt)}. `
          : status.enabled
            ? "Not fetched yet. "
            : ""}
        Checked once a day with a plain request that sends nothing about you. Until you save your
        own prices below, live prices are used wherever they exist; after that your rows win and
        live prices fill in the models you don't list.
      </p>
      {status.enabled && status.error && (
        <p className="form-error" role="alert">
          Last update failed ({status.error}); the previous prices stay in use.
        </p>
      )}
    </div>
  );
}
