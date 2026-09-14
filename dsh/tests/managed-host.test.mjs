import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { apply, inject } from '../lib/managed-entry.js'

const LIMIT = 512 * 1024

async function fixture(t, options = {}) {
  const calls = [], routes = [], sessions = new Map(), persisted = new Map(), disposers = []
  const graph = {
    protocolVersion: 1,
    directory: async (...args) => { calls.push(['directory', ...args]); return { items: [], nextCursor: null } },
    resolve: async input => {
      calls.push(['resolve', input])
      if (input.nativeSessionId?.startsWith('td-') && !persisted.has(input.nativeSessionId))
        throw Object.assign(new Error('Synthetic native session not found'), { code: 'GRAPH_SESSION_NOT_FOUND' })
      return { logicalSessionId: 'logical-fixture', nativeSessionId: input.nativeSessionId ?? 'native-fixture' }
    },
    preview: async (...args) => { calls.push(['preview', ...args]); return { items: [], nextCursor: null } },
    relations: async (...args) => { calls.push(['relations', ...args]); return { items: [], nextCursor: null } },
    created: async nativeSessionId => { calls.push(['created', nativeSessionId]); return { logicalSessionId: 'logical-' + nativeSessionId, nativeSessionId } },
  }
  const bridge = {
    credential: 'synthetic-secret-must-not-be-exposed',
    list: async (...args) => { calls.push(['list', ...args]); return { items: [], nextCursor: null } },
    get: async (...args) => { calls.push(['get', ...args]); return null },
    save: async (...args) => { calls.push(['save', ...args]); return { objectId: args[1], revision: args[2] + 1 } },
  }
  const services = {
    maintenanceGraph: graph, maintenanceExtensionData: { bridge }, maintenanceSessionContext: { protocolVersion: 1 },
  }
  if (options.missing) for (const name of options.missing) delete services[name]
  const ctx = {
    get: key => services[key], sessions,
    sessionController: {
      create: async input => {
        calls.push(['create', input]); const session = { header: { cwd: input.cwd } }
        sessions.set(input.sessionId, session); persisted.set(input.sessionId, session); return input
      },
      resolveAgent: async sessionId => {
        calls.push(['resolveAgent', sessionId])
        const session = persisted.get(sessionId)
        if (!session) throw new Error('Synthetic native file is unavailable')
        sessions.set(sessionId, session); return { id: sessionId, session }
      },
    },
    webServer: { register: route => { routes.push(route); return () => { routes.splice(routes.indexOf(route), 1) } } },
    effect: fn => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose) },
    logger: { info() {} },
  }
  await apply(ctx, options.config)
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://synthetic.local').pathname
    const route = routes.find(candidate => candidate.kind === 'exact' ? path === candidate.path : path.startsWith(candidate.path))
    if (!route) { res.writeHead(404); res.end(); return }
    Promise.resolve(route.handler(req, res)).catch(error => { res.writeHead(500); res.end(JSON.stringify({ error: error.message })) })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const port = server.address().port, origin = `http://127.0.0.1:${port}`
  t.after(async () => { disposers.forEach(dispose => dispose()); server.close(); await once(server, 'close') })
  async function send(path, { method = 'GET', body, headers = {}, origin: includeOrigin = true } = {}) {
    const bytes = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
    return new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path, method, headers: {
        ...(includeOrigin ? { origin } : {}), ...(bytes === undefined ? {} : { 'content-type': 'application/json' }), ...headers,
      } }, res => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve({ status: res.statusCode, headers: res.headers, text, body: text ? JSON.parse(text) : null })
        })
      })
      req.on('error', reject)
      req.end(bytes)
    })
  }
  const api = (operation, opts) => send('/thoughtdag/api/managed/' + operation, opts)
  return { api, send, ctx, graph, bridge, calls, routes, sessions, persisted, services, origin }
}

test('entry registers managed routes and publishes only capability metadata', async t => {
  const f = await fixture(t)
  assert.deepEqual(inject, ['webServer', 'sessions', 'sessionController'])
  assert.deepEqual(f.routes.map(({ kind, path }) => ({ kind, path })), [
    { kind: 'exact', path: '/thoughtdag' }, { kind: 'prefix', path: '/thoughtdag/api' }, { kind: 'prefix', path: '/thoughtdag' },
  ])
  const response = await f.api('status')
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { protocolVersion: 1, mode: 'maintenance', capabilities: { storage: true, sessions: true, references: true } })
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.doesNotMatch(response.text, /credential|synthetic-secret/)
  const version = await f.send('/thoughtdag/api/version')
  assert.equal(version.status, 200); assert.equal(version.body.mode, 'maintenance')
})

test('missing capabilities report the dependency and reject operations without any fallback', async t => {
  const f = await fixture(t, { missing: ['maintenanceGraph'] })
  const status = await f.api('status')
  assert.equal(status.status, 200)
  assert.deepEqual(status.body.capabilities, { storage: true, sessions: false, references: false })
  assert.match(status.body.reason, /维护插件.*会话图接口/)
  assert.equal((await f.api('directory')).status, 503)
  assert.equal(f.calls.some(call => call[0] === 'create'), false)
})

test('an unavailable extension store is distinct from missing session graph support', async t => {
  const f = await fixture(t, { missing: ['maintenanceExtensionData'] })
  const status = await f.api('status')
  assert.deepEqual(status.body.capabilities, { storage: false, sessions: false, references: false })
  assert.match(status.body.reason, /图数据存储/)
  assert.equal((await f.api('canvases')).status, 503)
})

test('browser-supplied run/profile identities and credentials cannot select bridge scope', async t => {
  const f = await fixture(t)
  const query = '?workspaceId=work&after=page&instanceId=other&profileId=evil&runId=forged&token=forged'
  assert.equal((await f.api('directory' + query)).status, 200)
  assert.deepEqual(f.calls, [['directory', 'work', 'page']])
  assert.equal((await f.api('canvas?objectId=one&namespace=annotation&profileId=other')).status, 200)
  assert.deepEqual(f.calls.at(-1), ['get', 'thoughtdag', 'one'])
  assert.equal((await f.api('objects?namespace=annotation&after=page')).status, 200)
  assert.deepEqual(f.calls.at(-1), ['list', 'annotation', 'page'])
  assert.equal((await f.api('objects?namespace=native-sessions')).status, 422)
  assert.equal((await f.api('object?namespace=obsidian-links&objectId=note')).status, 200)
  assert.deepEqual(f.calls.at(-1), ['get', 'obsidian-links', 'note'])
})

test('old transcript readers and injection/stream routes are retired', async t => {
  const f = await fixture(t)
  for (const path of ['/sessions', '/disk-sessions', '/disksessions', '/inject', '/stream', '/session/source/inject', '/chat']) {
    for (const method of ['GET', 'POST']) {
      const response = await f.send('/thoughtdag/api' + path, { method, ...(method === 'POST' ? { body: {} } : {}) })
      assert.equal(response.status, 410, `${method} ${path}`)
      assert.match(response.body.error, /统一引用接口/)
    }
  }
  assert.deepEqual(f.calls, [])
})

test('save delegates graph validation and revision authority to Maintenance', async t => {
  const f = await fixture(t)
  const body = { managedSchema: 1, nodes: [
    { id: 'a', data: { logicalSessionId: 'source' } }, { id: 'b', data: { logicalSessionId: 'source' } },
    { id: 'c', data: { logicalSessionId: 'target' } },
  ], edges: [{ source: 'a', target: 'c', kind: 'unknown-to-host' }] }
  const response = await f.api('save', { method: 'POST', body: { objectId: 'canvas', expectedRevision: 7, title: 'Canvas', body, deleted: false,
    instanceId: 'forged', profileId: 'forged', credentials: 'forged' } })
  assert.equal(response.status, 200); assert.deepEqual(response.body, { objectId: 'canvas', revision: 8 })
  assert.deepEqual(f.calls.at(-1), ['save', 'thoughtdag', 'canvas', 7, { schemaVersion: 1, title: 'Canvas', body,
    references: [{ logicalSessionId: 'source' }, { logicalSessionId: 'target' }] }, false])
  f.bridge.save = async () => { throw new Error('revision conflict: expected 7, actual 8') }
  const conflict = await f.api('save', { method: 'POST', body: { objectId: 'canvas', expectedRevision: 7, title: 'Canvas', body } })
  assert.equal(conflict.status, 409); assert.match(conflict.body.error, /revision conflict/)
  f.bridge.save = async () => { throw new Error('invalid graph relation kind') }
  const invalid = await f.api('save', { method: 'POST', body: { objectId: 'canvas', expectedRevision: 8, title: 'Canvas', body } })
  assert.equal(invalid.status, 409); assert.match(invalid.body.error, /invalid graph relation kind/)
})

test('save validates basic shape and never calls the store for malformed input', async t => {
  const f = await fixture(t)
  const valid = { objectId: 'canvas', expectedRevision: 0, title: 'Canvas', body: { managedSchema: 1, nodes: [], edges: [] } }
  for (const bad of [ { expectedRevision: -1 }, { expectedRevision: 0.5 }, { title: '' }, { deleted: 'true' }, { body: { nodes: [], edges: [] } } ]) {
    assert.equal((await f.api('save', { method: 'POST', body: { ...valid, ...bad } })).status, 422)
  }
  assert.deepEqual(f.calls, [])
})

test('fixed-version preview forwards both source bounds and rejects half-specified bounds', async t => {
  const f = await fixture(t)
  const response = await f.api('preview?logicalSessionId=logical&sourceVersionId=v1&sourceAnchorId=end&cursor=cursor1')
  assert.equal(response.status, 200)
  assert.deepEqual(f.calls, [['preview', 'logical', 'cursor1', { sourceVersionId: 'v1', sourceAnchorId: 'end' }]])
  assert.equal((await f.api('preview?logicalSessionId=logical&sourceVersionId=v1')).status, 422)
  assert.equal((await f.api('preview?logicalSessionId=logical&sourceAnchorId=end')).status, 422)
  assert.equal((await f.api('preview?logicalSessionId=logical&cursor=' + 'a'.repeat(4097))).status, 422)
  assert.equal(f.calls.length, 1)
})

test('resolve accepts exactly one native or logical identity, with bounded paging', async t => {
  const f = await fixture(t)
  assert.equal((await f.api('resolve?logicalSessionId=logical')).status, 200)
  assert.deepEqual(f.calls.at(-1), ['resolve', { logicalSessionId: 'logical' }])
  assert.equal((await f.api('resolve?nativeSessionId=native')).status, 200)
  assert.deepEqual(f.calls.at(-1), ['resolve', { nativeSessionId: 'native' }])
  assert.equal((await f.api('resolve')).status, 422)
  assert.equal((await f.api('resolve?logicalSessionId=logical&nativeSessionId=native')).status, 422)
  assert.equal((await f.api('relations?after=' + 'a'.repeat(257))).status, 422)
})

test('create-session replays the same operation without creating another native conversation', async t => {
  const f = await fixture(t)
  const body = { operationId: 'stable-operation', cwd: 'C:/synthetic-only' }
  const first = await f.api('create-session', { method: 'POST', body })
  const second = await f.api('create-session', { method: 'POST', body })
  assert.equal(first.status, 200); assert.deepEqual(second.body, first.body)
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1)
  assert.equal(f.sessions.size, 1)
})

test('an acknowledged create operation cannot create a second conversation by changing cwd', async t => {
  const f = await fixture(t)
  const first = await f.api('create-session', { method: 'POST', body: { operationId: 'stable-operation', cwd: 'C:/first' } })
  const changed = await f.api('create-session', { method: 'POST', body: { operationId: 'stable-operation', cwd: 'C:/different' } })
  assert.equal(first.status, 200)
  assert.ok(changed.status === 422 || (changed.status === 200 && changed.body.nativeSessionId === first.body.nativeSessionId))
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1)
})

test('concurrent replay shares native creation and recovery after a lost mapping acknowledgement', async t => {
  const f = await fixture(t)
  let release, entered
  const waiting = new Promise(resolve => { entered = resolve })
  f.ctx.sessionController.create = async input => {
    f.calls.push(['create', input]); entered(); await new Promise(resolve => { release = resolve })
    const session = { header: { cwd: input.cwd } }; f.sessions.set(input.sessionId, session); f.persisted.set(input.sessionId, session)
  }
  const body = { operationId: 'concurrent', cwd: 'C:/synthetic' }
  const first = f.api('create-session', { method: 'POST', body }); await waiting
  const second = f.api('create-session', { method: 'POST', body })
  release(); const results = await Promise.all([first, second])
  assert.deepEqual(results[0].body, results[1].body)
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1)
  f.graph.created = async () => { throw new Error('mapping acknowledgement lost') }
  assert.equal((await f.api('create-session', { method: 'POST', body })).status, 409)
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1)
})

test('create replay restores a cold native session through the official controller', async t => {
  const f = await fixture(t)
  const body = { operationId: 'cold-replay', cwd: 'C:/synthetic' }
  const first = await f.api('create-session', { method: 'POST', body })
  assert.equal(first.status, 200)
  f.sessions.clear()
  const repeated = await f.api('create-session', { method: 'POST', body })
  assert.equal(repeated.status, 200); assert.deepEqual(repeated.body, first.body)
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1)
  assert.deepEqual(f.calls.filter(call => call[0] === 'resolveAgent'), [['resolveAgent', first.body.nativeSessionId]])
  f.sessions.clear()
  const changed = await f.api('create-session', { method: 'POST', body: { ...body, cwd: 'C:/other' } })
  assert.equal(changed.status, 422)
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1)
})

test('an unavailable Maintenance lookup must not fall through to creating a session', async t => {
  const f = await fixture(t)
  f.graph.resolve = async () => { throw new Error('Synthetic Engine is unavailable') }
  const response = await f.api('create-session', { method: 'POST', body: { operationId: 'must-not-create', cwd: 'C:/synthetic' } })
  assert.equal(response.status, 409)
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 0)
})

test('a cold session whose native file cannot be restored is not replaced with an empty session', async t => {
  const f = await fixture(t)
  const body = { operationId: 'unavailable-native', cwd: 'C:/synthetic' }
  assert.equal((await f.api('create-session', { method: 'POST', body })).status, 200)
  f.sessions.clear()
  f.ctx.sessionController.resolveAgent = async () => { throw new Error('Synthetic native file is unavailable') }
  assert.equal((await f.api('create-session', { method: 'POST', body })).status, 409)
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1)
})

test('Origin, Host and browser cross-site checks run before reading or writing services', async t => {
  const f = await fixture(t)
  for (const headers of [ { origin: 'https://foreign.invalid' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }, { host: '127.0.0.1.attacker.invalid' } ]) {
    assert.equal((await f.api('directory', { headers })).status, 403)
  }
  const write = { method: 'POST', body: { operationId: 'never-created' } }
  assert.equal((await f.api('create-session', { ...write, origin: false })).status, 403)
  assert.equal((await f.api('create-session', { ...write, headers: { origin: 'file:///synthetic' } })).status, 403)
  assert.deepEqual(f.calls, [])
  assert.equal((await f.send('/thoughtdag', { headers: { host: 'foreign.invalid' } })).status, 403)
})

test('request and successful response byte limits prevent unbounded graph payloads', async t => {
  const f = await fixture(t)
  assert.equal((await f.api('save', { method: 'POST', body: { pad: 'x'.repeat(LIMIT) } })).status, 413)
  assert.equal((await f.api('save', { method: 'POST', body: { pad: '文'.repeat(Math.ceil(LIMIT / 3)) } })).status, 413)
  assert.deepEqual(f.calls, [])
  f.graph.preview = async () => ({ text: 'x'.repeat(LIMIT) })
  const tooLarge = await f.api('preview?logicalSessionId=logical')
  assert.equal(tooLarge.status, 413)
  assert.ok(Buffer.byteLength(tooLarge.text) < 1024)
})

test('service failures cannot bypass the response byte limit', async t => {
  const f = await fixture(t)
  f.graph.directory = async () => { throw new Error('synthetic failure ' + '文'.repeat(LIMIT)) }
  const response = await f.api('directory')
  assert.ok(response.status >= 400)
  assert.ok(Buffer.byteLength(response.text) <= LIMIT)
})

test('service failure details redact credential query values before returning them to the browser', async t => {
  const f = await fixture(t)
  f.graph.directory = async () => { throw new Error('Synthetic service rejected http://127.0.0.1/path?token=synthetic-private-token&after=page') }
  const response = await f.api('directory')
  assert.ok(response.status >= 400)
  assert.doesNotMatch(response.text, /synthetic-private-token/)
})

test('unsupported content types, invalid JSON, and unknown managed routes return actionable errors', async t => {
  const f = await fixture(t)
  assert.equal((await f.api('save', { method: 'POST', body: '{}', headers: { 'content-type': 'text/plain' } })).status, 415)
  assert.equal((await f.api('save', { method: 'POST', body: '{' })).status, 422)
  assert.equal((await f.api('save', { method: 'POST', body: '[]' })).status, 422)
  assert.equal((await f.api('does-not-exist')).status, 404)
  assert.deepEqual(f.calls, [])
})
