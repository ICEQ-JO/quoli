import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { hookStatus, installHooks, uninstallHooks } from "../apps/bridge/src/install";
import { OPENCODE_VERSION } from "../apps/bridge/src/opencode";
import {
  installOpenCode,
  openCodeStatus,
  uninstallOpenCode,
} from "../apps/bridge/src/opencode-install";
import { createGitRunner } from "../packages/repository/src/git";
import { captureRepository } from "../packages/repository/src/index";
import { registeredLocation } from "../packages/repository/src/location";
import { safeId } from "../packages/schema/src/index";
import { Store } from "../packages/storage/src/index";
import { credential, initializeCredential, runtime } from "../packages/storage/src/runtime";

/**
 * Guided local setup.
 *
 * Repository-only connection writes private local registration and observation
 * consent. Explicit agent modes install project hooks/plugins; Claude can also
 * print optional telemetry variables. It never rewrites a global setting, never replaces an
 * existing telemetry destination and never hides a conflict.
 */

const connectCommand = process.env.QUOLI_RUNTIME_ROOT ? "quoli connect" : "pnpm connect";
const settingsCommand = process.env.QUOLI_RUNTIME_ROOT ? "quoli settings" : "pnpm settings";
const usage = `Quoli repository connection

${connectCommand} /path/to/project [--name "Project"] [--capture-code] [--include-untracked] [--agent claude|opencode] [--telemetry]
${connectCommand} --check /path/to/project
${connectCommand} --disable /path/to/project
${connectCommand} --undo /path/to/project PROJECT_ID

Connect enables automatic repository observation while Quoli is running.
It works with any coding agent or editor. --agent claude additionally installs
the supported Claude Code hooks; --agent opencode installs the OpenCode ${OPENCODE_VERSION} plugin. Undo removes Quoli's integrations and the
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
      "include-untracked": { type: "boolean", default: false },
      agent: { type: "string", default: "repository" },
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
  if (
    positionals.length > (values.undo ? 2 : 1) ||
    [values.check, values.undo, values.disable].filter(Boolean).length > 1 ||
    !["repository", "claude", "opencode"].includes(values.agent ?? "") ||
    (values.telemetry && values.agent !== "claude")
  )
    throw new Error("Unsupported connection options");
  const root = await registeredLocation(positionals[0] ?? ".", runtime().dataDir);
  const store = new Store(runtime().dbFile);
  try {
    const claude =
      values.agent === "claude"
        ? commandVersion("claude", ["--version"])
        : "not connected (repository-only mode)";
    const gitOutput = await createGitRunner(root).optional(["--version"]);
    const git = gitOutput?.toString("utf8").trim() ?? null;
    console.log(`Project: ${root}`);
    console.log(`Claude Code: ${claude ?? "not found on PATH"}`);
    console.log(`Git: ${git ?? "not found on PATH"}`);
    if (values.agent === "opencode" && !values.check && !values.undo && !values.disable) {
      const version = commandVersion("opencode", ["--version"]);
      if (version?.replace(/^opencode v?/, "") !== OPENCODE_VERSION) {
        console.error(`OpenCode ${OPENCODE_VERSION} is required; no plugin was installed.`);
        throw new Error("Unsupported OpenCode version");
      }
    }
    if (values.disable) {
      const projectId = findRegisteredProject(store, root);
      if (!projectId) throw new Error("The project is not registered with Quoli");
      store.updateSettings(projectId, { paused: true });
      console.log(`Capture is paused for ${projectId}.`);
      console.log(
        `The hook entries stay in place and retained evidence stays readable. Resume it from Settings or with ${settingsCommand} resume ${projectId}.`,
      );
      return;
    }
    if (values.undo) {
      const projectId = safeId.parse(positionals[1] ?? "");
      if (findRegisteredProject(store, root) !== projectId)
        throw new Error("Project root mismatch");
      const hook = hookStatus(root);
      const openCode = openCodeStatus(root);
      if (hook.installed && hook.projectId !== projectId) throw new Error("Hook project mismatch");
      if (openCode.installed && openCode.projectId !== projectId)
        throw new Error("OpenCode project mismatch");
      const removed = hook.installed ? uninstallHooks(root) : { removed: [] };
      uninstallOpenCode(root);
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
      const openCode = openCodeStatus(root);
      console.log(
        `OpenCode plugin: ${openCode.installed ? `installed for project ${openCode.projectId}` : "not installed"}; supports ${OPENCODE_VERSION}.`,
      );
      console.log(
        status.installed
          ? `Hooks: installed for project ${status.projectId}.`
          : "Hooks: not installed.",
      );
      console.log(
        registered
          ? `Repository: registered as ${registered}.`
          : "Repository: not registered with Quoli.",
      );
      const conflicts = existingTelemetry();
      console.log(
        conflicts.length
          ? `Telemetry: ${conflicts.length} existing settings would need attention.`
          : "Telemetry: no existing exporter configuration found.",
      );
      if (registered)
        console.log(
          `Automatic repository history: ${store.observation(registered).enabled ? store.observation(registered).status : "not enabled"}.`,
        );
      return;
    }
    const projectId = registered ?? `repo_${randomUUID().replaceAll("-", "")}`;
    if (!registered) {
      await captureRepository(
        root,
        {
          version: 1,
          prompt: false,
          tool: false,
          code: false,
          maxFieldBytes: 65536,
          excludedPaths: [".env", ".git", "node_modules", "credentials", "secrets"],
        },
        { maxFiles: 1, maxFileBytes: 64, maxTotalBytes: 64 },
      );
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
        values["include-untracked"] ?? false,
      );
      console.log(`Registered the project as ${projectId}.`);
    } else {
      console.log(`The project is already registered as ${projectId}.`);
    }
    initializeCredential();
    store.enableObservation(projectId);
    console.log("Automatic repository history is enabled while Quoli is running.");
    console.log(
      `Open http://127.0.0.1:${runtime().webPort} and select this project. ${process.env.QUOLI_RUNTIME_ROOT ? "Use quoli start if capture is stopped." : "Start pnpm dev if Quoli is not running."}`,
    );
    console.log("Repository changes are sampled every 5 seconds. Agent authorship is unknown.");
    if (values.agent === "claude") {
      const installed = installHooks(root, projectId);
      console.log(`Hook entries written to ${installed.path}.`);
      console.log(`Existing hook groups left untouched: ${installed.preservedGroups}.`);
    } else if (values.agent === "opencode") {
      console.log(
        `OpenCode plugin written to ${installOpenCode(root, projectId).path}. Restart OpenCode for this project.`,
      );
    } else {
      console.log(
        "No agent hooks installed. Claude Code, Codex, Pi, OpenCode and editors can all change this repository; detailed activity is not collected by repository observation.",
      );
    }
    console.log(
      store.project(projectId)?.policy.code
        ? "Code capture is enabled with best-effort redaction."
        : "Metadata-only capture: unstaged code edits and content diffs are unavailable. Enable code capture in Settings to observe them.",
    );
    if (store.lifecycle(projectId).paused)
      console.log("Capture is paused. Resume explicitly in Settings.");
    const conflicts = existingTelemetry();
    if (conflicts.length) {
      console.log("");
      console.log("Existing telemetry configuration found; Quoli does not change it:");
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
        "Keep the prompt and tool content gates off; Quoli stores no prompt text from telemetry.",
      );
    }
  } finally {
    store.close();
  }
}

main().catch(() => {
  console.error(
    `Setup could not finish. Check the project directory, local storage permissions and running collector. Run ${connectCommand} --help for usage.`,
  );
  process.exitCode = 1;
});
