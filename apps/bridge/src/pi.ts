import { createHash } from "node:crypto";
import type { Content, NormalizedEvent } from "@traceframe/schema";
import { defineAdapter } from "@traceframe/schema/adapter";
import { boundedText, hookContent } from "./normalize";

/**
 * Pi (pi-coding-agent) extension adapter.
 *
 * Pi exposes lifecycle events to a TypeScript extension. Quoli's generated
 * extension forwards only the extracted fields below, so no transcript, message
 * history, reasoning text or image bytes leave the process. The payload shapes
 * were recorded against Pi 0.75.3 with an isolated config directory and a local
 * OpenAI-compatible stub provider.
 */

export const PI_VERSION = "0.75.3";

/**
 * Envelope types the generated extension sends. One envelope maps to exactly one
 * observation kind: Pi reports one user message and one assistant usage record
 * per request, so they are separate boundaries rather than one shared event.
 */
export const PI_EVENTS = {
  session_start: "session_start",
  user_message: "prompt",
  tool_call: "tool_call",
  tool_result: "tool_result",
  assistant_message: "usage",
  session_end: "session_end",
} as const;

type PiEnvelope = {
  version?: unknown;
  sessionId?: unknown;
  type?: unknown;
  reason?: unknown;
  text?: unknown;
  timestamp?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  path?: unknown;
  isError?: unknown;
  model?: unknown;
  provider?: unknown;
  responseId?: unknown;
  usage?: unknown;
};

function identity(parts: unknown[]): string {
  return `pi-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32)}`;
}

export const piAdapter = defineAdapter({
  id: "pi-extension",
  harness: "Pi",
  source: "pi_extension",
  producerId: "pi-extension-bridge-v1",
  adapterVersion: "0.1.0",
  sourceVersions: [PI_VERSION],
  eventMapping: PI_EVENTS,
  capabilities: {
    content: ["prompt", "tool", "code"],
    // Pi reports a session id, tool call ids and a provider response id.
    identifiers: ["session", "tool", "request"],
    usage: true,
    sourceTime: true,
    fields: {
      plan: "unsupported",
      decision: "unsupported",
      approval: "unsupported",
      correction: "unsupported",
    },
  },
  failures: { status: "reported", exitCode: "unsupported", gaps: [] },
  delivery: "session_event_source_id",
  install: { mode: "reversible_project_hooks", settingsPath: ".pi/extensions/quoli.ts" },
  deliveryId: ({ sessionId, event, toolId, requestId }) =>
    identity([sessionId, event, toolId ?? null, requestId ?? null]),
});

/** Accepts only identifiers the observation schema can carry. */
export function piId(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : null;
}

/** Extracts `0.75.3` from the CLI version output, or null when unparseable. */
export function piSourceVersion(output: string | null | undefined): string | null {
  const match = /(\d+\.\d+\.\d+)/.exec(output ?? "");
  return match ? match[1] : null;
}

type ToolCategory = "Read" | "Write" | "Edit" | "Bash" | "Other";
const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  read: "Read",
  write: "Write",
  edit: "Edit",
  bash: "Bash",
};

function toolCategory(name: string): ToolCategory {
  return TOOL_CATEGORIES[name] ?? "Other";
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Message timestamps are the only per-message identifier Pi reports. */
function sourceTime(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 8.64e15)
    return null;
  return new Date(value).toISOString();
}

function timeId(value: unknown): string | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : null;
}

/**
 * Builds the observation for one extension envelope, or null when the envelope
 * carries nothing Quoli records.
 */
export function normalizePi(raw: unknown, projectId: string): NormalizedEvent | null {
  const input = record(raw) as PiEnvelope | undefined;
  const event = typeof input?.type === "string" ? input.type : "";
  if (!input || !Object.hasOwn(PI_EVENTS, event)) return null;
  const sessionId = piId(input.sessionId);
  if (!sessionId) return null;
  const toolId = piId(input.toolCallId);
  const rawName = typeof input.toolName === "string" ? input.toolName.trim().slice(0, 200) : "";
  const reason = typeof input.reason === "string" ? input.reason.slice(0, 40) : null;
  const category = rawName ? toolCategory(rawName) : null;
  const base = {
    schemaVersion: 2 as const,
    projectId,
    sessionId,
    source: piAdapter.source,
    sourceVersion:
      typeof input.version === "string" && /^[0-9A-Za-z][0-9A-Za-z._+-]{0,99}$/.test(input.version)
        ? input.version
        : "unreported",
    adapterId: piAdapter.id,
    adapterVersion: piAdapter.adapterVersion,
    producerId: piAdapter.producerId,
    sourceLocator: ["pi_extension", event, reason ?? (rawName || null)].filter(Boolean).join(":"),
    sourceTime: sourceTime(input.timestamp),
    sourceSequence: null,
    policyVersion: 1,
    promptId: null as string | null,
    toolId: null as string | null,
    // A provider response id when there is one; the message timestamp otherwise.
    requestId: piId(input.responseId) ?? timeId(input.timestamp),
    tool: null as { rawName: string; category: ToolCategory } | null,
    activity: {
      turnId: null,
      parentSessionId: null,
      parentTurnId: null,
      childSessionId: null,
      childTurnId: null,
    },
    fieldCapabilities: {
      content: "available" as const,
      plan: "unsupported" as const,
      decision: "unsupported" as const,
      approval: "unsupported" as const,
      correction: "unsupported" as const,
    },
    declared: { plan: null, decision: null, approval: null, correction: null },
  };
  const deliveryId = piAdapter.deliveryId({
    sessionId,
    event,
    promptId: null,
    toolId,
    requestId: base.requestId,
  });
  const content = (value: unknown, categories: Content["categories"]) =>
    hookContent(boundedText(value), value == null ? "unavailable" : "present", categories);
  const observed = { ...base, id: deliveryId, deliveryId };
  if (event === "session_start")
    return {
      ...observed,
      payload: { kind: "session_start", content: content(null, ["prompt", "code"]) },
    };
  if (event === "session_end")
    // Pi reports why the extension runtime stopped, not whether a turn finished.
    return { ...observed, payload: { kind: "session_end", reason: "completed" } };
  if (event === "user_message")
    return {
      ...observed,
      payload: { kind: "prompt", content: content(input.text, ["prompt", "code"]) },
    };
  if (event === "assistant_message") {
    const usage = record(input.usage);
    const model = piId(input.model);
    const inputTokens = count(usage?.input);
    const outputTokens = count(usage?.output);
    if (!usage || !model || inputTokens === null || outputTokens === null) return null;
    return {
      ...observed,
      payload: {
        kind: "usage",
        model,
        provider: piId(input.provider),
        input: inputTokens,
        output: outputTokens,
        cacheRead: count(usage.cacheRead),
        cacheWrite: count(usage.cacheWrite),
        temporality: "request_delta",
        // Pi computes cost from configured rates; it is not provider-reported spend.
        costUsdMicros: null,
      },
    };
  }
  if (!toolId || !rawName || !category) return null;
  const tool = { rawName, category };
  if (event === "tool_call")
    return {
      ...observed,
      toolId,
      tool,
      payload: {
        kind: "tool_call",
        toolName: category,
        content: content(input.text, ["tool", "code"]),
        path: typeof input.path === "string" ? input.path.slice(0, 1024) : null,
      },
    };
  if (event === "tool_result" && typeof input.isError === "boolean")
    return {
      ...observed,
      toolId,
      tool,
      payload: {
        kind: "tool_result",
        toolName: category,
        content: content(input.text, ["tool", "code"]),
        // Pi reports whether the tool failed, never a numeric exit code.
        exitCode: null,
        status: input.isError ? "failure" : "success",
      },
    };
  return null;
}
