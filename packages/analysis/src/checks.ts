import { createHash } from "node:crypto";
import type { Relationship, StoredEvent } from "@traceframe/schema";
import type {
  CheckObservation,
  CheckState,
  TestCounts,
  VerificationView,
} from "@traceframe/schema/checks";

/**
 * Deterministic projection of recorded checks.
 *
 * The projection reads retained observations only: it never executes a command,
 * never reads the filesystem and never treats captured text as an instruction.
 * Every emitted fact is nullable and every relation carries a rule version and
 * an explicit uncertainty.
 */

export const CHECK_RULE = "recorded-command-check/v1";
export const PARSER_RULE = "fixture-test-counts/v1";
export const FILE_BEFORE_RULE = "prior-file-reference/v1";
export const FILE_AFTER_RULE = "post-check-file-reference/v1";
export const WINDOW_RULE = "snapshot-window/v1";

const MAX_OUTPUT = 65_536;
const MAX_FILES = 50;
const COMMAND_TOOLS = new Set(["Bash"]);
const FILE_TOOLS = new Set(["Read", "Write", "Edit"]);

const UNKNOWN_COUNTS: TestCounts = {
  supported: false,
  failure: false,
  passed: null,
  failed: null,
  total: null,
};

/**
 * Narrow parser for the recorded fixture output format only.
 *
 * It recognises a "Tests: N failed, M passed" summary line and the FAIL/×
 * failure markers of that format. Any other output stays unsupported instead of
 * being guessed at.
 */
export function parseTestOutput(text: string | null): TestCounts {
  if (!text) return { ...UNKNOWN_COUNTS };
  const body = text.length > MAX_OUTPUT ? text.slice(-MAX_OUTPUT) : text;
  const summary = body.split("\n").find((line) => line.includes("Tests:")) ?? "";
  const passedMatch = /(\d+)\s+passed/.exec(summary);
  const failedMatch = /(\d+)\s+failed/.exec(summary);
  const supported = Boolean(passedMatch || failedMatch);
  const marker = /^\s*(FAIL\b|×|✗)/m.test(body);
  if (!supported) return { ...UNKNOWN_COUNTS, failure: marker };
  const passed = passedMatch ? Number(passedMatch[1]) : null;
  const failed = failedMatch ? Number(failedMatch[1]) : 0;
  return {
    supported: true,
    failure: failed > 0 || marker,
    passed,
    failed,
    total: passed === null ? null : passed + failed,
  };
}

function order(a: StoredEvent, b: StoredEvent): number {
  if (a.sourceTime && b.sourceTime && a.sourceTime !== b.sourceTime)
    return a.sourceTime < b.sourceTime ? -1 : 1;
  return a.sequence - b.sequence;
}

function relation(
  rule: string,
  subjectId: string,
  objectId: string,
  evidenceIds: string[],
  uncertainty: string,
  basis: Relationship["basis"] = "derived",
): Relationship {
  return {
    id: `rel-${createHash("sha256")
      .update(JSON.stringify([rule, subjectId, objectId]))
      .digest("hex")
      .slice(0, 24)}`,
    subjectId,
    objectId,
    basis,
    evidenceIds,
    rule,
    uncertainty,
  };
}

function state(counts: TestCounts, exitCode: number | null, status: string): CheckState {
  if (exitCode !== null && exitCode !== 0) return "failed";
  if (status === "failure" || status === "interrupted") return "failed";
  if (counts.failure) return "failed";
  if (counts.supported && !counts.failure && (counts.passed ?? 0) > 0) return "passed";
  return "unknown_output";
}

const STATE_TEXT: Record<CheckState, string> = {
  passed:
    "The recorded command exited 0 and its summary line reported no failures. This does not establish that the feature works.",
  failed:
    "A failure was recorded for this command. The recorded result does not show which behaviour failed or that the change is wrong.",
  unknown_output:
    "The recorded output format is not recognised, so test counts are unknown. An exit code alone does not establish that checks passed.",
  missing_result:
    "The command was recorded without a result. No exit code or test counts are known for this check.",
};

/**
 * Projects recorded checks, the paths referenced around them and the relations
 * that bind them. Rebuilding the projection from the same observations yields the
 * same result and never alters the retained history.
 */
export function verification(events: StoredEvent[]): VerificationView {
  const ordered = [...events].sort(order);
  const relations: Relationship[] = [];
  const checks: CheckObservation[] = [];
  const fileReferences = ordered
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        event.payload.kind === "tool_call" &&
        event.payload.path !== null &&
        FILE_TOOLS.has(event.payload.toolName),
    );
  const snapshots = ordered
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.payload.kind === "repository_snapshot");
  const calls = ordered
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        event.payload.kind === "tool_call" && COMMAND_TOOLS.has(event.payload.toolName),
    );

  for (const { event: call, index: callIndex } of calls) {
    if (call.payload.kind !== "tool_call") continue;
    const results = ordered
      .map((event, index) => ({ event, index }))
      .filter(
        ({ event }) =>
          event.payload.kind === "tool_result" &&
          event.toolId !== null &&
          event.toolId === call.toolId &&
          event.projectId === call.projectId &&
          event.sessionId === call.sessionId,
      );
    const observations: { event: StoredEvent; index: number }[] = results.length
      ? results
      : [{ event: call, index: callIndex }];
    for (const observation of observations) {
      const result = observation.event.payload.kind === "tool_result" ? observation.event : null;
      const counts = parseTestOutput(
        result?.payload.kind === "tool_result" ? result.payload.content.text : null,
      );
      const exitCode = result?.payload.kind === "tool_result" ? result.payload.exitCode : null;
      const status = result?.payload.kind === "tool_result" ? result.payload.status : "unknown";
      const checkState = result ? state(counts, exitCode, status) : "missing_result";
      const before = fileReferences.filter((file) => file.index < callIndex);
      const after = fileReferences.filter((file) => file.index > observation.index);
      const references = [
        ...before.map((file) => ({
          path: file.event.payload.kind === "tool_call" ? (file.event.payload.path ?? "") : "",
          eventId: file.event.id,
          position: "before" as const,
        })),
        ...after.map((file) => ({
          path: file.event.payload.kind === "tool_call" ? (file.event.payload.path ?? "") : "",
          eventId: file.event.id,
          position: "after" as const,
        })),
      ];
      // One chip per path and position; every reference still emits its own relation.
      const files = references.filter(
        (file, index) =>
          references.findIndex(
            (other) => other.path === file.path && other.position === file.position,
          ) === index,
      );
      const windowBefore = snapshots.filter((snap) => snap.index < callIndex).at(-1) ?? null;
      const windowAfter = snapshots.find((snap) => snap.index > observation.index) ?? null;
      const dirtyEvent = windowAfter ?? windowBefore;
      const dirty =
        dirtyEvent?.event.payload.kind === "repository_snapshot"
          ? dirtyEvent.event.payload.dirty
          : null;
      const id = result?.id ?? call.id;
      const evidenceIds = [call.id, result?.id].filter((value): value is string => Boolean(value));
      const notes: string[] = [];
      if (after.length)
        notes.push(
          "A path was referenced after this result, so the recorded outcome may not cover the later content.",
        );
      if (!windowBefore && !windowAfter)
        notes.push(
          "No repository capture bounds this check, so the files it covered cannot be established.",
        );
      else if (dirty === true)
        notes.push(
          "A capture in this window reported a dirty working tree, so concurrent edits cannot be excluded.",
        );
      checks.push({
        id,
        callId: call.id,
        resultId: result?.id ?? null,
        command:
          call.payload.kind === "tool_call" && call.payload.content.text !== null
            ? call.payload.content.text.slice(0, 1024)
            : null,
        commandObserved:
          call.payload.kind === "tool_call" &&
          call.payload.content.state === "present" &&
          call.payload.content.text !== null,
        resultObserved: Boolean(result),
        exitCode,
        status,
        counts,
        state: checkState,
        files,
        stale: after.length > 0,
        window: {
          before: windowBefore?.event.id ?? null,
          after: windowAfter?.event.id ?? null,
          dirty,
        },
        evidenceIds,
        rule: CHECK_RULE,
        uncertainty: [STATE_TEXT[checkState], ...notes].join(" "),
      });
      for (const file of references.slice(0, MAX_FILES)) {
        if (file.position === "before")
          relations.push(
            relation(
              FILE_BEFORE_RULE,
              file.eventId,
              id,
              [file.eventId, ...evidenceIds],
              "The path was referenced before the recorded check. Reference order does not establish that the check covered the file, or who changed it.",
            ),
          );
        else
          relations.push(
            relation(
              FILE_AFTER_RULE,
              id,
              file.eventId,
              [file.eventId, ...evidenceIds],
              "The path was referenced after the recorded check, so the recorded outcome may not cover it.",
            ),
          );
      }
      const windowEvent = windowBefore ?? windowAfter;
      if (windowEvent)
        relations.push(
          relation(
            WINDOW_RULE,
            windowEvent.event.id,
            id,
            [windowEvent.event.id, ...evidenceIds],
            "Captures bound when the check was recorded. They do not establish authorship or that the check covered the captured files.",
          ),
        );
    }
  }
  return {
    checks,
    relations,
    rule: CHECK_RULE,
    uncertainty:
      "Recorded observations only. A check result does not establish feature correctness, file authorship, or that no other verification happened.",
  };
}
