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
import { PI_VERSION } from "./pi";

/**
 * Reversible project-local Pi extension.
 *
 * Pi auto-discovers `.pi/extensions/*.ts`; the generated module only forwards
 * extracted lifecycle facts to this build's bridge, exits quietly and never
 * changes a tool call or its result.
 */

const marker = "// quoli-pi-extension/v1 ";
const extensionPath = (root: string) => join(root, ".pi/extensions/quoli.ts");

function owned(root: string): { projectId: string; runtimeRoot: string | null } | null {
  const path = extensionPath(root);
  if (!existsSync(path)) return null;
  if (!lstatSync(path).isFile()) throw new Error("Quoli Pi extension path is not a regular file.");
  const line = readFileSync(path, "utf8").split("\n", 1)[0];
  if (!line.startsWith(marker)) return null;
  const value = JSON.parse(line.slice(marker.length));
  safeId.parse(value.projectId);
  return value;
}

function checkPaths(root: string): void {
  for (const path of [join(root, ".pi"), join(root, ".pi/extensions"), extensionPath(root)]) {
    try {
      if (lstatSync(path).isSymbolicLink())
        throw new Error("Refusing a symlinked Pi extension path.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function piStatus(root: string) {
  checkPaths(root);
  const config = owned(root);
  return { installed: config !== null, projectId: config?.projectId ?? null };
}

export function piUsesRuntime(root: string, releaseRoot: string): boolean {
  checkPaths(root);
  return owned(root)?.runtimeRoot === releaseRoot;
}

export function uninstallPi(root: string): void {
  checkPaths(root);
  if (!existsSync(extensionPath(root))) return;
  if (!owned(root)) throw new Error("Existing Pi extension is not owned by Quoli.");
  unlinkSync(extensionPath(root));
}

/** Generates a dependency-free extension for the verified Pi lifecycle API. */
export function installPi(root: string, projectId: string): { path: string } {
  safeId.parse(projectId);
  root = realpathSync(root);
  checkPaths(root);
  const previous = owned(root);
  if (existsSync(extensionPath(root)) && !previous)
    throw new Error("Existing Pi extension is not owned by Quoli.");
  if (previous && previous.projectId !== projectId)
    throw new Error("Pi extension project mismatch.");
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const runtimeRoot = process.env.QUOLI_RUNTIME_ROOT ?? null;
  const config = runtime();
  const options = {
    node: process.execPath,
    version: PI_VERSION,
    args: runtimeRoot
      ? [join(runtimeRoot, "runtime/quoli-hook-v1.mjs"), projectId, "pi"]
      : [
          "--import",
          join(repo, "node_modules/tsx/dist/loader.mjs"),
          join(repo, "apps/bridge/src/index.ts"),
          projectId,
          "pi",
        ],
    dataDir: config.dataDir,
    port: String(config.collectorPort),
    root,
  };
  const source = `${marker}${JSON.stringify({ projectId, runtimeRoot })}
import { spawn } from "node:child_process";
import { VERSION } from "@earendil-works/pi-coding-agent";

const config = ${JSON.stringify(options)};
const inside = (cwd) => typeof cwd === "string" && (cwd === config.root || cwd.startsWith(config.root + "/"));
const text = (content) =>
  Array.isArray(content)
    ? content
        .filter((part) => part && part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\\n") || null
    : typeof content === "string"
      ? content
      : null;
// Args can embed whole files; the bridge bounds and redacts what it keeps.
const cut = (value) => {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value).slice(0, 65536);
  } catch {
    return null;
  }
};

export default function (pi) {
  if (VERSION !== config.version) {
    console.error("Quoli: unsupported Pi version " + VERSION + "; activity capture is disabled (requires " + config.version + ").");
    return;
  }
  // Pi does not await every handler, so shutdown waits for in-flight deliveries.
  const pending = new Set();
  const send = (payload) => {
    const task = new Promise((done) => {
      const body = JSON.stringify(payload);
      if (Buffer.byteLength(body) > 1048576) return done();
      const child = spawn(config.node, config.args, {
        env: { ...process.env, TRACEFRAME_DATA_DIR: config.dataDir, TRACEFRAME_COLLECTOR_PORT: config.port },
        stdio: ["pipe", "ignore", "ignore"],
      });
      const stop = () => child.kill();
      const timer = setTimeout(stop, 5000);
      child.once("error", () => { clearTimeout(timer); done(); });
      child.once("close", () => { clearTimeout(timer); done(); });
      child.stdin.on("error", () => {});
      child.stdin.end(body);
    });
    pending.add(task);
    task.then(() => pending.delete(task));
    return task;
  };
  // Pi 0.75.3 passes a stale ctx during tool execution and the messages after it,
  // so the session is resolved once at session_start and never read again.
  let sessionId = null;
  let active = false;
  pi.on("session_start", async (event, ctx) => {
    try {
      sessionId = ctx.sessionManager.getSessionId();
      active = typeof sessionId === "string" && inside(ctx.cwd);
      if (active) await send({ version: VERSION, sessionId, type: "session_start", reason: event.reason });
    } catch {}
  });
  // A passive observer never fails a Pi turn; a broken payload is a gap.
  const capture = (type, build) =>
    pi.on(type, async (event) => {
      try {
        if (!active || typeof sessionId !== "string") return;
        const observed = build(event);
        if (observed) await send({ version: VERSION, sessionId, ...observed });
      } catch {}
    });
  pi.on("session_shutdown", async (event) => {
    try {
      await Promise.race([
        Promise.allSettled([...pending]),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      if (active && typeof sessionId === "string")
        await send({ version: VERSION, sessionId, type: "session_end", reason: event.reason });
    } catch {}
  });
  capture("message_end", (event) => {
    const message = event.message;
    if (!message) return null;
    if (message.role === "user")
      return { type: "user_message", text: text(message.content), timestamp: message.timestamp };
    if (message.role !== "assistant" || !message.usage) return null;
    return {
      type: "assistant_message",
      timestamp: message.timestamp,
      model: message.model,
      provider: message.provider,
      responseId: message.responseId,
      usage: {
        input: message.usage.input,
        output: message.usage.output,
        cacheRead: message.usage.cacheRead,
        cacheWrite: message.usage.cacheWrite,
      },
    };
  });
  capture("tool_execution_start", (event) => ({
    type: "tool_call",
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    path: event.args && typeof event.args.path === "string" ? event.args.path : null,
    text: cut(event.args),
  }));
  capture("tool_execution_end", (event) => ({
    type: "tool_result",
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    isError: event.isError === true,
    text: text(event.result && event.result.content),
  }));
}
`;
  const path = extensionPath(root);
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
