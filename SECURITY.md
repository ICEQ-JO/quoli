# Security

Quoli runs on your own computer and records what coding agents do there, so security reports
matter a lot to us. Thank you for taking the time.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub:
**Security → Report a vulnerability** on this repository
(https://github.com/ICEQ-JO/quoli/security/advisories/new).

Include what you found, how to reproduce it, and what an attacker could do with it. We aim to
reply within a few days and will credit you in the fix unless you prefer otherwise.

## What is in scope

- The local Quoli service (`server/`): its HTTP API on `127.0.0.1`, the origin and host checks,
  the hook and plugin scripts installed into coding agents, the background login item.
- The web app at app.iceq.best reading local Quoli from the browser.
- Redaction of secrets before recorded events are stored.
- The optional account and Team sync (`supabase/`): what is uploaded and who can read it.

## How Quoli is meant to behave

- It listens only on `127.0.0.1`. Only the Quoli website's origins may read it from a browser;
  agent events are never accepted from a browser.
- Recorded prompts, code, commands and tool output stay on the computer. Nothing is uploaded
  unless the user links an account and turns on Team sync, which shares session summaries only.
- It runs as the normal user, never with administrator rights.

Anything that breaks one of these is a vulnerability. See `docs/architecture.md` (Security and
privacy) for the details and known limitations.
