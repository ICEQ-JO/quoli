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

test("money shows $0.00 when there are no tokens to price", () => {
  assert.equal(money({ usd: null, unpriced: [] }, zero), "$0.00");
});

test("money keeps the dash when tokens exist but nothing could be priced", () => {
  assert.equal(money({ usd: null, unpriced: ["x"] }, { ...zero, input: 5 }), "—");
  assert.equal(money({ usd: null, unpriced: [] }), "—");
});
