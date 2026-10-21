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
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
export const payloadSchema = z.discriminatedUnion("kind", [
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
export const eventSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: safeId,
    deliveryId: safeId,
    projectId: safeId,
    sessionId: safeId,
    source: z.enum(["synthetic", "claude_hook", "claude_otel"]),
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
export type NormalizedEvent = z.infer<typeof eventSchema>;
export type StoredEvent = NormalizedEvent & { sequence: number; receivedAt: string };
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
};
export type UsageView = {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  cacheReadShare: number | null;
  requests: number;
  evidenceIds: string[];
  complete: boolean;
  conflicts: number;
  omitted: number;
  rule: string;
};
export type EventPage = { events: StoredEvent[]; nextCursor: number | null; total: number };
