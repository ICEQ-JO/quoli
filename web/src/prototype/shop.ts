/** Authored teaching example. These relationships are not extracted or observed at runtime. */
export const shop = {
  route: {
    name: "POST /orders",
    kind: "Endpoint",
    file: "api/orders.ts",
    description:
      "Accepts an order and passes its items to the order service. The response contains the new order ID.",
    code: `import { Hono } from "hono";
import { createOrder } from "../services/orders";
const app = new Hono();
app.post("/orders", async (c) => {
  const { items } = await c.req.json();
  const order = createOrder(items);
  return c.json(order, 201);
});`,
    x: 20,
    y: 70,
  },
  create: {
    name: "createOrder",
    kind: "Function",
    file: "services/orders.ts",
    description:
      "Calculates the total before saving the order. Inspect the calculation branch to see how invalid quantities are rejected.",
    code: `import { totalCents, type Item } from "./total";
import { saveOrder } from "../data/orders";

export function createOrder(items: Item[]) {
  const amount = totalCents(items);
  return saveOrder(amount);
}`,
    x: 230,
    y: 70,
  },
  save: {
    name: "saveOrder",
    kind: "Function",
    file: "data/orders.ts",
    description:
      "Inserts the calculated total using a bound SQL parameter, then returns the generated ID. This is where the request changes stored data.",
    code: `import { db } from "./db";

// db is a local SQLite connection.
export function saveOrder(totalCents: number) {
  const result = db.prepare(
    "INSERT INTO orders (total_cents) VALUES (?)"
  ).run(totalCents);
  return { id: Number(result.lastInsertRowid) };
}`,
    x: 440,
    y: 70,
  },
  orders: {
    name: "orders",
    kind: "Table",
    file: "data/schema.sql",
    description:
      "Stores the order ID and its total in integer cents. The schema refuses negative totals. No customer or payment information is stored in this example.",
    code: `create table orders (
  id integer primary key,
  total_cents integer not null
    check (total_cents >= 0)
);`,
    x: 440,
    y: 270,
  },
  total: {
    name: "totalCents",
    kind: "Function",
    file: "services/total.ts",
    description:
      "Requires at least one item, nonnegative integer prices and positive integer quantities. It sums prices in cents without floating-point currency conversion.",
    code: `export type Item = { priceCents: number; quantity: number };

export function totalCents(items: Item[]) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("An order needs items");
  }
  return items.reduce((sum, item) => {
    if (!item || !Number.isSafeInteger(item.priceCents) ||
        item.priceCents < 0 ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new Error("Invalid order item");
    }
    const next = sum + item.priceCents * item.quantity;
    if (!Number.isSafeInteger(next)) throw new Error("Total too large");
    return next;
  }, 0);
}`,
    x: 230,
    y: 270,
  },
  test: {
    name: "total.test.ts",
    kind: "Test",
    file: "services/total.test.ts",
    description:
      "Documents an expected total and checks that a negative quantity is rejected. Showing this test does not mean it has been run.",
    code: `import assert from "node:assert/strict";
import { test } from "node:test";
import { totalCents } from "./total";

test("sums integer cents", () => {
  assert.equal(totalCents([
    { priceCents: 1999, quantity: 3 }
  ]), 5997);
});
test("rejects negative quantities", () => {
  assert.throws(() => totalCents([
    { priceCents: 1999, quantity: -1 }
  ]));
});`,
    x: 20,
    y: 270,
  },
} as const;

export type ShopNode = keyof typeof shop;
export const mainPath: ShopNode[] = ["route", "create", "save", "orders"];
export const relationships: { from: ShopNode; to: ShopNode; label: string; line: number }[] = [
  { from: "route", to: "create", label: "calls", line: 6 },
  { from: "create", to: "save", label: "calls", line: 6 },
  { from: "save", to: "orders", label: "writes", line: 6 },
  { from: "create", to: "total", label: "calls", line: 5 },
  { from: "test", to: "total", label: "tests", line: 6 },
];

export interface Journey {
  selected: ShopNode | null;
  history: (ShopNode | null)[];
  calculation: boolean;
  tests: boolean;
}
export const initialJourney: Journey = {
  selected: null,
  history: [],
  calculation: false,
  tests: false,
};
export type JourneyAction =
  | { type: "select"; id: ShopNode }
  | { type: "back" }
  | { type: "overview" };

/** Branches stay expanded when the reader selection changes or moves back. */
export function navigateJourney(state: Journey, action: JourneyAction): Journey {
  if (action.type === "overview") return initialJourney;
  if (action.type === "back") {
    if (!state.history.length) return state;
    return {
      ...state,
      selected: state.history.at(-1) ?? null,
      history: state.history.slice(0, -1),
    };
  }
  if (action.id === state.selected) return state;
  return {
    selected: action.id,
    history: [...state.history, state.selected],
    calculation: state.calculation || action.id === "total" || action.id === "test",
    tests: state.tests || action.id === "test",
  };
}
