# DSH 0.2.1-rc.2 candidate

This candidate targets exactly DSH 0.2.1-rc.2 (687f282e8625c6b8d11ff58211a90524be2e4317). Host APIs are peers, resolved from that current local host for verification; no old host runtime is bundled. Development dependencies are local links because this exact release is not published to npm. The source lockfile records those links.

Annotation protocol 2, Sticker protocol 1 and Bridge lifecycle protocol 3 are unchanged. Existing Obsidian Companion 0.7.0-dsh02.2 remains the protocol counterpart. No Vault binding or sync scope is migrated automatically.

Install as a coordinated set: Core 0.3.12-dsh021.1, Bridge 0.4.1-dsh021.1, Sticker 0.7.4-dsh021.1, ThoughtDAG 0.4.14-dsh021.1; Sticker uses BetterSidebar 0.28.0-dsh021.1 native extension tabs. Host integration uses React 18.3.1; ThoughtDAG's isolated iframe SPA retains its own bundled React 19.

Before installation the main task must back up the exact new instance and stop through the verified Launcher path. The source verification covers types, build, tests and package boundaries. Live instance registration, UI actions and Vault round trips require separate acceptance.

## Reproduce the build

The ThoughtDAG SPA uses the repository's committed npm lockfile. From the repository root, run `npm ci --ignore-scripts`, then `npm run dsh:build` and `node --test dsh/tests/*.test.mjs`. The DSH host shim uses declared host peers and does not require a machine-specific development path. The related Core, Bridge and Sticker sources document their `.dsh-host` preparation separately. Release archives under `.artifacts/` stay local and are excluded from source commits.
