# Traceframe web UI

This records the existing interface identity and the session-review improvements in GitHub #23. It is a reference that can be challenged and revised, not a frozen specification.

Traceframe is an operational developer tool used alongside a coding editor. Preserve the existing light neutral surfaces, restrained olive-green accent, authored outline icon set and familiar sans-serif controls. Code, timestamps and IDs use monospace; ordinary labels use the UI family. No external font or asset requests are needed.

The task order is: choose a session, identify captured gaps, scan activity, inspect an observation, follow explicit evidence. The selected session title leads. Marketing introductions and oversized metric blocks do not belong ahead of activity. Status is descriptive: “End recorded” does not imply complete capture or feature correctness.

Use a 4px spacing base with 8/12/16/24/32px groups. Headings use a fixed scale, controls have visible focus, and errors have recovery actions. Green indicates selection and source-reported success; amber indicates capture uncertainty; red indicates source-reported failure. Never communicate state by color alone.

Desktop activity and the sticky inspector are adjacent. Below 1100px, a native dialog provides focused evidence inspection with Escape dismissal and focus restoration. Below 680px, session selection becomes a native select rather than a horizontal list of oversized cards. Metadata disclosure stays secondary to captured content.

Search covers the entire retained session through bounded authenticated POST queries; it never silently searches only the loaded rows. URL state contains project/session/event IDs and the selected view, never search text, prompts, code or credentials. Opening a local evidence link restores the selection, including the mobile detail dialog.

See [the session review surface reference](../../docs/design/session-review.md) for behavior and testing notes.
