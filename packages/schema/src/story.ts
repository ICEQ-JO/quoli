import { z } from "zod";
import { safeId } from "./index";
import { sceneSchema } from "./scene";

/**
 * Versioned Story contract (V20).
 *
 * A story is one bounded evidence scene plus a short, rule-generated narrative.
 * Every narrative claim cites retained observations; nothing is explained from
 * captured text, model output or hidden reasoning. Claims are plain text.
 */

export const STORY_VERSION = 1;
export const MAX_STORY_CLAIMS = 200;

export const storyClaimKindSchema = z.enum([
  "request",
  "declared",
  "unknown_rationale",
  "subagent",
  "tool",
  "files",
  "checks",
  "conflict",
  "gap",
]);
export type StoryClaimKind = z.infer<typeof storyClaimKindSchema>;

export const storyClaimSchema = z
  .object({
    id: safeId,
    kind: storyClaimKindSchema,
    /** Inert plain text. Never HTML, a command or captured content. */
    text: z.string().min(1).max(400),
    basis: z.enum(["recorded", "derived", "inferred"]),
    rule: z.string().min(1).max(100),
    evidenceIds: z.array(safeId).min(1).max(50),
    uncertainty: z.string().min(1).max(1000),
  })
  .strict();
export type StoryClaim = z.infer<typeof storyClaimSchema>;

export const storySchema = z
  .object({
    version: z.literal(STORY_VERSION),
    projectId: safeId,
    sessionId: safeId,
    rule: z.string().min(1).max(100),
    uncertainty: z.string().min(1).max(1000),
    scene: sceneSchema,
    claims: z.array(storyClaimSchema).max(MAX_STORY_CLAIMS),
    omittedClaims: z.number().int().nonnegative(),
    caps: z.object({ claims: z.number().int().positive().max(MAX_STORY_CLAIMS) }).strict(),
  })
  .strict()
  .superRefine((story, ctx) => {
    if (story.claims.length > story.caps.claims)
      ctx.addIssue({ code: "custom", path: ["claims"], message: "Claim cap exceeded" });
    if (new Set(story.claims.map((claim) => claim.id)).size !== story.claims.length)
      ctx.addIssue({ code: "custom", path: ["claims"], message: "Duplicate claim id" });
    if (story.scene.projectId !== story.projectId || story.scene.sessionId !== story.sessionId)
      ctx.addIssue({
        code: "custom",
        path: ["scene"],
        message: "The scene must describe the story's own project and session",
      });
  });
export type Story = z.infer<typeof storySchema>;
