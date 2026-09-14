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
function inspectorApply(ctx) {
  const calls = [], objects = new Map()
  const logical = { logicalSessionId: 'synthetic-logical', nativeSessionId: 'synthetic-native', title: 'Synthetic conversation' }
  ctx.provide('maintenanceGraph', {
    protocolVersion: 1,
    directory: async (workspaceId, after) => { calls.push(['directory', workspaceId, after]); return { items: [{ id: 'synthetic-workspace', title: 'Synthetic workspace' }], nextCursor: null } },
    resolve: async input => {
      calls.push(['resolve', input])
      if (input.nativeSessionId?.startsWith('td-') && !ctx.sessions.get(input.nativeSessionId))
        throw Object.assign(new Error('Synthetic session not found'), { code: 'GRAPH_SESSION_NOT_FOUND' })
      return logical
    },
    preview: async (logicalSessionId, cursor, source) => { calls.push(['preview', logicalSessionId, cursor, source]); return {
      logicalSessionId, title: 'Synthetic conversation', items: [{ role: 'assistant', text: 'Synthetic completed reply' }], nextCursor: null,
    } },
    relations: async () => ({ items: [], nextCursor: null }),
    created: async nativeSessionId => ({ ...logical, nativeSessionId }),
  })
  ctx.provide('maintenanceExtensionData', { bridge: {
    list: async namespace => { calls.push(['list', namespace]); return { items: [], nextCursor: null } },
    get: async (namespace, objectId) => { calls.push(['get', namespace, objectId]); return objects.get(objectId) ?? null },
    save: async (namespace, objectId, expectedRevision, content, deleted) => {
      calls.push(['save', namespace, objectId, expectedRevision, content, deleted])
      const previous = objects.get(objectId)
      if ((previous?.revision ?? 0) !== expectedRevision) throw new Error('Synthetic revision conflict')
      const object = { objectId, revision: expectedRevision + 1, content, deleted }
      objects.set(objectId, object); return object
    },
  } })
  ctx.provide('maintenanceSessionContext', { protocolVersion: 1 })
  ctx.effect(() => () => writeFile(settings.disposalPath, JSON.stringify({ disposed: true })), 'thoughtdag synthetic inspector disposal')
  ctx.get('appReady').onReady(() => {
    setTimeout(async () => {
      try {
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
        assert.deepEqual(status.capabilities, { storage: true, sessions: true, references: true })
        assert.equal((await request('/thoughtdag/api/managed/directory?workspaceId=synthetic-workspace&profileId=forged')).status, 200)
        const preview = await request('/thoughtdag/api/managed/preview?logicalSessionId=synthetic-logical&sourceVersionId=fixed-version&sourceAnchorId=completed-reply')
        assert.equal(preview.status, 200)
        assert.ok(calls.some(call => call[0] === 'preview' && call[3]?.sourceVersionId === 'fixed-version' && call[3]?.sourceAnchorId === 'completed-reply'))
        const canvas = { objectId: 'synthetic-canvas', expectedRevision: 0, title: 'Synthetic canvas',
          body: { managedSchema: 1, nodes: [{ id: 'node', type: 'session', position: { x: 0, y: 0 }, data: { logicalSessionId: logical.logicalSessionId } }], edges: [] } }
        const saved = await request('/thoughtdag/api/managed/save', canvas)
        assert.equal(saved.status, 200); assert.equal(JSON.parse(saved.text).revision, 1)
        assert.equal((await request('/thoughtdag/api/managed/save', canvas)).status, 409)
        assert.equal((await request('/thoughtdag/api/managed/canvas?objectId=synthetic-canvas')).status, 200)
        for (const path of ['disksessions', 'inject', 'stream']) assert.equal((await request('/thoughtdag/api/' + path)).status, 410)
        const createBody = { operationId: 'official-synthetic-session', cwd: settings.workspace }
        const first = await request('/thoughtdag/api/managed/create-session', createBody)
        assert.equal(first.status, 200, first.text)
        const second = await request('/thoughtdag/api/managed/create-session', createBody)
        assert.equal(second.status, 200, second.text); assert.deepEqual(JSON.parse(first.text), JSON.parse(second.text))
        const nativeId = JSON.parse(first.text).nativeSessionId
        const session = ctx.sessions.get(nativeId)
        assert.ok(session, 'Official controller must create the synthetic native session')
        const result = { passed: true, packageActivated: true, officialClientManifest: client,
          staticPageStatus: page.status, assetStatus: 200, managedStatus: status, directory: true, preview: true,
          saveRevision: 1, saveConflictStatus: 409, legacyStatus: 410, nativeCreate: { sessionId: nativeId, replayMatched: true },
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
  const cohort = {}
  for (const [name, expected] of Object.entries(packageManifest.peerDependencies)) {
    const path = requireHost.resolve(name + '/package.json'), actual = (await json(path)).version
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
    officialHost: { version: officialManifest.version, cli, sha256: await hash(cli) }, cohort,
    package: { path: packageRoot, version: packageManifest.version, entrySha256: await hash(join(packageRoot, 'lib/index.js')),
      managedHostSha256: await hash(join(packageRoot, 'lib/managed-graph.js')), clientSha256: await hash(join(packageRoot, 'lib/client.js')) },
    installation: 'Local package junction plus official initProfile/healProfilesModuleFallback; no strict install or external plugins.',
    scope: 'Actual official RC2 Host activation, client boot manifest and static bundle delivery, managed HTTP with synthetic instance-bound services, native empty-session create/replay. Does not claim browser interaction, real Maintenance bridge attestation, full plugin cohort deployment, or model runs.',
    disposal: await json(settings.disposalPath), exit }
  await save(join(runRoot, 'result.json'), result); await save(join(output, 'result.json'), result)
  await save(join(output, 'latest-run.json'), { runRoot, state: 'passed' })
  console.log(JSON.stringify({ passed: true, runRoot, result: join(output, 'result.json'), version: officialManifest.version, fixtureOnly: true }))
} catch (error) {
  await save(join(runRoot, 'failure.json'), { passed: false, error: redact(error.stack ?? error.message), fixtureOnly: true })
  await save(join(output, 'latest-run.json'), { runRoot, state: 'failed' })
  console.error(redact(error.message)); process.exitCode = 1
}
