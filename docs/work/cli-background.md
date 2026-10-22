# Quoli CLI and background runtime (local increment)

Originally developed on one local branch under the owner’s no-push instruction. The owner subsequently authorized publication and merge. Tracked in [#49](https://github.com/ICEQ-JO/quoli/issues/49). Relative size: M.

## User value and scope

Build an unpackable local release that can run independently of this checkout, install a `quoli` command once, connect from a target repository, and manage capture without holding a terminal open. Use a production web server, preserve the evidence store and loopback boundary, and show actionable start/stop/status diagnostics. Provide explicit optional login startup on the tested Linux platform.

## Non-goals

No registry publishing, remote installer URL, privileged/system-wide service, automatic agent configuration, multi-user/cloud service, new agent activity adapters, Windows/macOS certification or complete capture guarantee.

## Dependencies

The preceding local automatic-history increment, existing capture controls, local authentication and production Next.js app. Keep legacy private data paths and TRACEFRAME_* overrides compatible.

## Acceptance criteria

- [x] Local build produces a self-contained runtime/archive; runtime needs supported Node and Git, not pnpm or this checkout.
- [x] Install creates an owned user-local CLI without overwriting unrelated files; uninstall preserves evidence and agent configuration.
- [x] Connect can be run inside a target repository and starts the managed local service when necessary.
- [x] Background start/stop/restart/status are idempotent, authenticate service ownership, detect stale state and refuse to stop unrelated processes.
- [x] Normal runtime uses the production build without HMR; port conflicts fail clearly.
- [x] Optional Linux user-login startup can be enabled and disabled explicitly without privilege escalation or shell-profile edits.
- [x] Disposable-installation tests cover setup, production health, persistence/restart, conflict handling and clean shutdown; relevant existing checks pass.

## Test plan and privacy/security

Use synthetic evidence and disposable private install/data/bin directories. Build and relocate the runtime, run it from outside the checkout, connect a disposable Git repository, observe edits, restart, and verify both listener ports release. Test stale state and unrelated service/process handling. No package/data upload, user credentials in logs, captured command replay, evidence deletion during uninstall or implicit changes to agent tools. Check the packaged file list for local runtime data or environment files before delivery.

## Validation and delivered state

- Source unit/integration run: 120 passed; the four release-only cases are skipped in the ordinary suite and are run explicitly below.
- `pnpm test:release`: 4/4 passed, including a relocated install on a PATH without pnpm, production HTML/static assets and a real browser session/diff flow, automatic capture, evidence-preserving restart/uninstall, packaged Claude hook invocation, refusal to strand installed hooks, port conflicts, unverified PID refusal, concurrent starts and supervisor-crash recovery.
- Typecheck and production standalone build pass. Lint exits successfully with 42 existing illustration warnings. CLI/setup checks were rerun after command-help changes.
- The archive contains 1,330 files, approximately 13 MiB compressed. The packaging pass rejects credential/database/environment files and symlinks outside the release tree. Generated files are ignored by Git.
- Generated Linux user unit passed `systemd-analyze --user verify` on this machine. Real login/reboot activation is not certified; login startup was not enabled for the owner.
- Installed the user-local CLI at `~/.local/bin/quoli`, replaced this session's foreground development server with the authenticated managed production runtime at http://127.0.0.1:3140, and verified status and smoke health. Existing evidence and capture consent remain in the default private store. Subsequently connected this Quoli source repository with explicit code-capture consent and verified a live documentation diff; no agent integration was installed. No shell profile was edited.

Source publication is now authorized; the runtime package remains unpublished. This does not include a registry release, signed/native executable, automatic OS-wide startup, new Codex/Pi/OpenCode adapters or broader platform certification. The next implementation increment is the second verified agent activity adapter.
