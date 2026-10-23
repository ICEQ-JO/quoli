import { z } from "zod";
import { categorySchema, safeId } from "./index";

/**
 * Static adapter registration (V08).
 *
 * An adapter is described as data: source identity, verified source versions,
 * the observations it maps, the facts it can and cannot report, its delivery
 * identity rule and how it is installed. `defineAdapter` validates that data
 * once at module load; a shared suite then checks each registration against the
 * recorded fixtures. There is deliberately no dynamic loader.
 */

const versionSchema = z.string().regex(/^[0-9A-Za-z][0-9A-Za-z._+-]{0,99}$/);
const sourceSchema = z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/);
const capabilitySchema = z.enum(["available", "disabled", "unsupported", "unavailable"]);

// Mirrors the observation kinds in payloadSchema; the conformance suite pins them together.
const payloadKindSchema = z.enum([
  "repository_state",
  "repository_snapshot",
  "session_start",
  "session_end",
  "prompt",
  "tool_call",
  "tool_result",
  "usage",
  "gap",
]);

const gapReasonSchema = z.enum([
  "missing_result",
  "capture_disabled",
  "late_arrival",
  "missing_end",
  "unsupported_source",
]);

export const adapterRegistrationSchema = z
  .object({
    id: safeId,
    harness: z.string().min(1).max(100),
    source: sourceSchema,
    producerId: safeId,
    adapterVersion: versionSchema,
    /** Source product versions actually verified, never an open-ended range. */
    sourceVersions: z.array(versionSchema).min(1).max(20),
    /** Collected source event name to observation kind. Unlisted events are not recorded. */
    eventMapping: z.record(z.string().min(1).max(100), payloadKindSchema),
    capabilities: z
      .object({
        content: z.array(categorySchema).max(3),
        identifiers: z
          .array(z.enum(["session", "prompt", "tool", "request"]))
          .min(1)
          .max(4),
        usage: z.boolean(),
        sourceTime: z.boolean(),
        fields: z
          .object({
            plan: capabilitySchema,
            decision: capabilitySchema,
            approval: capabilitySchema,
            correction: capabilitySchema,
          })
          .strict(),
      })
      .strict(),
    failures: z
      .object({
        status: z.enum(["reported", "unsupported"]),
        exitCode: z.enum(["numeric", "unsupported"]),
        gaps: z.array(gapReasonSchema),
      })
      .strict(),
    delivery: z.literal("session_event_source_id"),
    install: z
      .object({
        mode: z.literal("reversible_project_hooks"),
        settingsPath: z.string().min(1).max(200),
      })
      .strict(),
  })
  .strict();
export type AdapterRegistration = z.infer<typeof adapterRegistrationSchema>;

export type DeliveryIdentityInput = {
  sessionId: string;
  event: string;
  promptId: string | null;
  toolId: string | null;
};

export type AdapterDescriptor = AdapterRegistration & {
  /** Derives the durable delivery identity from the source identifiers only. */
  readonly deliveryId: (input: DeliveryIdentityInput) => string;
};

export function defineAdapter(
  input: z.input<typeof adapterRegistrationSchema> & {
    deliveryId: AdapterDescriptor["deliveryId"];
  },
): AdapterDescriptor {
  const { deliveryId, ...registration } = input;
  return Object.freeze({ ...adapterRegistrationSchema.parse(registration), deliveryId });
}

export type VersionSupport =
  | { supported: true }
  | { supported: false; reason: "unsupported_source_version"; supportedVersions: string[] };

/** An unlisted source version is an explicit failure, never a best-effort guess. */
export function adapterSupportsSourceVersion(
  adapter: AdapterRegistration,
  version: string,
): VersionSupport {
  return adapter.sourceVersions.includes(version)
    ? { supported: true }
    : {
        supported: false,
        reason: "unsupported_source_version",
        supportedVersions: adapter.sourceVersions,
      };
}
