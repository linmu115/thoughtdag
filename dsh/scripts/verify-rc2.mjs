import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, mkdtemp, symlink, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) {
  assert.ok(['--runtime', '--output'].includes(process.argv[i]) && process.argv[i + 1], 'Expected --runtime PATH or --output PATH')
  args.set(process.argv[i], resolve(process.argv[i + 1]))
}
const runtimeRoot = args.get('--runtime') ?? 'C:/Users/19717/OneDrive/文档/ChatGPT/dsh/.artifacts/rc2-launcher-deployment/runtime'
const output = args.get('--output') ?? 'D:/AI/DeepSeekHarness-Plugin/artifacts/thoughtdag-rc2-20260914/host-probe'
const packageRoot = resolve(import.meta.dirname, '..')
const cli = join(runtimeRoot, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
const requireHost = createRequire(cli)
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const save = (path, data) => writeFile(path, JSON.stringify(data, null, 2) + '\n')
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex')
const redact = text => text.replace(/([?&](?:token|key|secret)=)[^\s&#]+/giu, '$1[REDACTED]')
  .replace(/(Bearer\s+)[\w.-]+/giu, '$1[REDACTED]')

// This function is serialized as an isolated Cordis inspector inside the new
// synthetic home. It supplies test doubles only, never a real Engine handle.
//
// 只补宿主**没有**提供的东西：官方 web profile 已经注册了 workspaceRegistry 与
// sessionController，再 provide 一次会让插件树直接起不来（"has been registered"）。
// 这里因此只放会话扩展数据与会话引用上下文这两个由消费侧插件提供的端口。
//
// 已知阻塞（本轮只读核查，未修）：合成 profile 没有装 dsh-annotation-core，因此
// 没人提供 `annotationCoreHost`，而本插件的 inject 列表里有它 —— 插件树会停在
// `dsh-thoughtdag: pending (waiting for service: annotationCoreHost)`，本脚本跑不到
// 自己的断言。要真正跑通需要：把 annotation-core 作为依赖装进合成 profile 并加载
// 它的 patch（`config.profileId: web`），同时 **删掉下面这两个 provide** ——
// 那两个端口正是 Core 自己提供的，会被占用冲突。
function inspectorApply(ctx) {
  const calls = [], objects = new Map(), relations = new Map()
  const identities = [{ logicalSessionId: 'synthetic-logical', nativeSessionId: 'synthetic-native', title: 'Synthetic conversation' }]
  const key = (sessionId, namespace, objectId) => JSON.stringify([sessionId, namespace, objectId])
  const extensionData = {
    protocolVersion: 1,
    list: (namespace, sessionId) => [...objects.values()].filter(row => row.namespace === namespace && (!sessionId || row.sessionId === sessionId)),
    get: (sessionId, namespace, objectId) => objects.get(key(sessionId, namespace, objectId)),
    ready: async () => {},
    write: async input => {
      calls.push(['write', input.namespace, input.objectId])
      const previous = objects.get(key(input.sessionId, input.namespace, input.objectId))
      if ((previous?.revision ?? 0) !== input.expectedRevision) throw new Error('Synthetic revision conflict')
      const object = { sessionId: input.sessionId, namespace: input.namespace, objectId: input.objectId, revision: (previous?.revision ?? 0) + 1, deleted: input.deleted, content: JSON.parse(JSON.stringify(input.content)) }
      objects.set(key(input.sessionId, input.namespace, input.objectId), object); return JSON.parse(JSON.stringify(object))
    },
  }
  const resolveIdentity = input => {
    const found = identities.find(row => row.logicalSessionId === input.logicalSessionId || row.nativeSessionId === input.nativeSessionId)
    if (!found) throw new Error('Synthetic session not found')
    return JSON.parse(JSON.stringify(found))
  }
  const referenceContext = {
    protocolVersion: 1,
    directory: async (workspaceId, after) => { calls.push(['directory', workspaceId, after]); return { items: [{ id: 'synthetic-workspace', title: 'Synthetic workspace' }], nextCursor: null } },
    resolve: async input => { calls.push(['resolve', input]); return resolveIdentity(input) },
    preview: async (logicalSessionId, cursor, source) => { calls.push(['preview', logicalSessionId, cursor, source]); return {
      logicalSessionId, nativeSessionId: 'synthetic-native', title: 'Synthetic conversation', sourceVersionId: source?.sourceVersionId ?? 'fixed-version',
      items: [{ eventId: 'completed-reply', role: 'assistant', text: 'Synthetic completed reply', offset: 0, complete: true }], hasMore: false, nextCursor: null,
      capture: { sourceSessionId: 'synthetic-native', anchorId: 'completed-reply', messageId: 'completed-reply', role: 'assistant', occurrence: 0, selectedText: 'completed' },
    } },
    capture: async input => {
      calls.push(['capture', input])
      const referenceId = `local-ref-${input.targetNativeSessionId}-${relations.size}`
      const record = { referenceId, sourceNativeSessionId: input.sourceNativeSessionId, targetNativeSessionId: input.targetNativeSessionId, sourceTitle: 'Synthetic conversation',
        sourceVersionId: input.expectedSourceVersionId ?? 'fixed-version', cutoffEventId: input.anchorId, sourceAnchorId: input.anchorId, selectedText: input.selectedText, state: 'pending', targetMessageId: null }
      relations.set(referenceId, record)
      await extensionData.write({ sessionId: input.targetNativeSessionId, namespace: 'annotation-upstream', objectId: referenceId, expectedRevision: 0, deleted: false, content: record })
      return { ...record, requestDigest: 'synthetic-digest', entries: [], turnStart: 0 }
    },
    describe: async (target, id) => { const record = relations.get(id); if (!record || record.targetNativeSessionId !== target) throw new Error('Synthetic reference not found'); return { record: { ...record }, sourceNativeSessionId: record.sourceNativeSessionId } },
    inspect: async (target, id) => (await referenceContext.describe(target, id)).record,
    status: async (target, id) => { const record = relations.get(id); if (!record) throw new Error('Synthetic reference not found'); return { referenceId: id, state: record.state } },
  }
  ctx.provide('sessionExtensionData', extensionData)
  ctx.provide('sessionReferenceContext', referenceContext)
  ctx.effect(() => () => writeFile(settings.disposalPath, JSON.stringify({ disposed: true })), 'thoughtdag synthetic inspector disposal')
  ctx.get('appReady').onReady(() => {
    setTimeout(async () => {
      try {
        // 真工作区注册表：DAG 的 create-session / create-sticker 都要求工作区真实存在。
        const workspace = await ctx.workspaceRegistry.create(settings.workspace, 'Synthetic workspace')
        const workspaceId = String(workspace.id)
        calls.push(['workspace', workspaceId])
        const entries = [...ctx.loader.entries()].map(entry => ({ id: entry.options.id, name: entry.options.name, state: entry.fiber?.state }))
        assert.ok(entries.some(entry => entry.id === 'thoughtdag' && entry.state === 2), 'ThoughtDAG must activate through its package entry')
        const origin = 'http://127.0.0.1:' + ctx.webServer.port
        const request = async (path, body) => {
          const response = await fetch(origin + path, { headers: { origin, ...(body ? { 'content-type': 'application/json' } : {}) },
            ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) })
          return { status: response.status, text: await response.text() }
        }
        const page = await request('/thoughtdag/')
        assert.equal(page.status, 200); assert.match(page.text, /<html/i)
        const assetPath = page.text.match(/(?:src|href)="(\/thoughtdag\/assets\/[^"\s]+\.js)"/)?.[1]
        assert.ok(assetPath, 'Built managed canvas script must be served')
        assert.equal((await request(assetPath)).status, 200)
        const manifest = ctx.clientModules.graph()
        const client = manifest.entries.find(entry => entry.id === 'dsh-thoughtdag')
        assert.ok(client, 'Official client module registry must discover the package')
        assert.deepEqual(client.inject, settings.expectedInject)
        assert.equal((await request(client.url)).status, 200)
        assert.match(ctx.webServer.renderIndex('<html><head></head><body></body></html>'), /dsh-thoughtdag/)
        const status = JSON.parse((await request('/thoughtdag/api/managed/status')).text)
        assert.deepEqual(status.capabilities, { storage: true, sessions: true, mainGraph: true, references: true, nativeContext: false })
        assert.equal((await request('/thoughtdag/api/managed/directory?workspaceId=' + workspaceId + '&profileId=forged')).status, 200)
        const preview = await request('/thoughtdag/api/managed/preview?logicalSessionId=synthetic-logical&sourceVersionId=fixed-version&sourceAnchorId=completed-reply')
        assert.equal(preview.status, 200)
        assert.ok(calls.some(call => call[0] === 'preview' && call[3]?.sourceVersionId === 'fixed-version' && call[3]?.sourceAnchorId === 'completed-reply'))
        const canvas = { objectId: 'synthetic-canvas', expectedRevision: 0, title: 'Synthetic canvas',
          graph: { managedSchema: 2, ownerSessionId: 'synthetic-canvas-owner', nodes: [{ id: 'node', position: { x: 0, y: 0 }, data: { kind: 'session', label: 'Synthetic', logicalSessionId: 'synthetic-canvas-owner' } }], edges: [] } }
        const saved = await request('/thoughtdag/api/managed/save', canvas)
        assert.equal(saved.status, 200, saved.text); assert.equal(JSON.parse(saved.text).revision, 1)
        assert.equal((await request('/thoughtdag/api/managed/save', canvas)).status, 409)
        for (const path of ['disksessions', 'inject', 'stream']) assert.equal((await request('/thoughtdag/api/' + path)).status, 410)
        const createBody = { operationId: 'official-synthetic-session', cwd: settings.workspace }
        const first = await request('/thoughtdag/api/managed/create-session', createBody)
        assert.equal(first.status, 200, first.text)
        const second = await request('/thoughtdag/api/managed/create-session', createBody)
        assert.equal(second.status, 200, second.text); assert.deepEqual(JSON.parse(first.text), JSON.parse(second.text))
        const nativeId = JSON.parse(first.text).nativeSessionId
        const session = ctx.sessions.get(nativeId)
        assert.ok(session, 'Official controller must create the synthetic native session')
        // 会话贴纸：新会话 + 只表达拓扑的单向绑定边，落在新会话自己的图里。
        const sticker = await request('/thoughtdag/api/managed/create-sticker', { operationId: 'synthetic-sticker', workspaceId,
          sourceSessionId: 'synthetic-native', currentSessionId: 'synthetic-native' })
        assert.equal(sticker.status, 200, sticker.text)
        const stickerIdentity = JSON.parse(sticker.text)
        const stickerGraph = JSON.parse((await request('/thoughtdag/api/managed/canvas?objectId=' + stickerIdentity.graphObjectId)).text).graph
        const bound = stickerGraph.edges.filter(edge => edge.data.kind === 'bound')
        assert.deepEqual(bound.map(edge => [edge.source, edge.target]), [['session:synthetic-native', 'session:' + stickerIdentity.logicalSessionId]])
        assert.ok(bound.every(edge => edge.data.relationId === undefined), 'A bound edge must carry no reference authorization')
        assert.equal(stickerGraph.ownerSessionId, stickerIdentity.logicalSessionId)
        const result = { passed: true, packageActivated: true, officialClientManifest: client,
          staticPageStatus: page.status, assetStatus: 200, managedStatus: status, directory: true, preview: true,
          saveRevision: 1, saveConflictStatus: 409, legacyStatus: 410, nativeCreate: { sessionId: nativeId, replayMatched: true },
          sessionSticker: { sessionId: stickerIdentity.nativeSessionId, boundEdges: bound.length, boundIsTopologyOnly: true },
          realModelCalls: 0, onlySyntheticCapabilities: true, selectedEntries: entries.filter(entry => ['thoughtdag', 'thoughtdag-rc2-inspector'].includes(entry.id)) }
        await writeFile(settings.resultPath, JSON.stringify(result, null, 2))
        ctx.get('appExit')(0)
      } catch (error) {
        await writeFile(settings.resultPath, JSON.stringify({ passed: false, error: error.stack ?? error.message }, null, 2))
        ctx.get('appExit')(1)
      }
    }, 250)
  })
}

await mkdir(output, { recursive: true })
const runRoot = await mkdtemp(join(output, 'synthetic-'))
const home = join(runRoot, 'home'), profile = join(home, 'profiles/web'), workspace = join(runRoot, 'workspace')
await mkdir(workspace); await mkdir(join(runRoot, 'tmp')); await mkdir(join(runRoot, 'logs'))
await save(join(runRoot, 'SYNTHETIC-FIXTURE.json'), { purpose: 'ThoughtDAG official DSH 0.1.5-rc.2 host compatibility', userData: false, createdAt: new Date().toISOString() })
await save(join(output, 'latest-run.json'), { runRoot, state: 'preparing' })
try {
  const packageManifest = await json(join(packageRoot, 'package.json'))
  const officialManifest = await json(requireHost.resolve('@deepseek-ai/dsh/package.json'))
  assert.equal(officialManifest.version, '0.1.5-rc.2')
  const cohort = {}, unresolvedConsumerPeers = {}
  for (const [name, expected] of Object.entries(packageManifest.peerDependencies)) {
    // 官方 peer 必须来自官方 runtime 且版本完全一致。
    // 消费侧插件（dsh-annotation-core 这类由用户单独装进 profile 的插件）不在官方
    // runtime 里：本脚本只为本仓库的包建合成 profile，从不安装它们。以前这条循环
    // 假定所有 peer 都在 runtime 内，独立架构下就永远解析不到、装配根本起不来。
    let path
    try { path = requireHost.resolve(name + '/package.json') }
    catch (error) {
      if (!name.startsWith('dsh-')) throw error
      unresolvedConsumerPeers[name] = { expected, reason: 'not part of the official runtime; installed separately by the user' }
      continue
    }
    const actual = (await json(path)).version
    if (name !== '@deepseek-ai/cordis') assert.equal(actual, '0.1.5-rc.2', 'Official peer release: ' + name)
    else assert.equal(actual, '4.0.2')
    cohort[name] = { version: actual, expected, manifestPath: await realpath(path) }
  }
  const { initProfile, healProfilesModuleFallback } = await import(pathToFileURL(requireHost.resolve('@deepseek-ai/dsh-app-boot')).href)
  initProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-thoughtdag'], 'startup')
  await mkdir(join(profile, 'node_modules'), { recursive: true })
  await symlink(packageRoot, join(profile, 'node_modules/dsh-thoughtdag'), process.platform === 'win32' ? 'junction' : 'dir')
  const manifest = await json(join(profile, 'package.json'))
  manifest.dependencies = { ...manifest.dependencies, 'dsh-thoughtdag': 'file:' + packageRoot.replaceAll('\\', '/') }
  await save(join(profile, 'package.json'), manifest)
  await healProfilesModuleFallback({ installAnchor: requireHost.resolve('@deepseek-ai/dsh/package.json'), home })
  const settings = { workspace, expectedInject: packageManifest.dsh.client.inject,
    resultPath: join(runRoot, 'host-result.json'), disposalPath: join(runRoot, 'disposed.json') }
  const inspectorPath = join(runRoot, 'inspector.mjs')
  await writeFile(inspectorPath, `import assert from 'node:assert/strict';\nimport {writeFile} from 'node:fs/promises';\nconst settings=${JSON.stringify(settings)};\nexport const name='thoughtdag-rc2-inspector';\nexport const inject=['webServer','sessions','sessionController','clientModules'];\nexport const apply=${inspectorApply.toString()};\n`)
  const { stringify } = requireHost('yaml')
  await writeFile(join(profile, 'cordis.patch.yml'), stringify([{ insert: [{ id: 'thoughtdag-rc2-inspector', name: inspectorPath.replaceAll('\\', '/') }] }]))
  const env = { ...process.env }
  for (const name of Object.keys(env)) if (/^(DSH_|CODEX_API_KEY$)|API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/iu.test(name)) delete env[name]
  const npmrc = join(runRoot, 'empty.npmrc'); await writeFile(npmrc, '')
  Object.assign(env, { DSH_HOME: home, DSH_OFFICIAL_ROOT: runtimeRoot, DSH_TELEMETRY_DISABLED: '1', CI: '1', TEMP: join(runRoot, 'tmp'), TMP: join(runRoot, 'tmp'),
    npm_config_userconfig: npmrc, npm_config_cache: join(runRoot, 'npm-cache'), npm_config_store_dir: join(runRoot, 'pnpm-store') })
  await save(join(output, 'latest-run.json'), { runRoot, state: 'running' })
  const child = spawn(process.execPath, [cli, '--profile', 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'],
    { cwd: workspace, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = '', timedOut = false
  child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
  const timer = setTimeout(() => { timedOut = true; child.kill() }, 60000)
  const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })) }).finally(() => clearTimeout(timer))
  await writeFile(join(runRoot, 'logs/stdout.log'), redact(stdout)); await writeFile(join(runRoot, 'logs/stderr.log'), redact(stderr))
  assert.equal(timedOut, false, 'Official host timed out')
  const probe = await json(settings.resultPath)
  assert.equal(exit.code, 0, probe.error ?? 'Official host did not exit normally')
  assert.equal(probe.passed, true)
  const result = { ...probe, runRoot, home, profile, fixtureOnly: true, realProfilesTouched: false, actualCopyStarted: false,
    officialHost: { version: officialManifest.version, cli, sha256: await hash(cli) }, cohort, unresolvedConsumerPeers,
    package: { path: packageRoot, version: packageManifest.version, entrySha256: await hash(join(packageRoot, 'lib/index.js')),
      managedHostSha256: await hash(join(packageRoot, 'lib/managed-graph.js')), clientSha256: await hash(join(packageRoot, 'lib/client.js')) },
    installation: 'Local package junction plus official initProfile/healProfilesModuleFallback; no strict install or external plugins.',
    scope: 'Actual official RC2 Host activation, client boot manifest and static bundle delivery, managed HTTP with synthetic instance-bound services, native empty-session create/replay, and session-sticker topology binding. Does not claim browser interaction, real external-bridge attestation, full plugin cohort deployment, or model runs. Blocked on this machine: the synthetic profile does not provision dsh-annotation-core, so annotationCoreHost is absent and the plugin tree stops waiting for it — see the inspector note above.',
    disposal: await json(settings.disposalPath), exit }
  await save(join(runRoot, 'result.json'), result); await save(join(output, 'result.json'), result)
  await save(join(output, 'latest-run.json'), { runRoot, state: 'passed' })
  console.log(JSON.stringify({ passed: true, runRoot, result: join(output, 'result.json'), version: officialManifest.version, fixtureOnly: true }))
} catch (error) {
  await save(join(runRoot, 'failure.json'), { passed: false, error: redact(error.stack ?? error.message), fixtureOnly: true })
  await save(join(output, 'latest-run.json'), { runRoot, state: 'failed' })
  console.error(redact(error.message)); process.exitCode = 1
}
