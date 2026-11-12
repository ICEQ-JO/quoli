import { parentPort, workerData } from "node:worker_threads";
import { type BuildOptions, buildCodeGraph } from "./build.ts";

// Runs one build off the main thread (parsing is CPU-bound WASM) and posts the graph back.
buildCodeGraph(workerData as BuildOptions).then(
  (graph) => parentPort?.postMessage({ graph }),
  (error) =>
    parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) }),
);
