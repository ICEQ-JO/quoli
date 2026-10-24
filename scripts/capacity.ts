import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { capacityEvents } from "../fixtures/capacity";
import { demoPolicy } from "../fixtures/demo";
import {
  activity,
  reconcile,
  relationships,
  usage,
  verification,
} from "../packages/analysis/src/index";
import { Store } from "../packages/storage/src/index";

const dir = mkdtempSync(join(tmpdir(), "quoli-capacity-"));
try {
  for (const shape of ["long", "wide"] as const) {
    const path = join(dir, `${shape}.sqlite`);
    const store = new Store(path);
    try {
      store.registerProject("capacity", "Synthetic capacity");
      const events = capacityEvents(10000, shape);
      const timed = <T>(fn: () => T) => {
        const start = performance.now();
        const value = fn();
        return { value, ms: +(performance.now() - start).toFixed(2) };
      };
      const ingest = timed(() => {
        for (let i = 0; i < events.length; i += 100) store.append(events.slice(i, i + 100));
      });
      assert.throws(
        () => store.append([{ ...events[0], id: "overflow", deliveryId: "overflow" }]),
        /storage limit/,
      );
      const listing = timed(() => store.sessions("capacity"));
      const counts = timed(() => store.sessionCounts("capacity"));
      const summary = timed(() => {
        const retained = store.allEvents("capacity", "root");
        const u = usage(retained);
        return {
          usage: u,
          relationships: relationships(retained),
          activity: activity(retained),
          verification: verification(retained),
          reconciliation: reconcile(retained, u),
        };
      });
      const tree = timed(() =>
        activity(
          events.map((e, i) => ({ ...e, sequence: i + 1, receivedAt: "2026-10-24T00:00:00.000Z" })),
        ),
      );
      console.log(
        JSON.stringify({
          shape,
          events: events.length,
          ingestMs: ingest.ms,
          listMs: listing.ms,
          countsMs: counts.ms,
          summaryMs: summary.ms,
          fullTreeMs: tree.ms,
          payloadBytes: store.usage("capacity").bytes,
          databaseAndWalBytes: readdirSync(dir)
            .filter((n) => n.startsWith(`${shape}.sqlite`))
            .reduce((n, file) => n + statSync(join(dir, file)).size, 0),
          maxRssMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1),
        }),
      );
    } finally {
      store.close();
    }
  }
  const bytes = new Store(join(dir, "bytes.sqlite"));
  try {
    bytes.registerProject("capacity", "Synthetic byte cap", false, demoPolicy);
    const start = performance.now();
    let artifacts = 0;
    const cap = 50 * 1024 * 1024;
    let used = 0;
    while (cap - used > 128) {
      bytes.artifact(
        "capacity",
        `fill-${artifacts++}`,
        "x".repeat(Math.min(65536, cap - used - 128)),
      );
      used = bytes.usage("capacity").bytes;
    }
    assert.throws(() => bytes.append(capacityEvents(1)), /storage limit/);
    console.log(
      JSON.stringify({
        shape: "bytes",
        payloadBytes: bytes.usage("capacity").bytes,
        artifacts,
        fillMs: +(performance.now() - start).toFixed(2),
        maxRssMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1),
      }),
    );
  } finally {
    bytes.close();
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
