import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Store } from "../packages/storage/src/index";

test("repository CLI registers explicit consent and records a dirty baseline followed by a checkpoint", () => {
  const parent = mkdtempSync(join(tmpdir(), "traceframe-cli-"));
  const root = join(parent, "repository");
  const data = join(parent, "data");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const cli = (...args: string[]) =>
    execFileSync(process.execPath, ["--import", "tsx", "scripts/repository.ts", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, TRACEFRAME_DATA_DIR: data },
      encoding: "utf8",
      timeout: 30000,
    });
  try {
    execFileSync("git", ["init", "--quiet", root]);
    git("config", "user.name", "ICEQ-JO");
    git("config", "user.email", "151853839+ICEQ-JO@users.noreply.github.com");
    writeFileSync(join(root, "example.ts"), "export const value = 1;\n");
    git("add", "example.ts");
    git("commit", "--quiet", "-m", "Synthetic fixture");
    writeFileSync(join(root, "example.ts"), "export const value = 2;\n");
    const originalIndex = readFileSync(join(root, ".git", "index"));
    const output = cli("register", root, "--name", "CLI example", "--capture-code");
    const id = output.match(/repo_[a-f0-9]{32}/)?.[0];
    assert.ok(id);
    assert.match(cli("list"), /CLI example.*code enabled/);
    assert.match(cli("snapshot", id, "--session", "manual"), /Captured baseline/);
    writeFileSync(join(root, "example.ts"), "export const value = 3;\n");
    assert.match(cli("snapshot", id, "--session", "manual"), /Captured checkpoint/);
    assert.deepEqual(readFileSync(join(root, ".git", "index")), originalIndex);
    const store = new Store(join(data, "traceframe.sqlite"));
    try {
      const snapshots = store.snapshots(id, "manual");
      assert.equal(snapshots.length, 2);
      assert.equal(snapshots[0].dirty, true);
      assert.equal(snapshots[0].reason, "baseline");
      assert.match(
        snapshots[0].files.find((f) => f.path === "example.ts")?.content.text ?? "",
        /value = 2/,
      );
      assert.match(
        snapshots[1].files.find((f) => f.path === "example.ts")?.content.text ?? "",
        /value = 3/,
      );
      assert.equal(store.allEvents(id, "manual").length, 2);
      assert.equal(store.project(id)?.policy.prompt, false);
      assert.equal(store.project(id)?.policy.tool, false);
    } finally {
      store.close();
    }
    const metadataOutput = cli("register", root, "--name", "Metadata example");
    const metadataId = metadataOutput.match(/repo_[a-f0-9]{32}/)?.[0];
    assert.ok(metadataId);
    cli("snapshot", metadataId);
    const metadataStore = new Store(join(data, "traceframe.sqlite"));
    try {
      const snapshot = metadataStore.snapshots(metadataId, "manual-review")[0];
      assert.ok(snapshot.files.every((f) => f.content.text === null));
      assert.equal(snapshot.dirty, null);
      assert.equal(metadataStore.project(metadataId)?.policy.code, false);
    } finally {
      metadataStore.close();
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
