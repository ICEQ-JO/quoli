import { runtime } from "@traceframe/storage/runtime";
import { startCollector } from "./server";

const server = startCollector();
server.on("listening", () =>
  console.log(`Traceframe collector ready on 127.0.0.1:${runtime().collectorPort} (local preview)`),
);
server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === "EADDRINUSE"
      ? "Collector port is busy. Stop the other process or set TRACEFRAME_COLLECTOR_PORT."
      : "Collector could not start. Check local data permissions and port configuration.",
  );
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close();
    server.closeAllConnections();
  });
