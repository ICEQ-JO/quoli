import assert from "node:assert/strict";
import { test } from "node:test";
import { displayTitle, saveTitle } from "../web/src/session-titles.ts";

test("display metadata is browser-local, reversible and never mutates recorded titles", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  const recorded = Object.freeze({ id: "session-1", title: "The original recorded prompt" });
  assert.equal(displayTitle(recorded, storage), recorded.title);
  saveTitle(recorded.id, "  Review the login flow  ", storage);
  assert.equal(displayTitle(recorded, storage), "Review the login flow");
  assert.equal(recorded.title, "The original recorded prompt");
  assert.equal(displayTitle({ id: "other", title: "Other prompt" }, storage), "Other prompt");
  assert.throws(() => saveTitle(recorded.id, "x".repeat(121), storage));
  assert.equal(displayTitle(recorded, storage), "Review the login flow");
  saveTitle(recorded.id, "", storage);
  assert.equal(displayTitle(recorded, storage), recorded.title);
  assert.equal(data.size, 0);
  assert.equal(
    displayTitle(recorded, {
      getItem: () => {
        throw Error("blocked");
      },
    }),
    recorded.title,
  );
});
