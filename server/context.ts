import type { SessionContext, UsagePoint } from "../shared/model.ts";
import type { RawEvent } from "./db.ts";
import { repoRelative } from "./paths.ts";

const MAX_POINTS = 400;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** A path inside the repository as repo-relative, others (user memory, ~/.claude) as given. */
function shown(path: string, root: string) {
  return repoRelative(path, root) ?? path;
}

const sizeOf = (u: UsagePoint) => u.tokens.input + u.tokens.cacheRead + u.tokens.cacheWrite;

/** Context window facts for one session. Pure; see `SessionContext` for where each comes from. */
export function contextOf(events: RawEvent[], usage: UsagePoint[], root: string): SessionContext {
  const main = usage.filter((u) => u.agentId === "main" && sizeOf(u) > 0);
  const all = main.map((u) => ({ at: u.at, tokens: sizeOf(u), model: u.model }));
  const step = Math.max(1, Math.ceil(all.length / MAX_POINTS));
  const sizes = all.filter((_, i) => i % step === 0 || i === all.length - 1);
  const sizeAt = (at: string, after: boolean) => {
    const hit = after ? all.find((p) => p.at > at) : all.findLast((p) => p.at <= at);
    return hit?.tokens ?? null;
  };

  const ctx: SessionContext = {
    sizes,
    peak: all.length ? Math.max(...all.map((p) => p.tokens)) : null,
    current: all.at(-1)?.tokens ?? null,
    compactions: [],
    instructions: [],
    commands: [],
    modelSwitches: [],
  };
  const files = new Map<string, SessionContext["instructions"][number]>();
  for (const e of events) {
    const p = e.payload;
    // Subagents load their own instructions and compact their own context; this is the main agent's.
    if (str(p.agent_id)) continue;
    switch (e.event) {
      case "PreCompact": {
        const trigger = p.trigger === "manual" || p.trigger === "auto" ? p.trigger : null;
        ctx.compactions.push({ at: e.at, trigger, before: sizeAt(e.at, false), after: null });
        break;
      }
      case "PostCompact": {
        const open = ctx.compactions.at(-1);
        if (open && open.after === null) open.after = sizeAt(e.at, true);
        break;
      }
      case "SessionStart":
        // A compaction can also be seen only as the session restarting with source "compact".
        if (
          p.source === "compact" &&
          !ctx.compactions.some((c) => c.after === null || c.at === e.at)
        )
          ctx.compactions.push({
            at: e.at,
            trigger: null,
            before: sizeAt(e.at, false),
            after: sizeAt(e.at, true),
          });
        break;
      case "InstructionsLoaded": {
        const path = str(p.file_path);
        if (!path) break;
        const key = shown(path, root);
        const seen = files.get(key);
        if (seen) seen.reloads++;
        else
          files.set(key, {
            path: key,
            scope: str(p.memory_type),
            reason: str(p.load_reason),
            at: e.at,
            reloads: 0,
          });
        break;
      }
      case "UserPromptExpansion": {
        const name = str(p.command_name);
        if (name)
          ctx.commands.push({
            at: e.at,
            name,
            args: str(p.command_args),
            source: str(p.command_source),
            kind: str(p.expansion_type),
          });
        break;
      }
      case "PostModelSwitch":
        ctx.modelSwitches.push({ at: e.at, from: str(p.from_model), to: str(p.to_model) });
        break;
    }
  }
  // A compaction whose PostCompact never arrived still has a size after it once usage resumes.
  for (const c of ctx.compactions) if (c.after === null) c.after = sizeAt(c.at, true);
  ctx.instructions = [...files.values()];
  return ctx;
}
