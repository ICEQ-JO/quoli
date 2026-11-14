import { existsSync } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline/promises";
import { syncCommandFile } from "./background.ts";
import { git } from "./ingest.ts";
import { nativePath } from "./paths.ts";
import {
  describeScope,
  hasScopeFile,
  loadScope,
  recordEverything,
  recordOnly,
  records,
} from "./scope.ts";

/**
 * The first run of `quoli` and the scope question of `quoli connect`. Quoli's hooks are installed
 * for the whole user, so the choice of which repositories to record is a file (server/scope.ts),
 * asked once: inside a repository the default is that repository only.
 */

/** Nothing has been set up on this computer yet (no `quoli setup` or `connect` ever ran). */
export const firstRun = () => !existsSync(syncCommandFile());

const interactive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

/** Asks a question on the terminal; returns `fallback` without a terminal or on an empty answer. */
export async function ask(question: string, fallback: string): Promise<string> {
  if (!interactive()) return fallback;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

/** A yes/no question; without a terminal to answer it the answer is no. */
export const yes = async (question: string, fallback = true) =>
  interactive() &&
  /^y/i.test(await ask(`${question} ${fallback ? "[Y/n]" : "[y/N]"} `, fallback ? "y" : "n"));

/** The repository the command runs in, or null outside one. */
export const hereRepo = () => {
  const top = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  return top ? nativePath(top) : null;
};

/**
 * Settles which repositories to record. `--all` and `--here` answer without asking. Returns a line
 * describing the result.
 */
export async function chooseScope(args: string[]): Promise<string> {
  const repo = hereRepo();
  if (args.includes("--all")) {
    recordEverything();
    return describeScope();
  }
  if (args.includes("--here")) {
    if (!repo) return "Not inside a Git repository, so --here has nothing to record.";
    recordOnly(repo);
    return describeScope();
  }
  const scope = loadScope();
  if (hasScopeFile() || !firstRun()) {
    // Already decided. Offer to add this repository when it is left out.
    if (repo && !records(repo, scope)) {
      if (await yes(`   Quoli is not recording ${basename(repo)}. Record it too?`)) {
        const { startRecording } = await import("./scope.ts");
        startRecording(repo);
      }
    }
    return describeScope();
  }
  if (!repo) {
    console.log("   Not inside a project, so Quoli will record every project on this computer.");
    console.log("   (Run it inside a project instead to record only that one.)");
    recordEverything();
    return describeScope();
  }
  console.log(`   You are in ${basename(repo)} (${repo}).\n`);
  console.log("     1  Only this project");
  console.log("     2  Every project on this computer\n");
  const answer = await ask("   Record which? [1] ", "1");
  if (answer.startsWith("2")) recordEverything();
  else recordOnly(repo);
  return describeScope();
}
