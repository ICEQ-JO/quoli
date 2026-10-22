import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { systemdUnit } from "../apps/cli/src/autostart";
import { cliConfig, connectArguments } from "../apps/cli/src/config";
import { control, identify, type ServiceState, signature } from "../apps/cli/src/control";

test("connect defaults to cwd without mistaking option values for a repository", () => {
  assert.deepEqual(connectArguments([], "/tmp/repo"), ["/tmp/repo"]);
  assert.deepEqual(
    connectArguments(["--name", "Project", "--agent", "claude", "--capture-code"], "/tmp/repo"),
    ["/tmp/repo", "--name", "Project", "--agent", "claude", "--capture-code"],
  );
  assert.deepEqual(connectArguments(["--capture-code", "/tmp/other"], "/tmp/repo"), [
    "--capture-code",
    "/tmp/other",
  ]);
  assert.throws(() => connectArguments(["--unknown"], "/tmp/repo"));
});

test("control verifies a challenge before disclosing a bearer or requesting stop", async () => {
  let bearerReceived = false,
    stopRequests = 0,
    genuine = false;
  const state: ServiceState = {
    format: 1,
    instance: "1".repeat(32),
    token: "2".repeat(64),
    pid: process.pid,
    controlPort: 0,
    startedAt: new Date().toISOString(),
    releaseRoot: "/tmp/quoli",
    webPort: 3140,
    collectorPort: 4318,
  };
  const server = createServer((req, res) => {
    bearerReceived ||= Boolean(req.headers.authorization);
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/identity")
      res.end(
        JSON.stringify({
          instance: state.instance,
          signature: genuine
            ? signature(state.token, url.searchParams.get("challenge") ?? "")
            : "0".repeat(64),
        }),
      );
    else {
      stopRequests++;
      res.end(JSON.stringify({ instance: state.instance, phase: "stopping" }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  state.controlPort = address.port;
  try {
    assert.equal(await identify(state), false);
    await assert.rejects(control(state, "stop"), /No process was signalled/);
    assert.equal(bearerReceived, false);
    assert.equal(stopRequests, 0);
    genuine = true;
    await control(state, "stop");
    assert.equal(bearerReceived, true);
    assert.equal(stopRequests, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("login startup unit is per-user, escaped and contains no credentials", () => {
  const config = { ...cliConfig('/tmp/Quoli 50% "app"'), dataDir: '/tmp/private 50% "data"' };
  const unit = systemdUnit(config);
  assert.match(unit, /WantedBy=default.target/);
  assert.match(unit, /KillMode=control-group/);
  assert.match(unit, /50%%/);
  assert.match(unit, /\\"app\\"/);
  assert.ok(!unit.includes("Bearer"));
  assert.ok(!unit.includes("credential"));
  assert.throws(() => systemdUnit({ ...config, dataDir: "/tmp/data\nExecStart=malicious" }));
});
