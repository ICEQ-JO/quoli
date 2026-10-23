import { randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { safeId } from "@traceframe/schema";
import { runtime } from "@traceframe/storage/runtime";
import { OPENCODE_EVENTS, OPENCODE_VERSION } from "./opencode";

const marker = "// quoli-opencode-plugin/v1 ";
const pluginPath = (root: string) => join(root, ".opencode/plugins/quoli.js");

function owned(root: string): { projectId: string; runtimeRoot: string | null } | null {
  const path = pluginPath(root);
  if (!existsSync(path)) return null;
  if (!lstatSync(path).isFile()) throw new Error("Quoli plugin path is not a regular file.");
  const line = readFileSync(path, "utf8").split("\n", 1)[0];
  if (!line.startsWith(marker)) return null;
  const value = JSON.parse(line.slice(marker.length));
  safeId.parse(value.projectId);
  return value;
}

function checkPaths(root: string): void {
  for (const path of [join(root, ".opencode"), join(root, ".opencode/plugins"), pluginPath(root)]) {
    try {
      if (lstatSync(path).isSymbolicLink())
        throw new Error("Refusing a symlinked OpenCode plugin path.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function openCodeStatus(root: string) {
  checkPaths(root);
  const config = owned(root);
  return { installed: config !== null, projectId: config?.projectId ?? null };
}

export function openCodeUsesRuntime(root: string, releaseRoot: string): boolean {
  checkPaths(root);
  return owned(root)?.runtimeRoot === releaseRoot;
}

export function uninstallOpenCode(root: string): void {
  checkPaths(root);
  if (!existsSync(pluginPath(root))) return;
  if (!owned(root)) throw new Error("Existing OpenCode plugin is not owned by Quoli.");
  unlinkSync(pluginPath(root));
}

/** Generates a dependency-free Promise plugin for the verified OpenCode 2 API. */
export function installOpenCode(root: string, projectId: string): { path: string } {
  safeId.parse(projectId);
  root = realpathSync(root);
  checkPaths(root);
  const previous = owned(root);
  if (existsSync(pluginPath(root)) && !previous)
    throw new Error("Existing OpenCode plugin is not owned by Quoli.");
  if (previous && previous.projectId !== projectId)
    throw new Error("OpenCode plugin project mismatch.");
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const runtimeRoot = process.env.QUOLI_RUNTIME_ROOT ?? null;
  const config = runtime();
  const options = {
    node: process.execPath,
    args: runtimeRoot
      ? [join(runtimeRoot, "runtime/quoli-opencode-v1.mjs"), projectId]
      : [
          "--import",
          join(repo, "node_modules/tsx/dist/loader.mjs"),
          join(repo, "apps/bridge/src/opencode-entry.ts"),
          projectId,
        ],
    dataDir: config.dataDir,
    port: String(config.collectorPort),
    root,
  };
  const source = `${marker}${JSON.stringify({ projectId, runtimeRoot })}
import { spawn } from "node:child_process";
const config = ${JSON.stringify(options)};
const accepted = new Set(${JSON.stringify(Object.keys(OPENCODE_EVENTS))});
export default {
  id: "quoli-evidence",
  setup(ctx) {
    if (ctx.app.version !== ${JSON.stringify(OPENCODE_VERSION)}) {
      console.error("Quoli: unsupported OpenCode version; activity capture is disabled (requires ${OPENCODE_VERSION}).");
      return;
    }
    if (ctx.location.directory !== config.root) return;
    const abort = new AbortController();
    const models = new Map();
    const tools = new Map();
    // shortcut: metadata eviction becomes a gap; add source replay when backfill is required.
    const remember = (map, key, value) => {
      map.set(key, value);
      if (map.size > 1000) map.delete(map.keys().next().value);
    };
    const send = (observation) => new Promise((done) => {
      const body = JSON.stringify(observation);
      if (Buffer.byteLength(body) > 1048576 || abort.signal.aborted) return done();
      const child = spawn(config.node, config.args, {
        env: { ...process.env, TRACEFRAME_DATA_DIR: config.dataDir, TRACEFRAME_COLLECTOR_PORT: config.port },
        stdio: ["pipe", "ignore", "ignore"],
      });
      const stop = () => child.kill();
      const timer = setTimeout(stop, 5000);
      abort.signal.addEventListener("abort", stop, { once: true });
      child.once("error", () => { clearTimeout(timer); abort.signal.removeEventListener("abort", stop); done(); });
      child.once("close", () => { clearTimeout(timer); abort.signal.removeEventListener("abort", stop); done(); });
      child.stdin.on("error", () => {});
      child.stdin.end(body);
    });
    const task = (async () => {
      for await (const event of ctx.event.subscribe({ signal: abort.signal })) {
        if (abort.signal.aborted) break;
        if (event.location?.directory !== ctx.location.directory || event.location?.workspaceID !== ctx.location.workspaceID) continue;
        const data = event.data;
        if (!data || typeof data.sessionID !== "string") continue;
        const request = JSON.stringify([data.sessionID, data.assistantMessageID]);
        const tool = JSON.stringify([data.sessionID, data.assistantMessageID, data.id]);
        if (event.type === "session.step.started") {
          if (event.durable?.version === 1) remember(models, request, data.model);
          continue;
        }
        if (event.type === "session.tool.input.started") {
          if (event.durable?.version === 1) remember(tools, tool, { name: data.name });
          continue;
        }
        // No reasoning, assistant text, attachment bytes, inventories or historical reads.
        if (!accepted.has(event.type)) continue;
        if (event.type === "session.tool.called" && tools.has(tool)) {
          const details = tools.get(tool);
          details.path = typeof data.input?.filePath === "string" ? data.input.filePath : null;
        }
        await send({ sourceVersion: ctx.app.version, event, model: models.get(request), toolName: tools.get(tool)?.name, toolPath: tools.get(tool)?.path });
        if (event.type === "session.step.ended" || event.type === "session.step.failed") models.delete(request);
        if (event.type === "session.tool.success" || event.type === "session.tool.failed") tools.delete(tool);
      }
    })().catch(() => { if (!abort.signal.aborted) console.error("Quoli: OpenCode event capture stopped; restart the project to reconnect."); });
    return async () => { abort.abort(); await task; };
  },
};
`;
  const path = pluginPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, source, { mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return { path };
}
