/** Synthetic shapes from OpenCode v2.0.32's public durable event schemas. */
export function openCodeSamples(root = "/synthetic/repository") {
  const frame = (type: string, data: Record<string, unknown>, seq: number) => ({
    id: `evt_synthetic_${seq}`,
    type,
    created: 1_792_756_800_000 + seq,
    location: { directory: root },
    durable: {
      aggregateID: String(data.sessionID ?? "ses_synthetic"),
      seq,
      version: type === "session.tool.success" || type === "session.tool.failed" ? 2 : 1,
    },
    data: { sessionID: "ses_synthetic", ...data } as Record<string, unknown>,
  });
  return [
    frame(
      "session.created",
      {
        projectID: "prj_synthetic",
        location: { directory: root },
        slug: "synthetic",
        version: "2.0.32",
      },
      1,
    ),
    frame(
      "session.inbox.enqueued",
      {
        inboxID: "msg_user",
        item: {
          type: "user",
          delivery: "queue",
          payload: { text: "Explain the synthetic change" },
        },
      },
      2,
    ),
    frame(
      "session.step.started",
      {
        assistantMessageID: "msg_assistant",
        agent: "build",
        model: { id: "fixture-model", providerID: "fixture-provider" },
        started: 1_792_756_800_002,
      },
      3,
    ),
    frame(
      "session.tool.input.started",
      { assistantMessageID: "msg_assistant", id: "call_read", name: "read" },
      4,
    ),
    frame(
      "session.tool.called",
      {
        assistantMessageID: "msg_assistant",
        id: "call_read",
        input: { filePath: "src/example.ts" },
        executed: false,
      },
      5,
    ),
    frame(
      "session.tool.success",
      {
        assistantMessageID: "msg_assistant",
        id: "call_read",
        content: [{ type: "text", text: "synthetic file" }],
        executed: false,
      },
      6,
    ),
    frame(
      "session.tool.input.started",
      { assistantMessageID: "msg_assistant", id: "call_extension", name: "mcp.example.inspect" },
      7,
    ),
    frame(
      "session.tool.called",
      {
        assistantMessageID: "msg_assistant",
        id: "call_extension",
        input: { query: "synthetic" },
        executed: false,
      },
      8,
    ),
    frame(
      "session.tool.failed",
      {
        assistantMessageID: "msg_assistant",
        id: "call_extension",
        error: { type: "UnknownError", message: "Synthetic failure" },
        executed: false,
      },
      9,
    ),
    frame(
      "session.step.ended",
      {
        assistantMessageID: "msg_assistant",
        finish: "stop",
        cost: 0.125,
        tokens: { input: 20, output: 8, reasoning: 3, cache: { read: 4, write: 2 } },
      },
      10,
    ),
    frame(
      "session.created",
      {
        sessionID: "ses_child",
        parentID: "ses_synthetic",
        projectID: "prj_synthetic",
        location: { directory: root },
        slug: "child",
        version: "2.0.32",
      },
      11,
    ),
  ];
}

export function openCodeObservations(root?: string) {
  return openCodeSamples(root).map((event) => ({
    sourceVersion: "2.0.32",
    event,
    model: { id: "fixture-model", providerID: "fixture-provider" },
    toolName: String(event.data.id ?? "").includes("extension") ? "mcp.example.inspect" : "read",
  }));
}
