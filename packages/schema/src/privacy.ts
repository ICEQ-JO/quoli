import { Buffer } from "node:buffer";
import { type CapturePolicy, type Content, eventSchema, type NormalizedEvent } from "./index";

// Bounded inputs only. This is risk reduction, not a complete secret detector.
export function redact(text: string): string {
  return text
    .replace(
      /-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-\r\n]*PRIVATE KEY-----|$)/g,
      "[REDACTED PRIVATE KEY]",
    )
    .replace(
      /\b(?:sk-[a-zA-Z0-9_-]{8,}|gh[pousr]_[a-zA-Z0-9_]{8,}|github_pat_[a-zA-Z0-9_]{8,}|AKIA[A-Z0-9]{16})\b/g,
      "[REDACTED]",
    )
    .replace(/\b(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;"'}]+/gi, "$1[REDACTED]")
    .replace(
      /\b((?:api[_-]?key|password|secret|token)\s*["']?\s*[:=]\s*["']?)[^\s,;"'}]+/gi,
      "$1[REDACTED]",
    );
}
function truncate(text: string, limit: number): string {
  const bytes = Buffer.from(text);
  if (bytes.length <= limit) return text;
  const suffix = "\n[TRUNCATED]";
  // Drop a partial final UTF-8 sequence instead of producing a replacement character.
  let end = Math.max(0, limit - Buffer.byteLength(suffix));
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString("utf8") + suffix;
}
export function sanitizeContent(
  content: Content,
  policy: CapturePolicy,
  categories = content.categories,
): Content {
  const originalBytes =
    content.originalBytes ?? (content.text === null ? null : Buffer.byteLength(content.text));
  if (categories.some((c) => !policy[c]))
    return { text: null, state: "disabled", originalBytes, categories };
  if (content.text === null) return { ...content, categories, originalBytes };
  const clean = redact(content.text);
  const text = truncate(clean, policy.maxFieldBytes);
  const state = text !== clean ? "truncated" : clean !== content.text ? "redacted" : content.state;
  return { text, state, originalBytes, categories };
}
export function isExcluded(path: string, policy: CapturePolicy): boolean {
  const segments = path.replaceAll("\\", "/").toLowerCase().split("/");
  return segments.some(
    (part) => part === ".." || policy.excludedPaths.some((p) => part.includes(p.toLowerCase())),
  );
}
export function sanitizeEvent(raw: NormalizedEvent, policy: CapturePolicy): NormalizedEvent {
  const event = eventSchema.parse(raw);
  if (event.sourceLocator !== null) event.sourceLocator = redact(event.sourceLocator);
  const p = event.payload;
  if (p.kind === "repository_state" && p.branch !== null) p.branch = redact(p.branch);
  if ("content" in p) {
    // A tool payload may contain code in any nested position. Until tool-specific
    // classification exists, conservatively require BOTH tool and code consent.
    const categories: Content["categories"] =
      p.kind === "prompt" || p.kind === "session_start" ? ["prompt", "code"] : ["tool", "code"];
    p.content = sanitizeContent(p.content, policy, categories);
    if (p.kind === "tool_call" && p.path !== null) {
      if (!policy.code || isExcluded(p.path, policy)) {
        p.path = null;
        p.content = { ...p.content, text: null, state: "disabled" };
      } else p.path = redact(p.path);
    }
  }
  return eventSchema.parse(event);
}
