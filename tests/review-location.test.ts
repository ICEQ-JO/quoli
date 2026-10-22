import assert from "node:assert/strict";
import { test } from "node:test";
import { initialLocation, readLocation, reviewUrl } from "../apps/web/app/review";

test("review links round-trip only IDs/view state and discard malformed or content-bearing URL fields", () => {
  const location = {
    ...initialLocation,
    session: "session-interrupted",
    view: "Reported usage" as const,
    event: "demo-5",
  };
  const url = new URL(reviewUrl(location), "http://127.0.0.1:3140");
  assert.deepEqual(readLocation(url), location);
  const unsafe = new URL(
    "http://127.0.0.1:3140/?session=../../private&event=<script>&view=execute&search=private-text",
  );
  const parsed = readLocation(unsafe);
  assert.deepEqual(parsed, initialLocation);
  assert.equal(reviewUrl(parsed).includes("private-text"), false);
});

test("comparison links retain only scoped capture and file identifiers", () => {
  const location = {
    ...initialLocation,
    view: "File changes" as const,
    before: "snap_before",
    after: "snap_after",
    file: "file_abcd",
  };
  assert.deepEqual(readLocation(new URL(reviewUrl(location), "http://localhost")), location);
  const malformed = readLocation(
    new URL(
      "http://localhost/?view=changes&before=../private&after=%3Cscript%3E&file=src/private.ts",
    ),
  );
  assert.equal(malformed.before, "");
  assert.equal(malformed.after, "");
  assert.equal(malformed.file, "");
});

test("work lists are the default while direct legacy activity and new review links remain valid", () => {
  assert.equal(readLocation(new URL("http://localhost/")).view, "Sessions");
  assert.equal(readLocation(new URL("http://localhost/?session=session-cache")).view, "Timeline");
  for (const view of ["Session review", "Review queue"] as const) {
    const state = { ...initialLocation, view, event: "demo-14" };
    assert.deepEqual(readLocation(new URL(reviewUrl(state), "http://localhost")), state);
  }
});
