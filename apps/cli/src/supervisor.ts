import { type ChildProcess, fork } from "node:child_process";
import { createServer, type Server } from "node:http";
import { createServer as createPortProbe } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { credential } from "../../../packages/storage/src/runtime";
import { type CliConfig, childEnvironment } from "./config";
import { equal, readState, removeState, type ServiceState, signature, writeState } from "./control";

export async function portAvailable(port: number) {
  await new Promise<void>((resolve, reject) => {
    const probe = createPortProbe();
    probe.once("error", () =>
      reject(
        new Error(
          `Port ${port} is busy. Stop the existing instance or choose matching TRACEFRAME_* port overrides.`,
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve()));
  });
}
export async function runSupervisor(config: CliConfig) {
  const initial = readState(config);
  if (!initial || initial.instance !== process.env.QUOLI_SERVICE_INSTANCE)
    throw new Error("Managed startup reservation is unavailable.");
  let state: ServiceState = initial;
  let phase: "starting" | "ready" | "stopping" = "starting";
  const children: ChildProcess[] = [];
  let server: Server | undefined;
  let stopping: Promise<void> | undefined;
  const health = () => ({
    instance: state.instance,
    phase,
    webPort: state.webPort,
    collectorPort: state.collectorPort,
    startedAt: state.startedAt,
  });
  function stop(code = 0): Promise<void> {
    if (stopping) return stopping;
    phase = "stopping";
    stopping = (async () => {
      for (const child of children)
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      for (
        let n = 0;
        n < 50 && children.some((child) => child.exitCode === null && child.signalCode === null);
        n++
      )
        await delay(100);
      for (const child of children)
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      if (server)
        await new Promise<void>((resolve) => {
          server?.close(() => resolve());
          server?.closeAllConnections();
        });
      removeState(config, state.instance);
      process.exitCode = code;
    })();
    return stopping;
  }
  const signalStop = () => {
    void stop();
  };
  process.once("SIGTERM", signalStop);
  process.once("SIGINT", signalStop);
  process.once("disconnect", signalStop);
  function child(script: string) {
    const instance = fork(join(config.releaseRoot, "runtime", script), [], {
      cwd: config.releaseRoot,
      env: { ...childEnvironment(config), QUOLI_MANAGED_CHILD: "1" },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    children.push(instance);
    instance.once("error", () => {
      console.error("A Quoli runtime process could not start.");
      void stop(1);
    });
    instance.once("exit", (code) => {
      if (phase !== "stopping") {
        console.error("A Quoli runtime process exited; stopping the managed instance.");
        void stop(code || 1);
      }
    });
    return instance;
  }
  async function waitFor(url: string, authenticated = false) {
    for (let n = 0; n < 150; n++) {
      if (phase === "stopping") throw new Error("Runtime stopped during startup.");
      try {
        const response = await fetch(url, {
          headers: authenticated ? { Authorization: `Bearer ${credential()}` } : {},
          signal: AbortSignal.timeout(500),
          redirect: "error",
        });
        if (response.ok) return;
      } catch {
        /* The production listener may still be starting. */
      }
      await delay(100);
    }
    throw new Error("Quoli did not become ready. Inspect quoli-service.log.");
  }
  try {
    if (config.webPort === config.collectorPort)
      throw new Error("Web and collector ports must differ.");
    await portAvailable(config.collectorPort);
    await portAvailable(config.webPort);
    server = createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      const localPort = req.socket.localPort;
      if (
        req.headers.origin ||
        (req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "none") ||
        ![`127.0.0.1:${localPort}`, `localhost:${localPort}`].includes(req.headers.host ?? "")
      ) {
        res.writeHead(403);
        res.end("{}");
        return;
      }
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${localPort}`);
      const challenge = url.searchParams.get("challenge") ?? "";
      if (
        req.method === "GET" &&
        url.pathname === "/identity" &&
        /^[a-f0-9]{48}$/.test(challenge)
      ) {
        res.end(
          JSON.stringify({
            instance: state.instance,
            signature: signature(state.token, challenge),
          }),
        );
        return;
      }
      if (!equal(req.headers.authorization ?? "", `Bearer ${state.token}`)) {
        res.writeHead(401);
        res.end("{}");
        return;
      }
      if (
        (req.method === "GET" && url.pathname === "/status") ||
        (req.method === "POST" && url.pathname === "/stop")
      ) {
        res.end(JSON.stringify(health()));
        if (url.pathname === "/stop") void stop();
        return;
      }
      res.writeHead(404);
      res.end("{}");
    });
    server.requestTimeout = 1500;
    server.headersTimeout = 1500;
    await new Promise<void>((resolve, reject) => {
      server?.once("error", reject);
      server?.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Control listener unavailable.");
    if ([config.webPort, config.collectorPort].includes(address.port))
      throw new Error("Control port collision; retry startup.");
    state = { ...state, pid: process.pid, controlPort: address.port };
    writeState(config, state);
    child("collector.mjs");
    await waitFor(`http://127.0.0.1:${config.collectorPort}/health`, true);
    child("web.mjs");
    await waitFor(`${config.url}/api/health`);
    phase = "ready";
    console.log(`Quoli ready at ${config.url}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Quoli startup failed.");
    await stop(1);
  }
}
