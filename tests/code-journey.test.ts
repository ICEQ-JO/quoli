import assert from "node:assert/strict";
import { test } from "node:test";
import {
  initialJourney,
  mainPath,
  navigateJourney,
  relationships,
  shop,
} from "../web/src/prototype/shop.ts";

test("exploring a branch and its test preserves the request path and navigation history", () => {
  let state = navigateJourney(initialJourney, { type: "select", id: "route" });
  state = navigateJourney(state, { type: "select", id: "total" });
  state = navigateJourney(state, { type: "select", id: "test" });
  state = navigateJourney(state, { type: "select", id: "orders" });
  state = navigateJourney(state, { type: "back" });
  assert.equal(state.selected, "test");
  assert.equal(state.calculation, true);
  assert.equal(state.tests, true);
  assert.deepEqual(mainPath, ["route", "create", "save", "orders"]);
  assert.equal(navigateJourney(state, { type: "select", id: "test" }), state);
  assert.equal(navigateJourney(state, { type: "overview" }), initialJourney);
  assert.equal(navigateJourney(initialJourney, { type: "back" }), initialJourney);
  assert.equal(
    navigateJourney(navigateJourney(initialJourney, { type: "select", id: "route" }), {
      type: "back",
    }).selected,
    null,
  );
});

test("every authored relationship points to source evidence and a real example node", () => {
  for (const e of relationships) {
    const from = shop[e.from];
    const to = shop[e.to];
    const source = from.code.split("\n")[e.line - 1];
    assert.ok(source, `${from.file}:${e.line} exists`);
    assert.ok(source.includes(to.name), `${e.label} evidence names ${to.name}`);
  }
  for (let i = 1; i < mainPath.length; i++) {
    assert.ok(relationships.some((e) => e.from === mainPath[i - 1] && e.to === mainPath[i]));
  }
});

test("the displayed total example calculates cents and rejects invalid input", () => {
  // Exercise the exact displayed source so the teaching example cannot drift from its claims.
  const source = shop.total.code
    .replace(/^export type Item.*\n/, "")
    .replace("export function", "function")
    .replace("items: Item[]", "items");
  const total = new Function(`${source}; return totalCents;`)() as (items: unknown) => number;
  assert.equal(total([{ priceCents: 1999, quantity: 3 }]), 5997);
  for (const invalid of [
    null,
    [],
    [null],
    [{ priceCents: 1, quantity: -1 }],
    [{ priceCents: 1.2, quantity: 1 }],
    [{ priceCents: Number.MAX_SAFE_INTEGER, quantity: 2 }],
  ]) {
    assert.throws(() => total(invalid));
  }
});
