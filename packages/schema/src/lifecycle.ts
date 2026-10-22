import { z } from "zod";
import { policySchema, safeId } from "./index";

/**
 * Local lifecycle contracts: capture controls, retention and explicit deletion.
 *
 * Deletion is the only exception to the append-only history. It is always
 * explicit, always reported, and never claims to erase anything outside
 * Traceframe.
 */

export const usageSchema = z
  .object({
    events: z.number().int().nonnegative(),
    snapshots: z.number().int().nonnegative(),
    artifacts: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
  })
  .strict();
export type Usage = z.infer<typeof usageSchema>;

export const projectSettingsSchema = z
  .object({
    projectId: safeId,
    name: z.string().max(100),
    synthetic: z.boolean(),
    policy: policySchema,
    paused: z.boolean(),
    retentionDays: z.number().int().min(0).max(365).nullable(),
    purged: z.boolean(),
    purgedAt: z.string().nullable(),
    epoch: z.number().int().positive(),
    usage: usageSchema,
  })
  .strict();
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

export const settingsUpdateSchema = z
  .object({
    policy: policySchema.partial().optional(),
    paused: z.boolean().optional(),
    retentionDays: z.number().int().min(0).max(365).nullable().optional(),
  })
  .strict();
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export const purgeResultSchema = z
  .object({
    projectId: safeId,
    removed: usageSchema,
    purgedAt: z.string(),
    epoch: z.number().int().positive(),
    checkpointed: z.boolean(),
  })
  .strict();
export type PurgeResult = z.infer<typeof purgeResultSchema>;
