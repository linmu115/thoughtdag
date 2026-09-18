# UI-only rollback

Baseline: `02bd509`.

Remove pane activation messages, automatic reconnect polling, stricter mainGraph availability gate and session-sticker timeout/error adaptation. Preserve centered mode switch, compact toolbar and center-only canvas layout. Typecheck/build, 10 host tests and 5 synthetic browser UI tests passed. No real-instance UI acceptance claimed.

User requested rollback first and requirements confirmation before any new implementation. Candidate only; active installation remains unchanged until normal Launcher stop and backup.
