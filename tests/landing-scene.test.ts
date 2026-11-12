import assert from "node:assert/strict";
import { test } from "node:test";
import { SESSION_DURATION, SESSION_STEPS, sessionAt } from "../web/src/landing/scene-model.ts";

test("recorder transport and terminal use the same session clock, including replay", () => {
  assert.equal(sessionAt(0).event.kind, "prompt");
  assert.equal(sessionAt(4.5).event.kind, "edit");
  assert.equal(sessionAt(7).event.kind, "run");
  assert.equal(sessionAt(9.5).event.file, "tests/checkout.test.ts");
  assert.equal(sessionAt(12).event.kind, "review");
  assert.equal(sessionAt(SESSION_DURATION).step, 0);
  assert.equal(sessionAt(-5).time, 0);
  assert.equal(sessionAt(Number.NaN).step, 0);
  for (const event of SESSION_STEPS) assert.equal(sessionAt(event.at).event, event);
});
