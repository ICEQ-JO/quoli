import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setupCli } from "../server/setup.ts";
import { uninstallCli } from "../server/uninstall.ts";

// A throwaway home; the service name comes from tests/isolate.ts, the port is one nothing uses.
function sandbox() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "quoli-uninstall-")));
  const saved = { ...process.env };
  Object.assign(process.env, {
    HOME: root,
    USERPROFILE: root,
    APPDATA: join(root, "AppData", "Roaming"),
    XDG_CONFIG_HOME: join(root, ".config"),
    QUOLI_HOME: join(root, ".quoli"),
    QUOLI_PORT: "4497",
  });
  for (const k of ["CODEX_HOME", "PI_CODING_AGENT_DIR"]) delete process.env[k];
  return {
    root,
    done() {
      process.env = saved;
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("uninstall --yes takes Quoli out of every agent and deletes its data", async () => {
  const box = sandbox();
  try {
    mkdirSync(join(box.root, ".claude"), { recursive: true });
    setupCli(["claude-code"], false);
    const settings = join(box.root, ".claude", "settings.json");
    assert.match(readFileSync(settings, "utf8"), /quoli-hook\.mjs/);
    assert.ok(existsSync(join(box.root, ".quoli")));

    assert.equal(await uninstallCli(["--yes"]), 0);
    assert.doesNotMatch(readFileSync(settings, "utf8"), /quoli/);
    assert.equal(existsSync(join(box.root, ".quoli")), false);
  } finally {
    box.done();
  }
});

test("uninstall never deletes a QUOLI_HOME that is not plainly Quoli's", async () => {
  const box = sandbox();
  try {
    process.env.QUOLI_HOME = box.root; // the home folder itself
    assert.equal(await uninstallCli(["--yes"]), 1);
    assert.ok(existsSync(box.root));
  } finally {
    box.done();
  }
});
