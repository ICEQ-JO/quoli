import { z } from "zod";

export const MAX_BODY = 1_048_576;
export const MAX_FIELD = 65_536;
export const safeId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const categorySchema = z.enum(["prompt", "tool", "code"]);
export const contentSchema = z
  .object({
    text: z.string().max(MAX_BODY).nullable(),
    state: z.enum([
      "present",
      "disabled",
      "redacted",
      "truncated",
      "unavailable",
      "unsupported",
      "malformed",
    ]),
    originalBytes: z.number().int().nonnegative().nullable(),
    categories: z.array(categorySchema).min(1).max(3),
  })
  .strict();
export type Content = z.infer<typeof contentSchema>;
export const policySchema = z
  .object({
    version: z.literal(1),
    prompt: z.boolean(),
    tool: z.boolean(),
    code: z.boolean(),
    maxFieldBytes: z.number().int().min(64).max(MAX_FIELD),
    excludedPaths: z.array(z.string().max(200)).max(100),
  })
  .strict();
export type CapturePolicy = z.infer<typeof policySchema>;
export const defaultPolicy: CapturePolicy = {
  version: 1,
  prompt: false,
  tool: false,
  code: false,
  maxFieldBytes: MAX_FIELD,
  excludedPaths: [".env", ".git", "node_modules", "credentials", "secrets"],
};
const toolName = z.enum(["Read", "Write", "Edit", "Bash", "Other"]);
export const toolCategorySchema = toolName;
const version = z.string().regex(/^[0-9A-Za-z][0-9A-Za-z._+-]{0,99}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
export const payloadSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("repository_state"),
      head: z
        .string()
        .regex(/^[a-f0-9]{40,64}$/)
        .nullable(),
      previousHead: z
        .string()
        .regex(/^[a-f0-9]{40,64}$/)
        .nullable(),
      branch: z.string().max(1024).nullable(),
      transition: z.enum(["initial", "unchanged", "fast_forward", "diverged", "unavailable"]),
      commits: z.array(z.string().regex(/^[a-f0-9]{40,64}$/)).max(100),
      omitted: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("repository_snapshot"),
      snapshotId: safeId,
      reason: z.enum(["baseline", "checkpoint"]),
      state: z.enum(["observed", "racy"]),
      dirty: z.boolean().nullable(),
    })
    .strict(),
  z.object({ kind: z.literal("session_start"), content: contentSchema }).strict(),
  z
    .object({ kind: z.literal("session_end"), reason: z.enum(["completed", "interrupted"]) })
    .strict(),
  z.object({ kind: z.literal("prompt"), content: contentSchema }).strict(),
  z
    .object({
      kind: z.literal("tool_call"),
      toolName,
      content: contentSchema,
      path: z.string().max(1024).nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("tool_result"),
      toolName,
      content: contentSchema,
      exitCode: z.number().int().min(-255).max(255).nullable(),
      status: z.enum(["success", "failure", "interrupted", "unknown"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("usage"),
      input: count,
      output: count,
      cacheRead: count,
      cacheWrite: count,
      model: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
      temporality: z.enum(["request_delta", "cumulative", "context_sample"]),
      // Optional additions: absent means the source did not report the field.
      provider: z
        .string()
        .regex(/^[a-zA-Z0-9._-]{1,100}$/)
        .nullable()
        .optional(),
      reasoning: count.optional(),
      costUsdMicros: count.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("gap"),
      reason: z.enum([
        "missing_result",
        "capture_disabled",
        "late_arrival",
        "missing_end",
        "unsupported_source",
      ]),
    })
    .strict(),
]);
const v1EventSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: safeId,
    deliveryId: safeId,
    projectId: safeId,
    sessionId: safeId,
    source: z.enum(["synthetic", "claude_hook", "claude_otel", "repository"]),
    adapterVersion: z.literal("0.1.0"),
    sourceLocator: z.string().max(200).nullable(),
    producerId: safeId,
    promptId: safeId.nullable(),
    toolId: safeId.nullable(),
    requestId: safeId.nullable(),
    sourceTime: z.iso.datetime().nullable(),
    sourceSequence: count,
    policyVersion: z.literal(1),
    payload: payloadSchema,
  })
  .strict();

const capabilityStateSchema = z.enum(["available", "disabled", "unsupported", "unavailable"]);
export const fieldCapabilitiesSchema = z
  .object({
    content: capabilityStateSchema,
    plan: capabilityStateSchema,
    decision: capabilityStateSchema,
    approval: capabilityStateSchema,
    correction: capabilityStateSchema,
  })
  .strict();
export type FieldCapabilities = z.infer<typeof fieldCapabilitiesSchema>;

const declaredSchema = z
  .object({
    plan: contentSchema.nullable(),
    decision: contentSchema.nullable(),
    approval: contentSchema.nullable(),
    correction: contentSchema.nullable(),
  })
  .strict();

const v2EventSchema = z
  .object({
    schemaVersion: z.literal(2),
    id: safeId,
    deliveryId: safeId,
    projectId: safeId,
    sessionId: safeId,
    source: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
    sourceVersion: version,
    adapterId: safeId,
    adapterVersion: version,
    sourceLocator: z.string().max(200).nullable(),
    producerId: safeId,
    promptId: safeId.nullable(),
    toolId: safeId.nullable(),
    requestId: safeId.nullable(),
    sourceTime: z.iso.datetime().nullable(),
    sourceSequence: count,
    policyVersion: z.number().int().positive(),
    tool: z
      .object({ rawName: z.string().min(1).max(200), category: toolCategorySchema })
      .strict()
      .nullable(),
    activity: z
      .object({
        turnId: safeId.nullable(),
        parentSessionId: safeId.nullable(),
        parentTurnId: safeId.nullable(),
        childSessionId: safeId.nullable(),
        childTurnId: safeId.nullable(),
      })
      .strict(),
    fieldCapabilities: fieldCapabilitiesSchema,
    declared: declaredSchema,
    payload: payloadSchema,
  })
  .strict()
  .superRefine((event, ctx) => {
    for (const field of ["plan", "decision", "approval", "correction"] as const) {
      if (event.fieldCapabilities[field] !== "available" && event.declared[field] !== null)
        ctx.addIssue({
          code: "custom",
          path: ["declared", field],
          message: `${field} content requires an available capability`,
        });
    }
    if (
      (event.payload.kind === "tool_call" || event.payload.kind === "tool_result") !==
      (event.tool !== null)
    )
      ctx.addIssue({
        code: "custom",
        path: ["tool"],
        message: "Tool metadata is required only for tool observations",
      });
    if (
      event.fieldCapabilities.content !== "available" &&
      "content" in event.payload &&
      event.payload.content.text !== null
    )
      ctx.addIssue({
        code: "custom",
        path: ["payload", "content"],
        message: "Captured content requires an available capability",
      });
  });

export type V1NormalizedEvent = z.output<typeof v1EventSchema>;
export type V2NormalizedEvent = z.output<typeof v2EventSchema>;
export type NormalizedEvent = V1NormalizedEvent | V2NormalizedEvent;
/** Reads immutable v1 evidence alongside the extensible v2 envelope. */
export const eventSchema: z.ZodType<NormalizedEvent> = z.union([v1EventSchema, v2EventSchema]);
type WithReceipt<T> = T & { sequence: number; receivedAt: string };
export type V1StoredEvent = WithReceipt<V1NormalizedEvent>;
export type V2StoredEvent = WithReceipt<V2NormalizedEvent>;
export type StoredEvent = V1StoredEvent | V2StoredEvent;
export const batchSchema = z.object({ events: z.array(eventSchema).min(1).max(100) }).strict();
export const relationshipSchema = z
  .object({
    id: safeId,
    subjectId: safeId,
    objectId: safeId,
    basis: z.enum(["recorded", "derived", "inferred"]),
    evidenceIds: z.array(safeId).min(1).max(100),
    rule: z.string().max(100).nullable(),
    uncertainty: z.string().min(1).max(1000),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.basis !== "recorded" && !v.rule)
      ctx.addIssue({ code: "custom", message: "Analysis requires a versioned rule" });
  });
export type Relationship = z.infer<typeof relationshipSchema>;
export const artifactSchema = z
  .object({ id: safeId, projectId: safeId, content: contentSchema })
  .strict();
export const snapshotSchema = z
  .object({
    id: safeId,
    projectId: safeId,
    sessionId: safeId.nullable(),
    head: z.string().max(64).nullable(),
    indexIdentity: z.string().max(64).nullable(),
    capturedAt: z.iso.datetime(),
    state: z.enum(["observed", "missing", "racy"]),
    artifactIds: z.array(safeId).max(1000),
  })
  .strict();
export type Project = { id: string; name: string; synthetic: boolean; policy: CapturePolicy };
export type Session = {
  id: string;
  title: string;
  startedAt: string | null;
  count: number;
  ended: boolean;
  kind?: "agent" | "repository";
};
export type UsageView = {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  reasoning: number | null;
  cacheReadShare: number | null;
  requests: number;
  cumulativeScopes: number;
  evidenceIds: string[];
  complete: boolean;
  conflicts: number;
  omitted: number;
  resets: number;
  basis: "request_delta" | "cumulative" | null;
  rule: string;
};
export type EventPage = { events: StoredEvent[]; nextCursor: number | null; total: number };

export const eventQuerySchema = z
  .object({
    search: z.string().max(200).default(""),
    kind: z.enum(["all", "tools", "commands", "files", "prompt", "gap", "usage"]).default("all"),
    order: z.enum(["receipt", "source"]).default("receipt"),
    cursor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  })
  .strict();
export type EventQuery = z.infer<typeof eventQuerySchema>;
export const browserQuerySchema = z
  .object({
    project: safeId,
    session: safeId,
    query: eventQuerySchema,
  })
  .strict();

/** Explicit activity projections; retained event bodies remain the source of truth. */
const activityRefSchema = z.object({ sessionId: safeId, turnId: safeId.nullable() }).strict();

export const activityDeclarationSchema = z
  .object({
    kind: z.enum(["plan", "decision", "approval", "correction"]),
    eventId: safeId,
    state: z.enum([
      "present",
      "disabled",
      "redacted",
      "truncated",
      "unavailable",
      "unsupported",
      "malformed",
    ]),
  })
  .strict();
export type ActivityDeclaration = z.infer<typeof activityDeclarationSchema>;

export const activityTurnSchema = z
  .object({
    id: safeId,
    projectId: safeId,
    sessionId: safeId,
    turnId: safeId,
    eventIds: z.array(safeId).min(1),
    declarations: z.array(activityDeclarationSchema),
    ended: z.boolean(),
    evidenceIds: z.array(safeId).min(1),
    rule: z.string().min(1).max(100),
    uncertainty: z.string().min(1).max(1000),
  })
  .strict();
export type ActivityTurn = z.infer<typeof activityTurnSchema>;

export const subagentLinkSchema = z
  .object({
    id: safeId,
    relation: z.enum(["parent", "spawned"]),
    projectId: safeId,
    parent: activityRefSchema,
    child: activityRefSchema,
    evidenceIds: z.array(safeId).min(1),
    rule: z.string().min(1).max(100),
    uncertainty: z.string().min(1).max(1000),
  })
  .strict();
export type SubagentLink = z.infer<typeof subagentLinkSchema>;

export const activityGapSchema = z
  .object({
    id: safeId,
    kind: z.enum(["missing_parent", "missing_child", "missing_end"]),
    projectId: safeId,
    sessionId: safeId,
    turnId: safeId.nullable(),
    evidenceIds: z.array(safeId).min(1),
    rule: z.string().min(1).max(100),
    uncertainty: z.string().min(1).max(1000),
  })
  .strict();
export type ActivityGap = z.infer<typeof activityGapSchema>;

export const activityViewSchema = z
  .object({
    turns: z.array(activityTurnSchema),
    subagents: z.array(subagentLinkSchema),
    gaps: z.array(activityGapSchema),
    rule: z.string().min(1).max(100),
    uncertainty: z.string().min(1).max(1000),
  })
  .strict();
export type ActivityView = z.infer<typeof activityViewSchema>;
