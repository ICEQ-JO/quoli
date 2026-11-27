import type { Project } from "../../shared/model.ts";

/** Internal agent-generated worktrees (Claude Code agent checkouts) are noisy by default. */
export function isInternalAgentWorktree(p: Project): boolean {
  if (!p.worktreeOf) return false;
  return p.name.startsWith("agent-") || p.root.includes("/.claude/worktrees/agent-");
}
