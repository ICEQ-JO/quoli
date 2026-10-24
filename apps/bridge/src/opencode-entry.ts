import { eventSchema, MAX_BODY } from "@traceframe/schema";
import { isExcluded, sanitizeEvent } from "@traceframe/schema/privacy";
import { retryCaptureState } from "@traceframe/storage/policy";
import { credential, runtime } from "@traceframe/storage/runtime";
import { spool } from "@traceframe/storage/spool";
import { normalizeOpenCode } from "./opencode";

async function main() {
  const projectId = process.argv[2];
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(projectId ?? "")) return;
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size <= MAX_BODY) chunks.push(Buffer.from(chunk));
  }
  if (size > MAX_BODY) return;
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const event = normalizeOpenCode(input, projectId);
  if (!event) return;
  const capture = retryCaptureState(projectId);
  // An unregistered/unreadable store cannot establish this plugin's project scope.
  if (capture.state !== "active") return;
  const safe = eventSchema.parse(sanitizeEvent(event, capture.policy));
  if (safe.payload.kind === "tool_result") {
    // A missing call cannot prove a result belongs to a permitted path.
    if (
      (input.toolPath !== null && typeof input.toolPath !== "string") ||
      (typeof input.toolPath === "string" &&
        (input.toolPath.length > 1024 || isExcluded(input.toolPath, capture.policy)))
    )
      safe.payload.content = { ...safe.payload.content, text: null, state: "disabled" };
  }
  try {
    const response = await fetch(`http://127.0.0.1:${runtime().collectorPort}/v1/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credential()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ events: [safe] }),
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) return;
  } catch {}
  spool(safe, safe.payload.kind === "tool_result" ? input.toolPath : undefined);
}

// A passive observer never fails the harness or prints captured input.
main().catch(() => {
  process.exitCode = 0;
});
