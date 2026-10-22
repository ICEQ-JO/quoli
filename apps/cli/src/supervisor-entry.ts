import { resolve } from "node:path";
import { cliConfig, requireNode } from "./config";
import { runSupervisor } from "./supervisor";

requireNode();
await runSupervisor(cliConfig(resolve(import.meta.dirname, "..")));
