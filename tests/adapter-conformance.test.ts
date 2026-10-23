import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { claudeAdapter, adapters as productAdapters } from "../apps/bridge/src/adapter";
import { hookStatus, installHooks, uninstallHooks } from "../apps/bridge/src/install";
import { normalizeHook } from "../apps/bridge/src/normalize";
import { syntheticAdapter } from "../fixtures/adapters";
import { claudeHookSamples } from "../fixtures/claude";
import {
  type AdapterDescriptor,
  adapterRegistrationSchema,
  adapterSupportsSourceVersion,
} from "../packages/schema/src/adapter";
import { payloadSchema } from "../packages/schema/src/index";

// One suite, every product registration plus a synthetic adapter that exercises
// different capability declarations.
const adapters: AdapterDescriptor[] = [...productAdapters, syntheticAdapter];

function registration({ deliveryId: _deliveryId, ...rest }: AdapterDescriptor) {
  return rest;
}

test("every registration satisfies the shared adapter contract", () => {
  const ids = new Set<string>();
  const producers = new Set<string>();
  const payloadKinds = new Set(
    payloadSchema.options.map(
      (option) => (option.shape.kind as unknown as { value: string }).value,
    ),
  );
  for (const adapter of adapters) {
    assert.doesNotThrow(() => adapterRegistrationSchema.parse(registration(adapter)));
    assert.equal(ids.has(adapter.id), false, `${adapter.id} is registered twice`);
    ids.add(adapter.id);
    assert.equal(producers.has(adapter.producerId), false, `${adapter.producerId} is reused`);
    producers.add(adapter.producerId);
    for (const kind of Object.values(adapter.eventMapping))
      assert.ok(payloadKinds.has(kind), `${adapter.id} maps to unknown observation ${kind}`);
    assert.equal(adapter.delivery, "session_event_source_id");
    assert.equal(adapter.install.mode, "reversible_project_hooks");
  }
});

test("an invalid registration is rejected before it can be used", () => {
  const base = registration(syntheticAdapter);
  assert.equal(
    adapterRegistrationSchema.safeParse({ ...base, eventMapping: { prompt: "unknown" } }).success,
    false,
  );
  assert.equal(adapterRegistrationSchema.safeParse({ ...base, sourceVersions: [] }).success, false);
  assert.equal(
    adapterRegistrationSchema.safeParse({
      ...base,
      capabilities: { ...base.capabilities, fields: { plan: "available" } },
    }).success,
    false,
  );
});

test("an unverified source version fails explicitly", () => {
  for (const adapter of adapters) {
    assert.deepEqual(adapterSupportsSourceVersion(adapter, adapter.sourceVersions[0]), {
      supported: true,
    });
    const unsupported = adapterSupportsSourceVersion(adapter, "999.0.0");
    assert.equal(unsupported.supported, false);
    if (!unsupported.supported) {
      assert.equal(unsupported.reason, "unsupported_source_version");
      assert.deepEqual(unsupported.supportedVersions, adapter.sourceVersions);
    }
  }
});

test("the Claude registration matches the recorded hook behavior", () => {
  const sessionId = "session-probe";
  for (const payload of claudeHookSamples()) {
    const event = normalizeHook(payload, { projectId: "repo_probe", sessionId });
    const declared = claudeAdapter.eventMapping[payload.hook_event_name ?? ""] ?? null;
    assert.equal(
      event?.payload.kind ?? null,
      declared,
      `${payload.hook_event_name} mapping drifted`,
    );
    if (!event) continue;
    assert.equal(
      event.deliveryId,
      claudeAdapter.deliveryId({
        sessionId,
        event: payload.hook_event_name ?? "",
        promptId: event.promptId,
        toolId: event.toolId,
      }),
      `${payload.hook_event_name} delivery identity drifted`,
    );
  }
  // Stop is observed but deliberately not collected.
  assert.equal(claudeAdapter.eventMapping.Stop, undefined);
});

test("the Claude registration does not claim facts the hook payload lacks", () => {
  assert.equal(claudeAdapter.capabilities.usage, false);
  assert.equal(claudeAdapter.capabilities.sourceTime, false);
  assert.equal(claudeAdapter.failures.exitCode, "unsupported");
  const results = claudeHookSamples()
    .map((payload) =>
      normalizeHook(payload, { projectId: "repo_probe", sessionId: "session-probe" }),
    )
    .filter((event): event is NonNullable<typeof event> => event?.payload.kind === "tool_result");
  assert.ok(results.length >= 2);
  for (const event of results)
    assert.equal(event.payload.kind === "tool_result" ? event.payload.exitCode : 0, null);
});

test("the declared install path is the one the installer writes and reverses", () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-adapter-install-"));
  try {
    assert.equal(
      installHooks(dir, "repo_probe").path,
      join(dir, claudeAdapter.install.settingsPath),
    );
    assert.equal(hookStatus(dir).installed, true);
    uninstallHooks(dir);
    assert.equal(hookStatus(dir).installed, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("status reports the supported adapter and whether it is installed", () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-adapter-status-"));
  const env = { ...process.env, TRACEFRAME_DATA_DIR: join(dir, "data") };
  const status = () =>
    execFileSync(process.execPath, ["--import", "tsx", "apps/bridge/src/index.ts", "status", dir], {
      env,
      encoding: "utf8",
    });
  try {
    assert.match(
      status(),
      /claude-code-hook v0\.1\.0 supports Claude Code 2\.1\.306; hooks are not installed\./,
    );
    installHooks(dir, "repo_probe");
    assert.match(
      status(),
      /claude-code-hook v0\.1\.0 supports Claude Code 2\.1\.306; hooks are installed for project repo_probe\./,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
