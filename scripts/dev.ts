import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { credential, initializeCredential, runtime } from "../packages/storage/src/runtime";
import { seed } from "./seed";

process.env.NEXT_TELEMETRY_DISABLED = "1";
const config = runtime();
const children: ChildProcess[] = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children)
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
    }
  setTimeout(() => {
    for (const child of children)
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }
    process.exit(code);
  }, 1500).unref();
  process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => stop());
async function available(port: number) {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} is busy. Stop the other process or set TRACEFRAME_WEB_PORT / TRACEFRAME_COLLECTOR_PORT.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(() => resolve()));
  });
}
function child(command: string, args: string[]) {
  const p = spawn(command, args, { stdio: "inherit", env: process.env, detached: true });
  children.push(p);
  p.once("error", () => stop(1));
  p.once("exit", (code) => {
    if (!stopping) stop(code || 1);
  });
  return p;
}
try {
  if (config.collectorPort === config.webPort)
    throw new Error("Collector and web ports must differ.");
  await available(config.collectorPort);
  await available(config.webPort);
  initializeCredential();
  child(process.execPath, ["--import", "tsx", "apps/collector/src/index.ts"]);
  let ready = false;
  for (let n = 0; n < 60 && !stopping; n++) {
    try {
      const r = await fetch(`http://127.0.0.1:${config.collectorPort}/health`, {
        headers: { Authorization: `Bearer ${credential()}` },
        signal: AbortSignal.timeout(500),
      });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  if (!ready) throw new Error("Collector did not become ready. Check local data permissions.");
  if (process.argv.includes("--demo")) await seed();
  child(process.execPath, [
    "apps/web/node_modules/next/dist/bin/next",
    "dev",
    "apps/web",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(config.webPort),
  ]);
  console.log(
    `\nTraceframe → http://127.0.0.1:${config.webPort}\nSynthetic local demo. Press Ctrl+C to stop both services.\n`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Local startup failed.");
  stop(1);
}
