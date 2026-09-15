# ThoughtDAG · DSH session graph fork

[中文](README_ZH.md) · [DSH installation and use](dsh/README.md) · [Detailed graph guide](dsh/MANAGED.md) · [Standalone app](#standalone-app)

This fork adds a per-session context graph to **DeepSeek Harness 0.1.5-rc.2**. Open **对话 / 思维图** in the session header, organize sources on the canvas, and continue in the real DSH conversation. The standalone ThoughtDAG application remains available separately.

The current DSH package source version is **`dsh-thoughtdag` 0.4.14-rc2.12**. This is a custom RC2 integration, not the upstream plugin release. The version identifies the code and locally verified package; it does not imply that a matching npm package or public release asset has been published.


The view selector now uses a shared sliding thumb with fixed labels, continuous reversal and host theme colors. See [selector behavior and validation](docs/changes/2026-09-15-sliding-view-selector.md).

## What the DSH panel does

| Capability | Behavior |
|---|---|
| One main graph per receiving session | A reference from source X to target Y belongs to Y's graph. Opening the panel reuses that session's graph; it does not generate graphs for every historical session. |
| Real session cards | Existing cards open their native conversation. Empty cards ask for a workspace when you start them, then create and bind a real session. |
| Context connections | A confirmed connection grants access to a fixed source version through a chosen completed reply. Empty cards and pending connections grant no reading permission. |
| Vertical layout | Sources appear above the receiver, with top and bottom handles. Existing saved positions and explicit right-click placement remain intact. |
| Native appearance and continuous transitions | Cards, menus, previews and logs follow DSH's theme. Frame borders track the native conversation, including its collapsed rail. The switch stays in place; brief fades reverse smoothly and respect reduced motion. |
| Reading transparency | An edge opens its fixed source boundary and disclosure log: returned ranges, delivery status, continuation position, limits and truncation. |
| Reference and archive sync | Deleting a blue source reference or archiving a session updates the authoritative graph. Refresh preserves unsaved layout edits while applying reference removals. |

The panel uses Maintenance for session identity, graph storage and fixed source access, and Annotation Core for reference preparation. The embedded view has no persistent chat composer, does not keep a second copy of native conversation history, and does not run its own model requests.

Empty canvases offer direct card actions and workspace-first session selection. On-demand canvas help explains flow direction and keyboard controls; compact navigation opens in a drawer. Switching reuses the existing iframe and ends its transition work when settled. See the [alignment and transition report](docs/changes/2026-09-15-aligned-fluid-graph-ui.md).

## Quick start in DSH

Install the matching RC2 package set in one instance, following the [plugin guide](dsh/README.md). Then:

1. Open a real session and select **思维图** in its header.
2. Right-click empty canvas space to **添加空卡片** or **添加已有会话**. Existing sessions are selected through their workspace.
3. Right-click a card and select **在此节点开始会话**. An empty card asks for a workspace and confirmation; cancelling creates nothing. A bound card opens its existing session.
4. Drag from a source card's bottom handle to the receiver's top handle, or choose **连接到节点**. Confirm the completed reply and fixed source version before creating a reference.
5. Continue in the real conversation. The plugin prepares valid incoming references, preserves the draft and attachments, and leaves sending to you.

| Right-click location | Available actions |
|---|---|
| Empty canvas | Add an empty card or existing session; arrange by sources; fit the graph; associate an existing object; explicitly import the current target's existing references. |
| Card | Start/open its real session; preview its source; connect to another card; rename; remove. |
| Edge | Inspect the fixed source and reading positions; confirm a pending connection's source; remove the edge. |

Touch devices can use the card's **⋯** button and **画布更多操作**. Keyboard access includes **Shift+F10**, arrow keys, **Escape**, and **Delete/Backspace** for selected items. Removal uses the same reference-revocation operation across entry points.

## Bounded context, disclosed as needed

With the matching `maintenanceNativeContext` protocol 1 host, right-click a card and open **管理来源上下文**, or inspect a connection. The panel separates the immutable authorization boundary, selected disjoint windows, actually retained native input materials, and historical disclosure coverage. Browse real user requests, preview their fixed question/answer pair, select ranges, and explicitly save the window. A user preview is not model delivery.

Pause/resume, source-scoped release and user pins use the same current-session service as native tools. Source-scoped release preserves other independent holders; releasing a whole shared material is separately labelled. Pending release is shown as pending until the native surface receipt confirms it. Refresh preserves an unsaved window plan, and retrying an uncertain mutation reuses its operation identity. Missing capabilities are disabled. This stage targets the native DSH Agent, not hosted engine context rewriting. See [implementation and synthetic UI checks](docs/changes/2026-09-15-native-context-ui.md).

A reference records a source version and the last completed reply it may read. Later source messages do not expand that boundary. The first send can include the selected reply's question-and-answer turn within the configured budget; earlier authorized history is available through bounded read/search tools as needed. Connecting a source does not insert its complete history into every request.

Use **查看来源** on a card for a read-only preview. If a source has several independent fixed references, choose the range to inspect. Selected text can still become a material card, a reference to another session, or a session sticker.

Use **查看固定来源与读取位置** on an edge to inspect the reading log. **已准备** means delivery is not confirmed; **已返回** records returned ranges; **未交付** records failure. A search hit does not mean the whole source was read, and your own preview does not mean the AI read it. Logs also expose continuation positions, incomplete ranges, budget limits and early-record trimming.

## Delete, archive and recover

- With [Session Sticker Board](https://github.com/linmu115/dsh-session-sticker-board/tree/codex/rc2-session-context-graph), blue markers beside source selections open referenced sessions. Right-click a marker to enter a session or delete one exact reference. Other references at the same selection and ordinary red stickers remain.
- Removing graph cards or edges revokes affected references. It does not delete real sessions or rewrite existing answers.
- Archiving a source or target revokes its active references and clears affected pending connections. Its own graph becomes archived; an already open graph becomes read-only and retains unsaved layout for copying to a draft.
- Restoring a session restores its archived main graph, but does not restore revoked references or cleared connections. A manually deleted graph is not restored by session recovery.
- Changes are checked on relevant events, panel reopening and window focus; a visible graph also checks every 10 seconds. Conflicts preserve local edits and offer a layout-only recovery draft.
- If starting a node fails, the panel keeps the service's error and offers **刷新引用并重试开始** or **返回对话检查**. Reference admission is not skipped to force an open or send.

Older graphs retain their original objects during migration. Unconfirmed legacy lines remain metadata, not active context permissions. Explicitly importing existing target references does not create new permissions or revive removed references. See [ownership and migration](dsh/MANAGED.md#主干与迁移).

## Build the DSH plugin

Use Node **22.19+ in the 22.x line, or 24+**, as declared by the [plugin package](dsh/package.json). From this repository:

```sh
npm ci
npm run dsh:build
cd dsh
npm pack
```

This builds the embedded SPA and produces a local `dsh-thoughtdag-0.4.14-rc2.11.tgz`. Install it with the corresponding Maintenance and Annotation packages; [the plugin guide](dsh/README.md) lists the verified combination and target-profile flow. An upstream download, an unqualified package name or `@latest` does not select this fork.

Local verification:

```sh
node --experimental-strip-types --test src/maintenance/model.test.mjs src/maintenance/client.test.mjs src/maintenance/sync.test.mjs dsh/tests/managed-host.test.mjs dsh/tests/managed-client.test.mjs
npm run dsh:build
```

The latest graph/reference change has 35 passing synthetic tests and a successful TypeScript/build check. See [graph synchronization](docs/changes/2026-09-15-graph-reference-refresh.md), [layout and theme](docs/changes/2026-09-15-vertical-layout-dsh-theme.md), and the [combined lifecycle verification report](https://github.com/linmu115/dsh-session-maintenance/blob/codex/rc2-session-context-graph/docs/reports/2026-09-15-graph-reference-lifecycle-release.md). Local package and instance verification are separate from public distribution.

## Standalone app

The standalone web/desktop application retains ThoughtDAG's editable question-and-answer canvas, Session Atlas, PDF/file readers, model connections, clipping, export, and local conversation search. Its canvas execution and storage are separate from the managed DSH panel.

Run the standalone app from source:

```sh
npm ci
npm run server    # Model proxy on port 3001
# In another terminal:
npm run dev       # Vite app, normally on port 5173
```

Configure a model in the app or use the documented environment settings. See [setup](docs/setup.md), [features](docs/features.md), [desktop packaging](desktop/package.json), and the [CLI guide](cli/README.md). Build this checkout's CLI with `npm run cli:build`, then run `node cli/dist/thoughtdag.mjs --help`.

The [upstream project](https://github.com/chenxiachan/thoughtdag) provides its own standalone releases and product documentation. Those releases do not contain this fork's current DSH integration.

## Attribution and contribution

ThoughtDAG was created by Xia Chen and its upstream contributors. This fork preserves the standalone application and adds the managed DSH integration. Contributions should distinguish standalone changes from changes to `src/maintenance/` and `dsh/`.

[Contributing](CONTRIBUTING.md) · [MIT license](LICENSE) · [Upstream repository](https://github.com/chenxiachan/thoughtdag)
