import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { connect, HOOK_AGENTS } from "./connect.ts";
import { home } from "./db.ts";
import { setupCli } from "./setup.ts";

/**
 * Takes Quoli off this computer: out of every agent (user level and every recorded project),
 * the background login item stopped and removed, and the data folder deleted. Asks first unless
 * `--yes`. Recorded sessions cannot be recovered afterwards.
 */
export async function uninstallCli(args: string[]): Promise<number> {
  const dir = home();
  if (!args.includes("--yes")) {
    console.log(
      `This removes Quoli from every coding agent, stops it, and deletes everything it recorded\n(${dir}). Recorded sessions cannot be recovered.\n`,
    );
    if (!process.stdin.isTTY) {
      console.log("Run it again with --yes to confirm.");
      return 1;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question("Type yes to remove Quoli: ")).trim().toLowerCase();
    rl.close();
    if (answer !== "yes") {
      console.log("Nothing was removed.");
      return 1;
    }
  }

  // 1. Recorded projects connected one by one (Projects → Connect) carry their own hooks.
  if (existsSync(join(dir, "quoli.db"))) {
    try {
      const { Store } = await import("./db.ts");
      const store = new Store();
      const roots = store.registeredProjects().map((p) => p.root);
      store.db.close();
      for (const root of roots)
        for (const agent of HOOK_AGENTS) {
          try {
            if (existsSync(root)) connect(root, true, agent);
          } catch {}
        }
    } catch {}
  }
  // 2. Every agent's user-level hooks, plugins and extensions.
  setupCli(["--remove"], false);
  // 3. The background Quoli and its login item.
  const { removeAutostart, stopRunning } = await import("./autostart.ts");
  removeAutostart();
  await stopRunning();
  // 4. The data, only when the folder is plainly Quoli's (QUOLI_HOME could point anywhere).
  const own =
    resolve(dir) !== resolve(homedir()) &&
    dirname(resolve(dir)) !== resolve(dir) &&
    (basename(dir) === ".quoli" || existsSync(join(dir, "quoli.db")));
  if (!own) {
    console.log(
      `\nQuoli is out of every agent and stopped. ${dir} was left alone: delete Quoli's files there by hand.`,
    );
    return 1;
  }
  // Windows may hold the stopped service's files a moment longer.
  for (let i = 0; i < 10; i++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (existsSync(dir)) {
    console.log(
      `\nQuoli is out of every agent and stopped, but ${dir} could not be deleted: delete it by hand.`,
    );
    return 1;
  }
  console.log("\nQuoli is removed from this computer. Thanks for trying it.");
  return 0;
}
