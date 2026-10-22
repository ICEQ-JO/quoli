import assert from "node:assert/strict";
import { test } from "node:test";
import {
  claudeHookSamples,
  claudeOtlpSamples,
  claudePersonalAttributes,
  claudeRuntimeProbe,
} from "../fixtures/claude";

test("the recorded runtime evidence names the tested version and encoding", () => {
  assert.equal(claudeRuntimeProbe.version, "2.1.306");
  assert.equal(claudeRuntimeProbe.selectedLogEncoding, "http/json");
  assert.equal(claudeRuntimeProbe.otlpPath, "/v1/logs");
});

test("the hook fixtures keep the observed source shape", () => {
  const samples = claudeHookSamples();
  const byEvent = new Map(samples.map((sample) => [sample.hook_event_name, sample]));
  assert.ok(byEvent.has("SessionStart"));
  assert.ok(byEvent.has("UserPromptSubmit"));
  assert.ok(byEvent.has("PreToolUse"));
  assert.ok(byEvent.has("PostToolUse"));
  assert.ok(byEvent.has("PostToolUseFailure"));
  assert.ok(byEvent.has("Stop"));
  assert.ok(byEvent.has("SessionEnd"));
  const start = byEvent.get("SessionStart");
  assert.ok(start);
  assert.deepEqual(Object.keys(start).sort(), [
    "cwd",
    "hook_event_name",
    "session_id",
    "source",
    "transcript_path",
  ]);
  const failure = byEvent.get("PostToolUseFailure");
  assert.ok(failure);
  // The observed payload carries the exit code inside an error string only.
  assert.equal(failure.error, "Exit code 3");
  assert.equal(failure.is_interrupt, false);
  assert.equal("exitCode" in failure, false);
  const result = byEvent.get("PostToolUse");
  assert.ok(result?.tool_response);
  assert.deepEqual(Object.keys(result.tool_response).sort(), [
    "interrupted",
    "isImage",
    "noOutputExpected",
    "stderr",
    "stdout",
  ]);
});

test("the telemetry fixtures expose the three joinable identifiers and no personal data", () => {
  const samples = claudeOtlpSamples();
  const byEvent = new Map(samples.map((sample) => [sample.attributes["event.name"], sample]));
  assert.deepEqual([...byEvent.keys()].sort(), [
    "api_request",
    "assistant_response",
    "tool_decision",
    "tool_result",
    "user_prompt",
  ]);
  for (const sample of samples) {
    for (const attribute of claudePersonalAttributes)
      assert.equal(attribute in sample.attributes, false, `${attribute} must not be retained`);
    assert.ok("session.id" in sample.attributes);
  }
  const request = byEvent.get("api_request");
  assert.ok(request);
  assert.equal(request.attributes["request_id"], "req_synthetic_0001");
  assert.equal(typeof request.attributes.input_tokens, "number");
  assert.equal(typeof request.attributes.output_tokens, "number");
  // Prompt and answer text stay redacted while the content gates are off.
  assert.equal(byEvent.get("user_prompt")?.attributes.prompt, "<REDACTED>");
  assert.equal(byEvent.get("assistant_response")?.attributes.response, "<REDACTED>");
  // The tool result reports success as a string, not a boolean.
  assert.equal(byEvent.get("tool_result")?.attributes.success, "true");
});

test("the fixtures share one session and prompt identity across both sources", () => {
  const hook = claudeHookSamples().find((sample) => sample.hook_event_name === "UserPromptSubmit");
  const telemetry = claudeOtlpSamples().find(
    (sample) => sample.attributes["event.name"] === "api_request",
  );
  assert.ok(hook && telemetry);
  assert.equal(hook.session_id, telemetry.attributes["session.id"]);
  assert.equal(hook.prompt_id, telemetry.attributes["prompt.id"]);
});
