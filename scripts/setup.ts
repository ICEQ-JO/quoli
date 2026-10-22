import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { hookStatus, installHooks, uninstallHooks } from "../apps/bridge/src/install";
import { safeId } from "../packages/schema/src/index";
import { Store } from "../packages/storage/src/index";
import { credential, initializeCredential, runtime } from "../packages/storage/src/runtime";

/**
 * Guided local setup.
 *
 * The setup only reports and asks: it registers a project, adds Traceframe's
 * own hook entries to the project, and prints the telemetry variables the user
 * has to add themselves. It never rewrites a global setting, never replaces an
 * existing telemetry destination and never hides a conflict.
 */

const usage = `Traceframe local setup

pnpm setup /path/to/project [--name "Project"] [--capture-code] [--telemetry]
pnpm setup --check /path/to/project
pnpm setup --disable /path/to/project
pnpm setup --undo /path/to/project PROJECT_ID

Setup registers the repository, adds the hook entries to that project only and
prints what you have to add yourself. Undo removes the hook entries and the
retained evidence of the project. Nothing else in your configuration changes.`;

type TelemetryConflict = { key: string; value: string; source: string };

/** Telemetry settings that already exist somewhere in the user's configuration. */
function existingTelemetry(): TelemetryConflict[] {
  const conflicts: TelemetryConflict[] = [];
  const files = [
    { path: join(homedir(), ".claude", "settings.json"), source: "user settings" },
    { path: join(homedir(), ".claude", "settings.local.json"), source: "user local settings" },
  ];
  for (const file of files) {
    if (!existsSync(file.path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(file.path, "utf8")) as {
        env?: Record<string, string>;
      };
      for (const [key, value] of Object.entries(parsed.env ?? {})) {
        if (key.startsWith("OTEL_") || key === "CLAUDE_CODE_ENABLE_TELEMETRY")
          conflicts.push({ key, value: String(value), source: file.source });
      }
    } catch {
      // An unreadable settings file is reported by the caller as a conflict.
    }
  }
  return conflicts;
}

function commandVersion(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function findRegisteredProject(store: Store, root: string): string | null {
  for (const project of store.projects()) {
    const repository = store.repository(project.id);
    if (repository && resolve(repository.root) === resolve(root)) return project.id;
  }
  return null;
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      name: { type: "string" },
      "capture-code": { type: "boolean", default: false },
      telemetry: { type: "boolean", default: false },
      check: { type: "boolean" },
      undo: { type: "boolean" },
      disable: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: true,
  });
  if (values.help || !positionals.length) {
    console.log(usage);
    return;
  }
  const root = resolve(positionals[0] ?? "");
  if (!existsSync(root)) throw new Error("The project directory does not exist");
  const store = new Store(runtime().dbFile);
  try {
    const claude = commandVersion("claude", ["--version"]);
    const git = commandVersion("git", ["--version"]);
    console.log(`Project: ${root}`);
    console.log(`Claude Code: ${claude ?? "not found on PATH"}`);
    console.log(`Git: ${git ?? "not found on PATH"}`);
    if (values.disable) {
      const projectId = findRegisteredProject(store, root);
      if (!projectId) throw new Error("The project is not registered with Traceframe");
      store.updateSettings(projectId, { paused: true });
      console.log(`Capture is paused for ${projectId}.`);
      console.log(
        "The hook entries stay in place and the retained evidence stays readable. Resume it from Settings or with pnpm settings resume.",
      );
      return;
    }
    if (values.undo) {
      const projectId = safeId.parse(positionals[1] ?? "");
      const removed = uninstallHooks(root);
      const result = store.purgeProject(projectId);
      console.log(
        `Removed ${removed.removed.length} hook events and ${result.removed.events} retained observations for ${projectId}.`,
      );
      console.log(
        "Your other hooks, status line and telemetry settings were not touched. The source repository and its files are unchanged.",
      );
      return;
    }
    const status = hookStatus(root);
    const registered = findRegisteredProject(store, root);
    if (values.check) {
      console.log(
        status.installed
          ? `Hooks: installed for project ${status.projectId}.`
          : "Hooks: not installed.",
      );
      console.log(
        registered
          ? `Repository: registered as ${registered}.`
          : "Repository: not registered with Traceframe.",
      );
      const conflicts = existingTelemetry();
      console.log(
        conflicts.length
          ? `Telemetry: ${conflicts.length} existing settings would need attention.`
          : "Telemetry: no existing exporter configuration found.",
      );
      return;
    }
    const projectId = registered ?? `repo_${Math.abs(hash(root)).toString(16).padStart(32, "0")}`;
    if (!registered) {
      const name = values.name ?? root.split("/").filter(Boolean).at(-1) ?? "Project";
      store.registerLocalRepository(
        projectId,
        name,
        root,
        {
          version: 1,
          prompt: false,
          tool: false,
          code: values["capture-code"] ?? false,
          maxFieldBytes: 65536,
          excludedPaths: [".env", ".git", "node_modules", "credentials", "secrets"],
        },
        false,
      );
      console.log(`Registered the project as ${projectId}.`);
    } else {
      console.log(`The project is already registered as ${projectId}.`);
    }
    const installed = installHooks(root, projectId);
    console.log(`Hook entries written to ${installed.path}.`);
    console.log(
      `Existing hook groups left untouched: ${installed.preservedGroups}. Remove them again with pnpm setup --undo.`,
    );
    console.log(
      values["capture-code"]
        ? "Code capture is enabled for this project. Prompt and tool content stay disabled until you enable them in Settings."
        : "Code capture is disabled for this project. You can enable it later in Settings.",
    );
    const conflicts = existingTelemetry();
    if (conflicts.length) {
      console.log("");
      console.log("Existing telemetry configuration found; Traceframe does not change it:");
      for (const conflict of conflicts)
        console.log(`  ${conflict.key}=${conflict.value} (${conflict.source})`);
      console.log(
        "Two exporters cannot share one destination. Decide which one to keep before enabling reported usage.",
      );
    }
    if (values.telemetry) {
      console.log("");
      console.log("To report usage, add these to the environment that starts Claude Code:");
      console.log("  export CLAUDE_CODE_ENABLE_TELEMETRY=1");
      console.log("  export OTEL_LOGS_EXPORTER=otlp");
      console.log("  export OTEL_METRICS_EXPORTER=none");
      console.log("  export OTEL_EXPORTER_OTLP_PROTOCOL=http/json");
      console.log(
        `  export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://127.0.0.1:${runtime().collectorPort}/v1/logs`,
      );
      console.log(`  export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer ${credential()}"`);
      console.log(
        `  export TRACEFRAME_PROJECT_ID=${projectId}   # the collector needs the project for reported usage`,
      );
      console.log(
        "Keep the prompt and tool content gates off; Traceframe stores no prompt text from telemetry.",
      );
    }
  } finally {
    store.close();
  }
}

function hash(value: string): number {
  let result = 0;
  for (const character of value) result = (result * 31 + character.charCodeAt(0)) | 0;
  return result;
}

main().catch(() => {
  console.error(
    "Setup could not finish. Check the project directory, the local storage permissions and the running collector. Run pnpm setup --help for usage.",
  );
  process.exitCode = 1;
});
