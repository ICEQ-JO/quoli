import { createHash } from "node:crypto";
import type { NormalizedEvent } from "@traceframe/schema";

/**
 * Narrow local receiver for reported Claude Code usage.
 *
 * It accepts the OTLP logs encoding (`http/json`) that the runtime
 * verification exercised, keeps only the request-usage records, drops every
 * personal attribute before anything is stored, and turns each reported request
 * into one usage observation.
 */

export const OTLP_RECEIVER_PRODUCER = "claude-otel-receiver-v1";

/** Attributes that identify a person or an account. They are never stored. */
export const PERSONAL_ATTRIBUTES = [
  "user.id",
  "user.email",
  "organization.id",
  "user.account_uuid",
  "user.account_id",
] as const;

type OtlpValue = {
  stringValue?: string;
  intValue?: number | string;
  doubleValue?: number;
  boolValue?: boolean;
};

type LogRecord = {
  timeUnixNano?: string | number;
  observedTimeUnixNano?: string | number;
  body?: { stringValue?: string };
  attributes?: { key: string; value?: OtlpValue }[];
};

type OtlpBody = {
  resourceLogs?: {
    resource?: { attributes?: { key: string; value?: OtlpValue }[] };
    scopeLogs?: { logRecords?: LogRecord[] }[];
  }[];
};

function attributeValue(value: OtlpValue | undefined): string | number | boolean | null {
  if (!value) return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.intValue !== undefined) return value.intValue;
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.boolValue !== undefined) return value.boolValue;
  return null;
}

function attributes(record: LogRecord): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const attribute of record.attributes ?? []) {
    const value = attributeValue(attribute.value);
    if (value === null) continue;
    if ((PERSONAL_ATTRIBUTES as readonly string[]).includes(attribute.key)) continue;
    result[attribute.key] = value;
  }
  return result;
}

function count(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function id(prefix: string, parts: unknown[]): string {
  return `${prefix}-${createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 32)}`;
}

function timestamp(value: string | number | undefined): string | null {
  if (value === undefined) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const date = new Date(Math.round(numeric / 1_000_000));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Turns one OTLP logs body into usage observations. Records that are not
 * request-usage records are ignored: this receiver is narrow on purpose.
 */
export function otlpUsageEvents(body: OtlpBody, projectId: string): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  for (const resourceLog of body.resourceLogs ?? []) {
    const resource = attributes({ attributes: resourceLog.resource?.attributes } as LogRecord);
    for (const scope of resourceLog.scopeLogs ?? []) {
      for (const record of scope.logRecords ?? []) {
        const attrs = attributes(record);
        if (attrs["event.name"] !== "api_request") continue;
        const sessionId = attrs["session.id"];
        if (typeof sessionId !== "string") continue;
        // A record without a request identity is kept with null counts, so the
        // usage view reports the gap instead of quietly losing it.
        const requestId = typeof attrs.request_id === "string" ? attrs.request_id : null;
        const model = typeof attrs.model === "string" ? attrs.model : null;
        const input = count(attrs.input_tokens);
        const output = count(attrs.output_tokens);
        const cacheRead = count(attrs.cache_read_tokens);
        const cacheWrite = count(attrs.cache_creation_tokens);
        const identity = requestId ?? [record.timeUnixNano, attrs["event.sequence"]];
        events.push({
          schemaVersion: 1,
          id: id("otel", [sessionId, identity]),
          deliveryId: id("deliver", [sessionId, identity]),
          projectId,
          sessionId,
          source: "claude_otel",
          adapterVersion: "0.1.0",
          sourceLocator: `claude_otel:api_request:${resource["service.version"] ?? "unknown"}`,
          producerId: OTLP_RECEIVER_PRODUCER,
          promptId: typeof attrs["prompt.id"] === "string" ? attrs["prompt.id"] : null,
          toolId: null,
          requestId,
          sourceTime: timestamp(record.timeUnixNano ?? record.observedTimeUnixNano),
          sourceSequence: count(attrs["event.sequence"]),
          policyVersion: 1,
          payload: {
            kind: "usage",
            input,
            output,
            cacheRead,
            cacheWrite,
            model: model ?? "unknown-model",
            temporality: "request_delta",
          },
        });
      }
    }
  }
  return events;
}

/** Parses and validates an OTLP logs body. */
export function readOtlpBody(text: string): OtlpBody | null {
  try {
    const parsed = JSON.parse(text) as OtlpBody;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.resourceLogs)) return null;
    return parsed;
  } catch {
    return null;
  }
}
