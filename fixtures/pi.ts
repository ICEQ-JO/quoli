// Synthetic Pi extension envelopes in the shape Quoli's generated extension sends.
//
// The shapes were recorded against Pi 0.75.3 in a disposable project with an
// isolated PI_CODING_AGENT_DIR and a local OpenAI-compatible stub provider, so no
// account, network call or paid API was used. Identifiers, paths, model name and
// prompts below are fixed placeholders.
//
// One quirk is preserved from that run: Pi supplies a stale extension context
// during tool execution, so the generated extension resolves the session once at
// session_start. These envelopes therefore carry the session id explicitly.

export const piProbe = {
  version: "0.75.3",
  command: "pi",
  /** Where the documented contract lives (shipped docs/extensions.md). */
  contract:
    "https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/extensions.md",
  events: [
    "session_start",
    "user_message",
    "tool_call",
    "tool_result",
    "assistant_message",
    "session_end",
  ] as const,
  /** Every envelope type was exercised against the real CLI. */
  observedEvents: [
    "session_start",
    "user_message",
    "tool_call",
    "tool_result",
    "assistant_message",
    "session_end",
  ] as const,
  documentedOnlyEvents: [] as const,
  observedAt: "2026-10-24",
  basis: "observed" as const,
  extensionPath: ".pi/extensions/quoli.ts",
};

export type PiEnvelopeSample = {
  version: string;
  sessionId: string;
  type: string;
  reason?: string;
  text?: string | null;
  timestamp?: number;
  toolCallId?: string;
  toolName?: string;
  path?: string | null;
  isError?: boolean;
  model?: string;
  provider?: string;
  responseId?: string;
  usage?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
};

const session = "018f1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5b";
const request = 1_792_864_638_803;
const started = 1_792_864_638_760;

export function piEnvelopeSamples(): PiEnvelopeSample[] {
  return [
    {
      version: piProbe.version,
      sessionId: session,
      type: "session_start",
      reason: "startup",
      timestamp: started,
    },
    {
      version: piProbe.version,
      sessionId: session,
      type: "user_message",
      text: "synthetic probe prompt",
      timestamp: request,
    },
    {
      version: piProbe.version,
      sessionId: session,
      type: "tool_call",
      toolCallId: "call_synthetic_read_1",
      toolName: "read",
      path: "/synthetic/project/probe.txt",
      text: '{"path":"/synthetic/project/probe.txt"}',
    },
    {
      version: piProbe.version,
      sessionId: session,
      type: "tool_result",
      toolCallId: "call_synthetic_read_1",
      toolName: "read",
      isError: false,
      text: "probe contents",
      timestamp: request + 84,
    },
    {
      version: piProbe.version,
      sessionId: session,
      type: "assistant_message",
      timestamp: request + 200,
      model: "stub-model",
      provider: "stub",
      responseId: "chatcmpl-synthetic-1",
      usage: { input: 20, output: 2, cacheRead: 0, cacheWrite: 0 },
    },
    {
      version: piProbe.version,
      sessionId: session,
      type: "session_end",
      reason: "quit",
      timestamp: request + 400,
    },
  ];
}
