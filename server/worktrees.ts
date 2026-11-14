import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { git } from "./ingest.ts";
import { nativePath } from "./paths.ts";

const cache = new Map<string, string | null>();

/**
 * The main checkout a linked Git worktree belongs to, or null for a main checkout or a folder Git
 * cannot read. A removed worktree is recognised by the folder Claude Code creates agent worktrees
 * in (`<repo>/.claude/worktrees/<name>`), so its sessions still group under the repository.
 */
export function mainCheckout(root: string): string | null {
  if (cache.has(root)) return cache.get(root) ?? null;
  let main: string | null = null;
  if (existsSync(root)) {
    const dir = git(root, ["rev-parse", "--git-dir"]);
    const common = git(root, ["rev-parse", "--git-common-dir"]);
    if (dir && common) {
      const abs = (p: string) => (isAbsolute(p) ? p : resolve(root, p));
      if (abs(dir) !== abs(common)) main = nativePath(dirname(abs(common)));
    }
  } else {
    main = /^(.+)[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/.exec(root)?.[1] ?? null;
  }
  // Only a removed folder's answer can change, and only by reappearing; keep both answers.
  cache.set(root, main);
  return main;
}

/** The known root a worktree root groups under, or null when it stands on its own. */
export function groupRoot(root: string, known: Set<string>): string | null {
  const main = mainCheckout(root);
  return main && main !== root && known.has(main) ? main : null;
}
