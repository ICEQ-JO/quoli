import { z } from "zod";
import { relationshipSchema, safeId } from "./index";

/**
 * Verification contracts.
 *
 * Every fact below is independent and nullable: a recorded command, a recorded
 * result, an exit code and test counts are separate observations. Nothing here
 * asserts that a feature works, that a check covered a file, or that a file was
 * changed by the agent.
 */

export const testCountsSchema = z
  .object({
    /** The recorded output matched the supported summary format. */
    supported: z.boolean(),
    /** A failure is reported in the recorded output. */
    failure: z.boolean(),
    passed: z.number().int().nonnegative().nullable(),
    failed: z.number().int().nonnegative().nullable(),
    total: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type TestCounts = z.infer<typeof testCountsSchema>;

export const checkStateSchema = z.enum(["passed", "failed", "unknown_output", "missing_result"]);
export type CheckState = z.infer<typeof checkStateSchema>;

export const fileScopeSchema = z
  .object({
    path: z.string().max(1024),
    /** The tool observation that referenced the path. */
    eventId: safeId,
    position: z.enum(["before", "after"]),
  })
  .strict();
export type FileScope = z.infer<typeof fileScopeSchema>;

export const checkObservationSchema = z
  .object({
    /** The recorded result observation, or the request when no result was retained. */
    id: safeId,
    callId: safeId,
    resultId: safeId.nullable(),
    command: z.string().max(1024).nullable(),
    /** The command text itself was retained. */
    commandObserved: z.boolean(),
    resultObserved: z.boolean(),
    exitCode: z.number().int().nullable(),
    status: z.enum(["success", "failure", "interrupted", "unknown"]),
    counts: testCountsSchema,
    state: checkStateSchema,
    /** Paths referenced around this check. A reference is not authorship. */
    files: z.array(fileScopeSchema).max(200),
    /** A path was referenced after the recorded result. */
    stale: z.boolean(),
    window: z
      .object({
        before: safeId.nullable(),
        after: safeId.nullable(),
        dirty: z.boolean().nullable(),
      })
      .strict(),
    evidenceIds: z.array(safeId).min(1).max(100),
    rule: z.string().min(1).max(100),
    uncertainty: z.string().min(1).max(1000),
  })
  .strict();
export type CheckObservation = z.infer<typeof checkObservationSchema>;

export const verificationViewSchema = z
  .object({
    checks: z.array(checkObservationSchema).max(200),
    relations: z.array(relationshipSchema).max(500),
    rule: z.string().min(1).max(100),
    uncertainty: z.string().min(1).max(1000),
  })
  .strict();
export type VerificationView = z.infer<typeof verificationViewSchema>;
