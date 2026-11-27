import assert from "node:assert/strict";
import { test } from "node:test";
import { money, plural } from "../web/src/format.ts";

const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

test("plural uses the singular only for exactly one", () => {
  assert.equal(plural(0, "file"), "0 files");
  assert.equal(plural(1, "file"), "1 file");
  assert.equal(plural(2, "file"), "2 files");
  assert.equal(plural(2, "branch", "branches"), "2 branches");
});

test("money shows an explicit no-usage state instead of $0.00", () => {
  assert.equal(money({ usd: null, unpriced: [] }, zero), "No usage");
});

test("money shows an explicit unpriced state when usage cannot be priced", () => {
  assert.equal(money({ usd: null, unpriced: ["x"] }, { ...zero, input: 5 }), "Unpriced");
  assert.equal(
    money({ usd: null, unpriced: ["x"] }, { ...zero, input: 1200, output: 300 }),
    "Unpriced",
  );
  assert.equal(money({ usd: null, unpriced: ["x"] }), "Unpriced");
  assert.equal(money({ usd: null, unpriced: [] }), "—");
});

test("money shows estimated dollars when priced", () => {
  assert.equal(money({ usd: 1.234, unpriced: [] }, { ...zero, input: 10 }), "$1.23");
  assert.equal(money({ usd: 0, unpriced: [] }, { ...zero, input: 10 }), "$0.00");
});
