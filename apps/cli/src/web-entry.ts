import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runtime } from "../../../packages/storage/src/runtime";

process.env.HOSTNAME = "127.0.0.1";
process.env.PORT = String(runtime().webPort);
process.env.NODE_ENV = "production";
process.env.NEXT_TELEMETRY_DISABLED = "1";
// A supervisor crash disconnects IPC. Exit rather than leaving an orphan web listener.
if (process.env.QUOLI_MANAGED_CHILD === "1") process.on("disconnect", () => process.exit(0));
await import(pathToFileURL(resolve(import.meta.dirname, "../web/apps/web/server.js")).href);
