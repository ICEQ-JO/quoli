import type { CapturePolicy, Content } from "@traceframe/schema";
import { sanitizeContent } from "@traceframe/schema/privacy";

/** Policy-disabled content for a path that must not be read. */
export function disabledContent(): Content {
  return { text: null, state: "disabled", originalBytes: null, categories: ["code"] };
}

/** Decodes provider bytes with the same binary, encoding and policy checks as local capture. */
export function decodeProviderContent(bytes: Buffer, policy: CapturePolicy): Content {
  if (bytes.includes(0))
    return { text: null, state: "unsupported", originalBytes: bytes.length, categories: ["code"] };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { text: null, state: "malformed", originalBytes: bytes.length, categories: ["code"] };
  }
  return sanitizeContent(
    { text, state: "present", originalBytes: bytes.length, categories: ["code"] },
    policy,
    ["code"],
  );
}
