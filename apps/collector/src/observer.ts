import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { readRepositoryHistory } from "../../../packages/repository/src/history";
import { captureRepository } from "../../../packages/repository/src/index";
import type { NormalizedEvent } from "../../../packages/schema/src/index";
import type { RepositorySnapshot } from "../../../packages/schema/src/repository";
import type { Store } from "../../../packages/storage/src/index";

function overlaps(a: string, b: string) {
  const path = relative(a, b);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}
function observationIdentity(snapshot: RepositorySnapshot) {
  // Compare only policy-sanitized observations; raw code hashes never become
  // persistent watcher fingerprints. IDs and capture time are not changes.
  const { id: _id, capturedAt: _at, ...state } = snapshot;
  // StoredSnapshot has additional scope fields; never compare those.
  return JSON.stringify({
    head: state.head,
    indexIdentity: state.indexIdentity,
    state: state.state,
    dirty: state.dirty,
    files: state.files,
    omitted: state.omitted,
    warnings: state.warnings,
  });
}

/** A non-overlapping, bounded sampler. It does not claim a lossless filesystem log. */
export class RepositoryObserver {
  private stopped = false;
  private active: Promise<void> | null = null;
  constructor(
    private readonly store: Store,
    private readonly dataDir: string,
  ) {}

  poll(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.active) return this.active;
    this.active = this.scan().finally(() => {
      this.active = null;
    });
    return this.active;
  }
  async stop() {
    this.stopped = true;
    await this.active;
  }
  private async scan() {
    for (const projectId of this.store.observationProjects()) {
      if (this.stopped) return;
      const project = this.store.project(projectId);
      const repository = this.store.repository(projectId);
      const lifecycle = this.store.lifecycle(projectId);
      if (!project || !repository || lifecycle.purgedAt) continue;
      if (lifecycle.paused) {
        this.store.updateObservation(projectId, "paused");
        continue;
      }
      let saving = false;
      try {
        this.store.applyRetention(projectId);
        const root = await realpath(repository.root);
        const data = await realpath(this.dataDir);
        if (root !== repository.root || overlaps(root, data) || overlaps(data, root))
          throw new Error("Unsafe root");
        const previous = this.store.latestObservedSnapshot(projectId);
        const previousEvent = this.store.latestRepositoryState(projectId);
        const previousState =
          previousEvent?.payload.kind === "repository_state" ? previousEvent.payload : null;
        const snapshot = await captureRepository(root, project.policy, {
          includeUntracked: repository.includeUntracked,
        });
        const state = await readRepositoryHistory(
          root,
          snapshot.head,
          previousState?.head ?? null,
          previousState === null,
        );
        // HEAD can move between the file capture and graph inspection. Mark the
        // sample racy rather than joining two distinct repository states.
        const verified = await readRepositoryHistory(root, snapshot.head, snapshot.head, false);
        if (
          verified.branch !== state.branch ||
          verified.transition === "unavailable" ||
          state.transition === "unavailable"
        )
          snapshot.state = "racy";
        const current = this.store.project(projectId);
        if (
          this.stopped ||
          !current ||
          this.store.lifecycle(projectId).epoch !== lifecycle.epoch ||
          this.store.lifecycle(projectId).paused ||
          this.store.lifecycle(projectId).purgedAt ||
          JSON.stringify(current.policy) !== JSON.stringify(project.policy)
        )
          continue;
        const sessionId = `repository-history-${snapshot.capturedAt.slice(0, 10)}`;
        if (
          previous &&
          previous.sessionId === sessionId &&
          observationIdentity(previous) === observationIdentity(snapshot) &&
          previousState?.branch === state.branch
        ) {
          this.store.updateObservation(projectId, "observing");
          continue;
        }
        const id = `repo_state_${randomUUID()}`;
        const event: NormalizedEvent = {
          schemaVersion: 1,
          id,
          deliveryId: id,
          projectId,
          sessionId,
          source: "repository",
          adapterVersion: "0.1.0",
          sourceLocator: "repository-poll/v1",
          producerId: "repository-observer-v1",
          promptId: null,
          toolId: null,
          requestId: null,
          sourceTime: snapshot.capturedAt,
          sourceSequence: null,
          policyVersion: 1,
          payload: state,
        };
        saving = true;
        const reason = this.store.snapshotSummaries(projectId, sessionId, 0, 1).total
          ? "checkpoint"
          : "baseline";
        this.store.appendSnapshot(projectId, sessionId, snapshot, reason, [event], lifecycle.epoch);
        this.store.applyRetention(projectId);
        this.store.updateObservation(projectId, "observing", true);
      } catch {
        // No raw paths, code, Git stderr or exception text enters status/logs.
        if (this.store.project(projectId))
          this.store.updateObservation(projectId, saving ? "blocked" : "unavailable");
      }
    }
  }
}

export function startRepositoryObserver(store: Store, dataDir: string, interval = 5000) {
  const observer = new RepositoryObserver(store, dataDir);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  async function tick() {
    try {
      await observer.poll();
    } catch {
      /* Storage failure must not terminate the local HTTP server. */
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, interval);
        timer.unref();
      }
    }
  }
  void tick();
  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await observer.stop();
    },
  };
}
