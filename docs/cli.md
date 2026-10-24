# Quoli CLI and background capture

This branch builds an **unpublished local Linux release**. The installed application runs independently of the source checkout and does not need pnpm. Supported Node **24.16+ within Node 24** and Git are still required. It is not a single native executable or a published npm package.

## Build and install

From the source checkout:

```sh
pnpm install --frozen-lockfile
pnpm release:local
node dist/quoli/cli.mjs install
```

The generated `dist/quoli-0.1.0-local-linux-x64.tar.gz` (on this machine) can instead be copied elsewhere, checked against its adjacent SHA-256 file, unpacked, and installed with `node quoli/cli.mjs install`. The release contains the production web server, static assets, bundled collector/CLI/bridge, selected runtime dependencies and SQL migrations. No source checkout, package download or build is needed on the target machine. The build checks for environment files, credential/database files and external symlinks before creating the archive. This does not constitute signing, registry publication or independent release certification.

Default installation is `~/.local/share/quoli/app`, with a `~/.local/bin/quoli` symlink. If that bin directory is not on PATH, invoke `~/.local/bin/quoli` directly or add it yourself. Installation never edits a shell profile, requests sudo, overwrites unrelated launchers or enables login startup. `QUOLI_INSTALL_DIR` and `QUOLI_BIN_DIR` override the install locations. The application and evidence directory must not overlap.

## Connect from your repository

```sh
cd /path/to/your/repository
quoli connect --capture-code
```

This registers the repository and starts the production collector/dashboard in the background. Closing the terminal does not stop the managed instance. Without `--capture-code`, capture remains metadata-only; untracked files require `--include-untracked`. No agent hooks are installed unless explicitly requested with `--agent claude` or `--agent opencode`. The [OpenCode adapter](opencode-adapter.md) supports 2.0.32 and needs a project restart.

Open http://127.0.0.1:3140 and select the repository's daily history. Existing `TRACEFRAME_DATA_DIR`, `TRACEFRAME_WEB_PORT` and `TRACEFRAME_COLLECTOR_PORT` overrides remain supported; use matching configuration for lifecycle and connect commands. The default evidence store remains the earlier `traceframe/demo` private directory for compatibility. Projects do not need package.json, a Node dependency or a Quoli file in their working tree for repository observation.

The installed runtime uses Next.js's production standalone server; it has no development HMR channel. Source development via `pnpm dev` remains available. Stop your foreground development instance before starting the managed runtime on the same ports. Quoli reports port conflicts and leaves existing software alone.

## Review changes live

After connecting, select your repository and open its daily repository history. Leave the dashboard open while editing a tracked file: the observer checks about every five seconds and records a checkpoint when the captured state changes. Open **File changes** to compare the baseline and latest checkpoint, then select the edited file to inspect its diff.

Repository checkpoints show observed changes and commit IDs. They do not identify which agent made an edit; detailed agent activity requires a supported, explicitly enabled integration. Changes between observation checks may not be captured.

## Lifecycle

```sh
quoli start
quoli status
quoli open       # prints the local dashboard address
quoli restart
quoli stop
quoli settings list
```

Start is idempotent and concurrent starts share one instance. Stop/restart authenticate the private control service using a fresh HMAC challenge before sending a bearer credential; stored PIDs are never used to terminate software. A stale record for a dead supervisor can be reclaimed on the next start. An unverified live/reused PID is not signalled; a stale startup reservation may take a minute to become reclaimable. Invalid state files are reported for inspection rather than deleted blindly.

The supervisor owns the collector and production web process. A normal stop shuts down both listeners. A supervisor crash disconnects its IPC children, which exit instead of remaining orphan listeners. Status distinguishes stopped/unverified/managed states and checks dashboard health. A child exit stops the instance; a subsequent `quoli start` recovers it. Automatic crash restart is provided by the optional login service, not by the default detached process.

Service state and the private log live in the selected evidence directory as `quoli-service.json` and `quoli-service.log`. The state includes a local control token and must not be shared. Logs rotate at the next start if larger than 5 MiB; they are not continuously size-capped. Never publish the private data directory or logs containing real-session errors.

## Optional Linux login startup

```sh
quoli autostart enable
quoli autostart status
quoli autostart disable
```

These commands explicitly install/remove an owned **systemd user** unit at `~/.config/systemd/user/quoli.service` (or under `XDG_CONFIG_HOME`). A running user systemd bus and an installed runtime are required. No system-wide service or linger setting is changed. Enable moves a manually started managed instance under systemd; ordinary start/stop/restart then route through that unit. Existing unrelated units are never overwritten. Configuration or installation changes require updating the owned unit explicitly. Installation paths containing dollar signs are currently unsupported for login startup.

Unit execution and environment quoting follow the official [systemd.service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html) and [systemd.exec](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html) contracts. Unit generation/escaping is tested. Do not infer login/reboot certification from a foreground lifecycle test; repeat a real login test on the pilot machine before relying on it.

## Remove the application without deleting evidence

```sh
quoli autostart disable  # if configured
quoli stop
quoli hooks uninstall /path/to/project  # if Claude hooks were installed
quoli hooks opencode uninstall /path/to/project  # if the OpenCode plugin was installed
quoli uninstall
```

Uninstall refuses a running/unverified instance and a configured login unit. It also refuses removal while registered repositories still reference this runtime's own packaged hooks or OpenCode plugin, so it cannot silently strand those hook commands. Hook removal changes only Quoli-owned hook entries and preserves retained evidence and other agent configuration. Uninstall removes owned application files and the launcher; it does not remove the SQLite store, registered-project consent, credentials, source repositories, agent transcripts or external backups. Reinstalling with the same data directory can resume previously opted-in observation.

Use the existing explicit project-deletion controls separately when deletion is intended. A published installer, broader platform certification, update distribution, code signing and new agent adapters remain later work.
