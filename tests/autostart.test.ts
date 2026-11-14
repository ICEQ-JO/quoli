import assert from "node:assert/strict";
import { test } from "node:test";
import { autostartPlan } from "../server/autostart.ts";

const node = "/opt/node 22/bin/node";

test("each operating system gets a login item that runs the app copy with the update check off", () => {
  process.env.QUOLI_PORT = "4455";
  try {
    const linux = autostartPlan("linux", node);
    assert.equal(linux?.kind, "systemd");
    assert.match(linux?.file ?? "", /systemd[\\/]user[\\/]quoli\.service$/);
    assert.match(
      linux?.content ?? "",
      /^ExecStart="\/opt\/node 22\/bin\/node" ".*app[\\/]+server[\\/]+cli\.mjs" start$/m,
    );
    assert.match(linux?.content ?? "", /^Environment="QUOLI_NO_UPDATE_CHECK=1"$/m);
    assert.match(linux?.content ?? "", /^Environment="QUOLI_PORT=4455"$/m);
    assert.match(linux?.content ?? "", /^Restart=on-failure$/m);
    // systemd refuses a quoted WorkingDirectory (checked with systemd-analyze verify).
    assert.match(linux?.content ?? "", /^WorkingDirectory=\/[^"]*app$/m);
    assert.match(linux?.content ?? "", /^WantedBy=default\.target$/m);

    const mac = autostartPlan("darwin", node);
    assert.equal(mac?.kind, "launchd");
    assert.match(mac?.file ?? "", /LaunchAgents\/best\.iceq\.quoli\.plist$/);
    assert.match(
      mac?.content ?? "",
      /<string>\/opt\/node 22\/bin\/node<\/string><string>.*cli\.mjs<\/string><string>start<\/string>/,
    );
    assert.match(mac?.content ?? "", /<key>RunAtLoad<\/key><true\/>/);
    assert.match(mac?.content ?? "", /<key>QUOLI_PORT<\/key><string>4455<\/string>/);

    const win = autostartPlan("win32", "C:\\Program Files\\nodejs\\node.exe");
    assert.equal(win?.kind, "startup");
    assert.match(win?.file ?? "", /Startup[\\/]quoli\.vbs$/);
    // Quotes doubled inside the VBScript string; window style 0 hides the console.
    assert.match(
      win?.content ?? "",
      /sh\.Run """C:\\Program Files\\nodejs\\node\.exe"" "".*cli\.mjs"" start", 0, False\r\n/,
    );
    assert.ok(!/[^\r]\n/.test(win?.content ?? ""), "Windows line endings");

    assert.equal(autostartPlan("aix", node), null);
  } finally {
    delete process.env.QUOLI_PORT;
  }
});
