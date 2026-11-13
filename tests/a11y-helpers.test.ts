import assert from "node:assert/strict";
import { test } from "node:test";
import {
  announceCalls,
  isTypingTarget,
  modKey,
  plural,
  roveTarget,
  shortcutGroups,
  toolLabel,
} from "../web/src/a11y.ts";

test("plural and platform modifier", () => {
  assert.equal(plural(1, "time"), "1 time");
  assert.equal(plural(2, "time"), "2 times");
  assert.equal(modKey("MacIntel"), "⌘");
  assert.equal(modKey("Linux x86_64"), "Ctrl");
});

test("shortcuts stay quiet while typing", () => {
  assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
  assert.equal(isTypingTarget({ tagName: "textarea" }), true);
  assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
  assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
  assert.equal(isTypingTarget(null), false);
});

test("node labels say what happened", () => {
  assert.equal(
    toolLabel({ name: "mcp__x__y", summary: "do it", status: "failed" }, "2s"),
    "x__y, do it, failed, 2s",
  );
});

test("live announcements are batched and mention failures", () => {
  assert.equal(announceCalls([]), "");
  const one = announceCalls([{ name: "Bash", summary: "npm test", status: "ok" }]);
  assert.equal(one, "1 new tool call. Latest: Bash npm test");
  const many = announceCalls([
    { name: "Read", summary: "a.ts", status: "ok" },
    { name: "Bash", summary: "make", status: "failed" },
  ]);
  assert.equal(many, "2 new tool calls, 1 failed. Latest: Bash make");
});

test("arrow keys move focus within bounds", () => {
  assert.equal(roveTarget("ArrowDown", 0, 3), 1);
  assert.equal(roveTarget("ArrowDown", 2, 3), 2);
  assert.equal(roveTarget("ArrowUp", 0, 3), 0);
  assert.equal(roveTarget("ArrowLeft", 2, 3), 1);
  assert.equal(roveTarget("Home", 2, 3), 0);
  assert.equal(roveTarget("End", 0, 3), 2);
  assert.equal(roveTarget("a", 0, 3), null);
  assert.equal(roveTarget("ArrowDown", 0, 0), null);
});

test("the overlay lists every shortcut group", () => {
  const groups = shortcutGroups("Ctrl");
  assert.deepEqual(
    groups.map((g) => g.title),
    ["Navigation", "Canvas and lists", "Map", "Timeline (when focused)", "Global"],
  );
  assert.ok(groups[0].items.some((i) => i.keys.join("+") === "Ctrl+K"));
  assert.ok(groups.flatMap((g) => g.items).some((i) => i.keys.includes("?")));
});
