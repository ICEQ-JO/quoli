import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readRegularFile } from "../packages/repository/src/files";

test("a swapped ancestor cannot redirect a held-directory file read outside the registered root", () => {
  const temp = fs.mkdtempSync(join(tmpdir(), "traceframe-boundary-"));
  const root = join(temp, "root");
  const nested = join(root, "nested");
  const outside = join(temp, "outside");
  fs.mkdirSync(nested, { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(join(nested, "example.ts"), "inside captured root\n");
  fs.writeFileSync(join(outside, "example.ts"), "outside synthetic canary\n");
  const original = fs.openSync;
  let swapped = false;
  fs.openSync = ((...args: Parameters<typeof original>) => {
    const fd = original(...args);
    if (
      !swapped &&
      String(args[0]).startsWith("/proc/self/fd/") &&
      String(args[0]).endsWith("/nested")
    ) {
      swapped = true;
      fs.renameSync(nested, join(root, "held-directory"));
      fs.symlinkSync(outside, nested);
    }
    return fd;
  }) as typeof original;
  syncBuiltinESMExports();
  try {
    const result = readRegularFile(root, "nested/example.ts", 1024);
    assert.equal(swapped, true);
    assert.equal(result.kind, "ok");
    if (result.kind === "ok") assert.equal(result.bytes.toString(), "inside captured root\n");
  } finally {
    fs.openSync = original;
    syncBuiltinESMExports();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("mutation during a descriptor read returns a racy marker without captured bytes", () => {
  const root = fs.mkdtempSync(join(tmpdir(), "traceframe-read-race-"));
  const file = join(root, "example.ts");
  fs.writeFileSync(file, "original\n");
  const original = fs.readSync;
  let changed = false;
  fs.readSync = ((...args: Parameters<typeof original>) => {
    const result = original(...args);
    if (!changed && result > 0) {
      changed = true;
      fs.writeFileSync(file, "changed during capture\n");
    }
    return result;
  }) as typeof original;
  syncBuiltinESMExports();
  try {
    const result = readRegularFile(root, "example.ts", 1024);
    assert.equal(changed, true);
    assert.equal(result.kind, "racy");
    assert.equal("bytes" in result, false);
  } finally {
    fs.readSync = original;
    syncBuiltinESMExports();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
