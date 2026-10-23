import { createHash } from "node:crypto";
import { type Content, defaultPolicy, eventSchema, type NormalizedEvent } from "@traceframe/schema";
import { defineAdapter } from "@traceframe/schema/adapter";
import { sanitizeContent } from "@traceframe/schema/privacy";

export const OPENCODE_VERSION = "2.0.32";
export const OPENCODE_EVENTS = {
  "session.created": "session_start",
  "session.inbox.enqueued": "prompt",
  "session.tool.called": "tool_call",
  "session.tool.success": "tool_result",
  "session.tool.failed": "tool_result",
  "session.step.ended": "usage",
  "session.step.failed": "usage",
} as const;

function identity(parts: unknown[]): string {
  return `oc-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32)}`;
}

export const openCodeAdapter = defineAdapter({
  id: "opencode-events",
  harness: "OpenCode",
  source: "opencode",
  producerId: "opencode-event-bridge-v1",
  adapterVersion: "0.1.0",
  sourceVersions: [OPENCODE_VERSION],
  eventMapping: OPENCODE_EVENTS,
  capabilities: {
    content: ["prompt", "tool", "code"],
    identifiers: ["session", "prompt", "tool", "request"],
    usage: true,
    sourceTime: true,
    fields: {
      plan: "unsupported",
      decision: "unsupported",
      approval: "unsupported",
      correction: "unsupported",
    },
  },
  failures: { status: "reported", exitCode: "unsupported", gaps: ["unsupported_source"] },
  delivery: "session_event_source_id",
  install: { mode: "reversible_project_hooks", settingsPath: ".opencode/plugins/quoli.js" },
  deliveryId: ({ sessionId, event, promptId }) => identity([sessionId, event, promptId]),
});

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sourceId(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : null;
}

function content(value: unknown, categories: Content["categories"]): Content {
  const raw = typeof value === "string" ? value : value == null ? null : JSON.stringify(value);
  return sanitizeContent(
    { text: raw, state: raw === null ? "unavailable" : "present", originalBytes: null, categories },
    { ...defaultPolicy, prompt: true, tool: true, code: true },
  );
}

const categories = { read: "Read", write: "Write", edit: "Edit", bash: "Bash" } as const;

/** Only the selected public event boundaries are accepted; reasoning is never mapped. */
export function normalizeOpenCode(raw: unknown, projectId: string): NormalizedEvent | null {
  const input = object(raw);
  const event = object(input.event);
  const data = object(event.data);
  const sessionId = sourceId(data.sessionID);
  const eventId = sourceId(event.id);
  if (!sessionId || !eventId || typeof event.type !== "string") return null;
  if (!Object.hasOwn(OPENCODE_EVENTS, event.type)) return null;
  const sourceVersion =
    typeof input.sourceVersion === "string" ? input.sourceVersion : "unreported";
  const id = openCodeAdapter.deliveryId({
    sessionId,
    event: event.type,
    promptId: eventId,
    toolId: null,
  });
  const base = {
    schemaVersion: 2 as const,
    id,
    deliveryId: id,
    projectId,
    sessionId,
    source: openCodeAdapter.source,
    sourceVersion,
    adapterId: openCodeAdapter.id,
    adapterVersion: openCodeAdapter.adapterVersion,
    producerId: openCodeAdapter.producerId,
    sourceLocator: `opencode:${event.type}:${eventId}`,
    sourceTime:
      typeof event.created === "number" &&
      Number.isFinite(event.created) &&
      Math.abs(event.created) <= 8.64e15
        ? new Date(event.created).toISOString()
        : null,
    sourceSequence: object(event.durable).seq ?? null,
    policyVersion: 1,
    promptId: null as string | null,
    toolId: null as string | null,
    requestId: null as string | null,
    tool: null as {
      rawName: string;
      category: "Read" | "Write" | "Edit" | "Bash" | "Other";
    } | null,
    activity: {
      turnId: null,
      parentSessionId: null as string | null,
      parentTurnId: null,
      childSessionId: null,
      childTurnId: null,
    },
    fieldCapabilities: {
      content: "available",
      plan: "unsupported",
      decision: "unsupported",
      approval: "unsupported",
      correction: "unsupported",
    },
    declared: { plan: null, decision: null, approval: null, correction: null },
  };
  let payload: NormalizedEvent["payload"] = { kind: "gap", reason: "unsupported_source" };
  const expectedVersion =
    event.type === "session.tool.success" || event.type === "session.tool.failed" ? 2 : 1;
  if (sourceVersion === OPENCODE_VERSION && object(event.durable).version === expectedVersion) {
    switch (event.type) {
      case "session.created":
        base.activity.parentSessionId = sourceId(data.parentID);
        payload = { kind: "session_start", content: content(null, ["prompt", "code"]) };
        break;
      case "session.inbox.enqueued": {
        const item = object(data.item);
        if (item.type !== "user") return null;
        base.promptId = sourceId(data.inboxID);
        if (!base.promptId) break;
        payload = {
          kind: "prompt",
          content: content(object(item.payload).text, ["prompt", "code"]),
        };
        break;
      }
      case "session.tool.called":
      case "session.tool.success":
      case "session.tool.failed": {
        if (
          typeof input.toolName !== "string" ||
          !input.toolName.length ||
          input.toolName.length > 200 ||
          typeof data.id !== "string" ||
          !data.id.length ||
          data.id.length > 100 ||
          !sourceId(data.assistantMessageID)
        )
          break;
        const category = Object.hasOwn(categories, input.toolName)
          ? categories[input.toolName as keyof typeof categories]
          : "Other";
        // Shared projections join by toolId, so a provider's reused ID needs request scope.
        base.toolId = identity(["tool", sessionId, data.assistantMessageID, data.id]);
        base.sourceLocator += `:${data.id}`;
        base.requestId = sourceId(data.assistantMessageID);
        base.tool = { rawName: input.toolName, category };
        if (event.type === "session.tool.called") {
          const args = object(data.input);
          const path = typeof args.filePath === "string" ? args.filePath : null;
          payload = {
            kind: "tool_call",
            toolName: category,
            path,
            content: content(args, ["tool", "code"]),
          };
        } else {
          const texts = Array.isArray(data.content)
            ? data.content
                .filter((part) => object(part).type === "text")
                .map((part) => object(part).text)
                .filter((text): text is string => typeof text === "string")
            : [];
          payload = {
            kind: "tool_result",
            toolName: category,
            content: content(
              event.type === "session.tool.failed"
                ? object(data.error).message
                : texts.length
                  ? texts.join("\n")
                  : null,
              ["tool", "code"],
            ),
            status: event.type === "session.tool.failed" ? "failure" : "success",
            exitCode: null,
          };
        }
        break;
      }
      case "session.step.ended":
      case "session.step.failed": {
        const model = object(input.model);
        const tokens = object(data.tokens);
        if (
          typeof model.id !== "string" ||
          typeof model.providerID !== "string" ||
          !/^[a-zA-Z0-9._-]{1,100}$/.test(model.id) ||
          !/^[a-zA-Z0-9._-]{1,100}$/.test(model.providerID) ||
          !sourceId(data.assistantMessageID) ||
          !data.tokens
        )
          break;
        const count = (value: unknown) =>
          typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
        base.requestId = sourceId(data.assistantMessageID);
        payload = {
          kind: "usage",
          model: model.id,
          provider: model.providerID,
          temporality: "request_delta",
          input: count(tokens.input),
          output: count(tokens.output),
          reasoning: count(tokens.reasoning),
          cacheRead: count(object(tokens.cache).read),
          cacheWrite: count(object(tokens.cache).write),
          // OpenCode computes cost from configured rates; it is not provider-reported spend.
          costUsdMicros: null,
        };
        break;
      }
    }
  }
  if (payload.kind === "gap") base.fieldCapabilities.content = "unsupported";
  const parsed = eventSchema.safeParse({ ...base, payload });
  return parsed.success ? parsed.data : null;
}
