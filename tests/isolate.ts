import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Every test file starts with its own empty Quoli home, so a developer's real ~/.quoli (for
// example a scope.json that records only some projects) never changes what the tests see.
// Tests that need a particular home still set QUOLI_HOME themselves.
process.env.QUOLI_HOME ??= mkdtempSync(join(tmpdir(), "quoli-test-home-"));

// Never let a test start, stop or remove a developer's real background Quoli (server/autostart.ts).
process.env.QUOLI_SERVICE_NAME = "quoli-test";
