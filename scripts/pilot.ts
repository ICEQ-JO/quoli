import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { demoEvents, demoPolicy } from "../fixtures/demo";
import { demoSnapshots } from "../fixtures/repository";
import { compareSnapshots } from "../packages/analysis/src/diff";
import {
  changeMap,
  reconcile,
  relationships,
  usage,
  verification,
} from "../packages/analysis/src/index";
import { Store } from "../packages/storage/src/index";

/**
 * Fixture-only pilot validation.
 *
 * It exercises the whole local flow without a Claude account, a network call
 * or a paid API, and records the baseline timing and memory of the bounded
 * history. It never publishes anything.
 */

const checks: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function stored(events = demoEvents()) {
  return events.map((event, index) => ({
    ...event,
    sequence: index + 1,
    receivedAt: "2026-10-22T10:00:00.000Z",
  }));
}

function seed(store: Store) {
  store.registerProject("demo-quoli", "quoli", true, demoPolicy);
  const accepted = store.append(demoEvents());
  for (const { sessionId, reason, snapshot } of demoSnapshots())
    store.appendSnapshot("demo-quoli", sessionId, snapshot, reason);
  return accepted;
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-pilot-"));
  const started = performance.now();
  try {
    const store = new Store(join(dir, "pilot.sqlite"));
    const accepted = seed(store);
    check("fixture import", accepted.accepted > 0, `${accepted.accepted} observations`);

    const session = "session-cache";
    const events = store.allEvents("demo-quoli", session);
    check("retained observations", events.length > 0, `${events.length} observations`);

    const usageView = usage(events);
    check(
      "reported usage",
      usageView.input !== null && usageView.requests > 0,
      `${usageView.requests} requests`,
    );

    const verificationView = verification(events);
    const states = verificationView.checks.map((entry) => entry.state);
    check(
      "recorded checks",
      states.includes("failed") && states.includes("passed") && states.includes("missing_result"),
      states.join(", "),
    );
    check(
      "uncertainty is explicit",
      verificationView.checks.every((entry) => entry.uncertainty.length > 0),
    );

    const links = relationships(events);
    check("explicit relationships", links.length > 0, `${links.length} links`);

    const captures = store.snapshots("demo-quoli", session);
    const before = captures.find((capture) => capture.reason === "baseline");
    const after = captures.find((capture) => capture.reason === "checkpoint");
    check("repository captures", Boolean(before && after), `${captures.length} captures`);
    if (before && after) {
      const comparison = compareSnapshots(before, after);
      const changed = comparison.files.filter((file) => file.status !== "unchanged");
      check("captured diff", changed.length > 0, `${changed.length} changed paths`);
      const map = changeMap({
        files: comparison.files.map((file) => ({
          id: file.id,
          path: file.path,
          status: file.status,
          uncertainty: file.uncertainty,
          evidenceIds: [before.eventId, after.eventId],
        })),
        checks: verificationView.checks,
        beforeId: before.id,
        afterId: after.id,
      });
      check(
        "change map",
        map.nodes.length > 0 && map.edges.length > 0,
        `${map.nodes.length} nodes, ${map.edges.length} edges`,
      );
      check("map caps", map.nodes.length <= map.caps.nodes && map.edges.length <= map.caps.edges);
    }

    const reconciliation = reconcile(events, usageView);
    check(
      "reconciliation",
      reconciliation.tools.length > 0,
      `${reconciliation.tools.length} joined tools`,
    );

    // Deletion removes the project evidence and stops capture.
    const purged = store.purgeProject("demo-quoli");
    check(
      "deletion",
      purged.removed.events > 0 && store.allEvents("demo-quoli", session).length === 0,
      `${purged.removed.events} observations removed`,
    );
    let blocked = false;
    try {
      store.append(demoEvents());
    } catch {
      blocked = true;
    }
    check("deletion blocks stale producers", blocked);
    store.close();

    // A bounded history pages without loading everything at once.
    const big = new Store(join(dir, "large.sqlite"));
    big.registerProject("demo-quoli", "quoli", true, demoPolicy);
    const batch = 1000;
    let total = 0;
    for (let index = 0; index < 10; index++) {
      const events = demoEvents().map((event, offset) => ({
        ...event,
        id: `bulk-${index}-${offset}`,
        deliveryId: `bulk-${index}-${offset}`,
        sessionId: `bulk-session-${index}`,
      }));
      total += big.append(events).accepted;
    }
    const pageStarted = performance.now();
    let cursor = 0;
    let pages = 0;
    let seen = 0;
    for (;;) {
      const page = big.events("demo-quoli", "bulk-session-0", cursor, 8);
      pages++;
      seen += page.events.length;
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    const pageMs = performance.now() - pageStarted;
    check(
      "bounded pagination",
      seen === 29,
      `${pages} pages for ${seen} observations of ${total} stored`,
    );
    big.close();

    const elapsed = performance.now() - started;
    const size = existsSync(join(dir, "pilot.sqlite"))
      ? statSync(join(dir, "pilot.sqlite")).size
      : 0;
    console.log("");
    console.log(
      `Baseline: ${Math.round(elapsed)} ms for the whole run, ${pageMs.toFixed(1)} ms for ${pages} pages, ${size} bytes of pilot store.`,
    );
    const failed = checks.filter((entry) => !entry.ok);
    console.log(`${checks.length - failed.length}/${checks.length} checks passed.`);
    if (failed.length) process.exitCode = 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

await main();
