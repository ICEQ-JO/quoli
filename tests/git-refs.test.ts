import assert from "node:assert/strict";
import { test } from "node:test";
import { describeRemote } from "../server/gitstate.ts";
import { mergeRefs } from "../web/src/lenses/git/refs.ts";

test("a local branch and its matching remote copy become one pushed tag", () => {
  const tags = mergeRefs(["fix/x", "origin/fix/x"], ["origin"], null);
  assert.deepEqual(tags, [{ name: "fix/x", kind: "synced", remotes: ["origin"], current: false }]);
});

test("no branch appears twice; remote-only refs keep their prefix; origin/HEAD is dropped", () => {
  const tags = mergeRefs(
    ["main", "origin/main", "origin/HEAD", "origin/feature", "tag: v1", "wip"],
    ["origin"],
    "wip",
  );
  assert.deepEqual(
    tags.map((t) => [t.name, t.kind, t.current]),
    [
      ["wip", "local", true],
      ["main", "synced", false],
      ["origin/feature", "remote", false],
      ["v1", "tag", false],
    ],
  );
});

test("branch names that only look like remotes stay local", () => {
  assert.deepEqual(
    mergeRefs(["origins/x", "upstream/y"], ["origin"], null).map((t) => t.kind),
    ["local", "local"],
  );
});

test("remote URLs are shown as host/path and never carry credentials", () => {
  assert.deepEqual(describeRemote("origin", "git@github.com:ICEQ-JO/quoli.git"), {
    name: "origin",
    display: "github.com/ICEQ-JO/quoli",
    web: "https://github.com/ICEQ-JO/quoli",
  });
  const tokened = describeRemote("origin", "https://user:ghp_secret123@github.com/a/b.git");
  assert.equal(tokened.display, "github.com/a/b");
  assert.ok(!JSON.stringify(tokened).includes("secret"));
  assert.deepEqual(describeRemote("work", "ssh://git@git.example.com:2222/team/app.git"), {
    name: "work",
    display: "git.example.com/team/app",
    web: null,
  });
  assert.deepEqual(describeRemote("disk", "/srv/repos/app.git"), {
    name: "disk",
    display: null,
    web: null,
  });
});
