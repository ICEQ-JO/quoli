import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyRetention, createApp, json } from "./app.ts";
import { HOOK_AGENTS, refreshHooks } from "./connect.ts";
import { Store } from "./db.ts";
import { startLivePrices } from "./liveprices.ts";
import { isSetUp, refreshSetup, START, spoolFile } from "./setup.ts";
import { drainSpool } from "./spool.ts";
import { waitlistRequest } from "./waitlist.ts";

const landing = process.argv.includes("--landing");
const PORT = Number(process.env.QUOLI_PORT ?? (landing ? 4420 : 4400));
const HOST = "127.0.0.1";
const appRoot = resolve(fileURLToPath(import.meta.url), "../..");
const production = process.env.NODE_ENV === "production";

const store = new Store();
if (process.argv.includes("--demo")) {
  const { seedDemo } = await import("./demo.ts");
  seedDemo(store);
  if (process.argv.includes("--large")) {
    const { seedLargeDemo } = await import("./large-demo.ts");
    seedLargeDemo(store);
  }
}

const app = createApp(store, () => PORT);

function guard(req: IncomingMessage): boolean {
  // Rejects DNS-rebinding: only loopback host names may talk to this server.
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  return host === "127.0.0.1" || host === "localhost";
}

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

const vite = production
  ? null
  : await (await import("vite")).createServer({
      configFile: join(appRoot, "vite.config.ts"),
      server: { middlewareMode: true, hmr: { port: PORT + 1 } },
      appType: "spa",
    });

const server = createServer(async (req, res) => {
  if (!guard(req)) return json(res, 403, { error: "Loopback only" });
  const url = new URL(req.url ?? "/", `http://${HOST}`);
  try {
    if (url.pathname === "/api/waitlist") return await waitlistRequest(req, res);
    if (await app.api(req, res, url)) return;
  } catch (error) {
    return json(res, 500, { error: String(error) });
  }
  if (vite) return vite.middlewares(req, res);
  const dist = join(appRoot, "dist");
  const file = normalize(join(dist, url.pathname));
  const target = /^\/landing\/?$/.test(url.pathname)
    ? join(dist, "landing/index.html")
    : file.startsWith(dist) && extname(file)
      ? file
      : join(dist, "index.html");
  try {
    res.writeHead(200, { "Content-Type": MIME[extname(target)] ?? "application/octet-stream" });
    res.end(readFileSync(target));
  } catch {
    json(res, 404, {});
  }
});

applyRetention(store);
const roots = [
  ...new Set([
    ...store.registeredProjects().map((p) => p.root),
    ...store.roots().map((r) => r.root),
  ]),
];
for (const root of refreshHooks(roots))
  console.log(`  Updated Quoli's hook in ${root} to port ${PORT}`);
if (!landing) {
  for (const agent of refreshSetup()) console.log(`  Updated Quoli's user-level ${agent} install`);
  startLivePrices(() => store.settings().livePrices);
  setInterval(() => void app.sync(), 60_000).unref();
  const queued = drainSpool(store, spoolFile());
  if (queued) console.log(`  Recorded ${queued} events sent while Quoli was closed`);
}
setInterval(() => applyRetention(store), 3_600_000).unref();

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code !== "EADDRINUSE") throw error;
  console.log(
    `\n  Port ${PORT} is already in use, most likely by a Quoli that is still running.\n` +
      `  Open http://${HOST}:${PORT}, or stop that one (Ctrl+C in its terminal) and run this again.\n` +
      "  To run both, add --port 4401.\n",
  );
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log(`\n  Quoli → http://${HOST}:${PORT}${landing ? "/landing/" : ""}\n`);
  if (!landing && !store.roots().length && HOOK_AGENTS.some(isSetUp)) {
    console.log(
      "  No sessions yet: start your coding agent in any repository and it appears here.\n",
    );
  } else if (!landing && !store.roots().length) {
    console.log(
      `  No sessions yet. Run \`${START === "pnpm dev" ? "pnpm quoli-setup" : `${START} setup`}\` once, or \`${START === "pnpm dev" ? "pnpm demo" : `${START} demo`}\` to explore sample data.\n`,
    );
  }
});
