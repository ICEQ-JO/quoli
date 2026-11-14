import { cpSync, existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { home } from "./db.ts";

/**
 * Recording and Team sync without Quoli open (#159), on every operating system and with nothing
 * left running. While Quoli is closed, the user-level hook, OpenCode plugin and Pi extension queue
 * events in `spool.jsonl` and start `quoli sync` (at most once every 90 seconds; see `kick` in
 * server/hook.mjs). That command records the queue in the local database, sends Team sync, and
 * keeps doing so while the agent is still working; after a quiet minute it exits. The same idea as
 * WakaTime's editor plugins, which call a command per event instead of running a service.
 *
 * `sync.json` beside the queue says how to start it. From the package, the app is first copied
 * to `~/.quoli/app`, because the npx folder it ran from can be cleaned at any time.
 */

const appRoot = resolve(fileURLToPath(import.meta.url), "../..");
const bundled = () => process.env.QUOLI_BUNDLED === "1";
export const syncCommandFile = () => join(home(), "sync.json");
const stampFile = () => join(home(), "sync.last");

export interface SyncCommand {
  command: string;
  args: string[];
  cwd: string;
}

/** How a hook starts `quoli sync` for this copy of Quoli. */
export function syncCommand(): SyncCommand {
  if (bundled()) {
    const app = join(home(), "app");
    return { command: process.execPath, args: [join(app, "server", "cli.mjs"), "sync"], cwd: app };
  }
  return {
    command: process.execPath,
    args: ["--import", "tsx", join(appRoot, "server", "cli.ts"), "sync"],
    cwd: appRoot,
  };
}

/** Writes sync.json (and, from the package, the app copy it points at). */
export function installSyncCommand() {
  mkdirSync(home(), { recursive: true });
  if (bundled()) {
    const app = join(home(), "app");
    rmSync(app, { recursive: true, force: true });
    for (const part of ["server", "dist", "package.json"]) {
      if (existsSync(join(appRoot, part)))
        cpSync(join(appRoot, part), join(app, part), { recursive: true });
    }
  }
  writeFileSync(syncCommandFile(), `${JSON.stringify(syncCommand(), null, 2)}\n`);
}

export function removeSyncCommand() {
  rmSync(syncCommandFile(), { force: true });
  rmSync(join(home(), "app"), { recursive: true, force: true });
}

const touch = (file: string) => {
  const now = new Date();
  try {
    utimesSync(file, now, now);
  } catch {
    writeFileSync(file, "");
  }
};

async function quoliIsOpen(port: number) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/sync`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * `quoli sync`: record the queue and send Team sync; repeat while events keep arriving; exit after
 * a quiet minute. Does nothing when Quoli is open, which records and syncs by itself.
 */
export async function runSync({ quietMs = 60_000 } = {}): Promise<number> {
  const port = Number(process.env.QUOLI_PORT ?? 4400);
  if (await quoliIsOpen(port)) return 0;
  const [{ Store }, { createApp }, { drainSpool }, { spoolFile }] = await Promise.all([
    import("./db.ts"),
    import("./app.ts"),
    import("./spool.ts"),
    import("./setup.ts"),
  ]);
  const store = new Store();
  const app = createApp(store, () => port);
  for (;;) {
    touch(stampFile());
    drainSpool(store, spoolFile());
    await app.sync();
    await new Promise((r) => setTimeout(r, quietMs));
    if (existsSync(spoolFile()) && !(await quoliIsOpen(port))) continue;
    // Let the next event start a new run at once; a last look catches one that just arrived.
    rmSync(stampFile(), { force: true });
    if (!existsSync(spoolFile()) || (await quoliIsOpen(port))) break;
  }
  store.db.close();
  return 0;
}
