import { z } from "zod";
import { safeId } from "./index";

/**
 * Cross-source reconciliation contracts.
 *
 * Sources are joined only by explicit identifiers inside one project. The raw
 * observations are never merged or overwritten.
 */

export const reconciledToolSchema = z
  .object({
    toolId: z.string().max(200),
    toolName: z.string().max(40),
    sources: z
      .array(z.object({ source: z.string().max(40), eventIds: z.array(safeId).min(1).max(50) }))
      .min(1),
    status: z.enum(["success", "failure", "interrupted", "unknown"]),
    conflict: z.boolean(),
    evidenceIds: z.array(safeId).min(1).max(100),
    uncertainty: z.string().min(1).max(1000),
  })
  .strict();
export type ReconciledTool = z.infer<typeof reconciledToolSchema>;

export const ambiguousObservationSchema = z
  .object({
    eventIds: z.array(safeId).min(1).max(20),
    source: z.string().max(40),
    reason: z.string().min(1).max(500),
  })
  .strict();
export type AmbiguousObservation = z.infer<typeof ambiguousObservationSchema>;

export const sourceUsageSchema = z
  .object({
    source: z.string().max(40),
    events: z.number().int().nonnegative(),
    requests: z.number().int().nonnegative(),
    input: z.number().int().nullable(),
    output: z.number().int().nullable(),
    cacheRead: z.number().int().nullable(),
    cacheWrite: z.number().int().nullable(),
  })
  .strict();
export type SourceUsage = z.infer<typeof sourceUsageSchema>;

export const reconciliationViewSchema = z
  .object({
    tools: z.array(reconciledToolSchema).max(500),
    ambiguous: z.array(ambiguousObservationSchema).max(200),
    usage: z.any(),
    sourceUsage: z.array(sourceUsageSchema).max(20),
    combined: z.object({
      input: z.number().int().nullable(),
      output: z.number().int().nullable(),
      cacheRead: z.number().int().nullable(),
      cacheWrite: z.number().int().nullable(),
    }),
    rule: z.string().min(1).max(100),
    uncertainty: z.string().min(1).max(1000),
  })
  .strict();
export type ReconciliationView = z.infer<typeof reconciliationViewSchema>;
