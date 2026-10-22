import { existsSync, readFileSync } from "node:fs";
import { runtime } from "@traceframe/storage/runtime";

/**
 * The bridge retry spool lives next to the store. The collector reports its
 * depth so a capture loss is visible instead of silent.
 */
export function spooledObservations(): number {
  const path = `${runtime().dataDir}/bridge-spool.jsonl`;
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim()).length;
}
