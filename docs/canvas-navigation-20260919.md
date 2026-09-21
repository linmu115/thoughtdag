# DSH canvas header alignment and navigation

## Scope

ThoughtDAG `0.4.14-rc2.15`, based on `1d901eb` (the installed reference-polish cohort).

- Measure the native conversation header and current title, then pass iframe-local geometry and typography to the canvas. Align the title and first divider when switching views, including sidebar and viewport resizing.
- Keep save state below the title and above the divider.
- Move canvas operations into an overlay inside the canvas; remove the second horizontal divider.
- Add a lower-left overview with node silhouettes, connections, and viewport bounds. Click, pointer drag, and arrow keys pan without changing zoom or graph objects. Persist the viewport through the existing canvas save path.
- Keep zoom controls in a horizontal group below the overview so the controls do not overlap.

Only ThoughtDAG presentation, viewport navigation, tests, and its package version change. Backend graph/reference services and the host marker bundle are identical to the installed baseline. No other plugin source changes.

## Verification

- DSH build including TypeScript: passed.
- `node --test dsh/tests/*.test.mjs`: 13 passed.
- Managed canvas browser suite: 7 passed; theme suite: 3 passed. The parent-shim test uses the actual plugin client inside a synthetic native conversation shell, including top offset, sidebar resize, header resize, and switching twice.
- Minimap click/drag/keyboard tests assert saved nodes and edges are unchanged and no reference operation is issued.
- Browser screenshot inspected; minimap/zoom controls do not overlap. Save state stays above the divider.
- Real installed-instance UI: **not yet accepted**. Synthetic browser verification does not replace user acceptance.

## Delivery

Package and guarded installation script:
`artifacts/canvas-navigation-20260919/` (author-side build output, not part of this repository)

Installation requires the target instance to be stopped with a finalized `closed` receipt. The script checks the installed baseline, backs up the target package, configuration, storage and maintenance database, updates only ThoughtDAG and its dependency metadata, and verifies unrelated package/configuration/storage hashes. `--prepare` validates without installing. See artifact `prepared.json` and, once installation completes, `installed.json` for actual status.

Installed after the user exited the instance and run `run-6733f34d-7b21-4824-97a8-c8cc2d925e93` received a finalized `closed` receipt. The previous package, profile configuration, user storage and maintenance database are backed up under the artifact directory. Hash checks confirmed that 19 unrelated packages, user storage and protected runtime configuration did not change. The installed package is `0.4.14-rc2.15`.

Automatic start was dispatched through the documented Launcher protocol. Launcher logged the forwarded deep link but did not expose a new running instance within the five-minute deadline; the command returned `CONTROL_TIMEOUT`, and the final status was `stopped`. The user was asked to start this instance from Launcher. Activation remains pending until a new running identity and served assets are verified; see `activated-backend.json` when available. No forced process termination or direct runtime shutdown was used.
