import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { apply, inject } from '../lib/managed-entry.js'

const LIMIT = 512 * 1024

async function fixture(t, options = {}) {
  const calls = [], routes = [], sessions = new Map(), persisted = new Map(), disposers = []
  const graph = {
    protocolVersion: 2,
    directory: async (...args) => { calls.push(['directory', ...args]); return { items: [], nextCursor: null } },
    resolve: async input => {
      calls.push(['resolve', input])
      if (input.nativeSessionId?.startsWith('td-') && !persisted.has(input.nativeSessionId))
        throw Object.assign(new Error('Synthetic native session not found'), { code: 'GRAPH_SESSION_NOT_FOUND' })
      return { logicalSessionId: 'logical-fixture', nativeSessionId: input.nativeSessionId ?? 'native-fixture' }
    },
    preview: async (...args) => { calls.push(['preview', ...args]); return { items: [], nextCursor: null } },
    relations: async (...args) => { calls.push(['relations', ...args]); return { items: [], nextCursor: null } },
    ensure: async (...args) => { calls.push(['ensure', ...args]); return { objectId: 'main-fixture', graph: { managedSchema: 2, ownerSessionId: args[0], nodes: [], edges: [] }, revision: 1 } },
    load: async (...args) => { calls.push(['load', ...args]); return { objectId: args[0], revision: 1 } },
    save: async (...args) => { calls.push(['graph-save', ...args]); return { objectId: 'draft-fixture', revision: 1 } },
    bind: async (...args) => { calls.push(['bind', ...args]); return { reused: true } },
    remove: async (...args) => { calls.push(['remove', ...args]); return { revision: 2 } },
    disclosures: async (...args) => { calls.push(['disclosures', ...args]); return { items: [], nextCursor: null } },
    created: async nativeSessionId => { calls.push(['created', nativeSessionId]); return { logicalSessionId: 'logical-' + nativeSessionId, nativeSessionId } },
  }
  const bridge = {
    credential: 'synthetic-secret-must-not-be-exposed',
    list: async (...args) => { calls.push(['list', ...args]); return { items: [], nextCursor: null } },
    get: async (...args) => { calls.push(['get', ...args]); return null },
    save: async (...args) => { calls.push(['save', ...args]); return { objectId: args[1], revision: args[2] + 1 } },
  }
  const services = {
    maintenanceKnowledge: { dispatch: async (...args) => { calls.push(['knowledge', ...args]); return { items: [], nextCursor: null } } }, maintenanceGraph: graph, maintenanceExtensionData: { bridge }, maintenanceSessionContext: { protocolVersion: 1 },
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

test('v2 capability gate and graph scope do not expose credentials', async t => {
  const f = await fixture(t), response = await f.api('status')
  assert.equal(response.status, 200); assert.equal(response.body.protocolVersion, 2); assert.equal(response.body.capabilities.mainGraph, true)
  assert.doesNotMatch(response.text, /synthetic-secret/)
  f.graph.protocolVersion = 1
  assert.equal((await f.api('status')).body.capabilities.mainGraph, false)
  assert.equal((await f.api('save', { method: 'POST', body: {} })).status, 503)
})

test('native context bridge is capability gated and always uses the user-scoped host entry', async t => {
  const f = await fixture(t)
  assert.equal((await f.api('status')).body.capabilities.nativeContext, false)
  const body = { nativeSessionId: 'current-native', operation: 'source-set', input: { referenceId: 'reference', enabled: false, expectedRevision: 2, operationId: 'pause-once' } }
  assert.equal((await f.api('native-context', { method: 'POST', body })).status, 503)
  f.services.maintenanceNativeContext = { protocolVersion: 1, requestAsUser: async (...args) => { f.calls.push(['context-user', ...args]); return { schemaVersion: 1 } } }
  assert.equal((await f.api('status')).body.capabilities.nativeContext, true)
  assert.equal((await f.api('native-context', { method: 'POST', body })).status, 200)
  assert.deepEqual(f.calls.at(-1), ['context-user', 'current-native', 'source-set', body.input])
  for (const key of ['actor', 'runId', 'profileId', 'instanceId', 'ownerSessionId', 'targetSessionId', 'targetNativeSessionId', 'executionId']) {
    assert.equal((await f.api('native-context', { method: 'POST', body: { ...body, input: { ...body.input, [key]: 'forged' } } })).status, 422)
  }
  assert.equal((await f.api('native-context', { method: 'POST', body: { ...body, operation: 'save-any-graph' } })).status, 422)
  assert.equal((await f.api('native-context', { method: 'POST', body, origin: false })).status, 403)
  f.services.maintenanceNativeContext.requestAsUser = async () => { throw Object.assign(new Error('unconfirmed native response'), { status: 503 }) }
  assert.equal((await f.api('native-context', { method: 'POST', body })).status, 503)
  f.services.maintenanceNativeContext.requestAsUser = async () => { throw new TypeError('network unavailable') }
  assert.equal((await f.api('native-context', { method: 'POST', body })).status, 503)
})
test('only target-scoped relations and separate disclosure paging are exposed', async t => {
  const f = await fixture(t)
  assert.equal((await f.api('relations')).status, 422)
  assert.equal((await f.api('relations?logicalSessionId=target&after=p')).status, 200)
  assert.deepEqual(f.calls.at(-1), ['relations', 'target', 'p'])
  await f.api('disclosures?objectId=main-target&after=cursor')
  assert.deepEqual(f.calls.at(-1), ['disclosures', 'main-target', 'cursor'])
})
test('canvas directory excludes disclosure objects without losing cursor', async t => {
  const f = await fixture(t)
  f.bridge.list = async () => ({ items: [{ objectId: 'disclosures-a' }, { objectId: 'main-a' }], nextCursor: 'next' })
  assert.deepEqual((await f.api('canvases')).body, { items: [{ objectId: 'main-a' }], nextCursor: 'next' })
  await f.api('canvas?objectId=main-a&namespace=annotation&profileId=forged')
  assert.deepEqual(f.calls.at(-1), ['load', 'main-a'])
})
test('save bind and remove use the main graph domain instead of extension write bypass', async t => {
  const f = await fixture(t), body = { managedSchema: 2, ownerSessionId: null, nodes: [], edges: [] }
  await f.api('save', { method: 'POST', body: { expectedRevision: 0, graph: body, title: 'Draft', profileId: 'forged' } })
  assert.deepEqual(f.calls.at(-1), ['graph-save', { expectedRevision: 0, graph: body, title: 'Draft' }])
  await f.api('bind', { method: 'POST', body: { objectId: 'draft', expectedRevision: 1, logicalSessionId: 'target' } })
  assert.deepEqual(f.calls.at(-1), ['bind', { objectId: 'draft', expectedRevision: 1, logicalSessionId: 'target' }])
  await f.api('remove', { method: 'POST', body: { objectId: 'main', expectedRevision: 2, nodeIds: ['a', 'a'], edgeIds: ['e'], operationId: 'remove-once' } })
  assert.deepEqual(f.calls.at(-1), ['remove', { objectId: 'main', expectedRevision: 2, operationId: 'remove-once', nodeIds: ['a'], edgeIds: ['e'] }])
  assert.equal(f.calls.some(call => call[0] === 'save'), false)
})
test('creation requires a chosen registered workspace and uses shared official creator', async t => {
  const f = await fixture(t)
  assert.equal((await f.api('create-session', { method: 'POST', body: { operationId: 'blank', cwd: 'C:/forged' } })).status, 422)
  assert.equal((await f.api('create-session', { method: 'POST', body: { operationId: 'blank', workspaceId: 'workspace', cwd: 'C:/ignored' } })).status, 200)
  assert.deepEqual(f.calls.at(-1), ['knowledge', 'create-session', { operationId: 'blank', workspaceId: 'workspace' }])
  await f.api('create-workspaces?after=page')
  assert.deepEqual(f.calls.at(-1), ['knowledge', 'create-workspaces', { after: 'page' }])
})
test('preview preserves immutable bounds and rejects malformed cursors', async t => {
  const f = await fixture(t)
  await f.api('preview?logicalSessionId=source&sourceVersionId=v1&sourceAnchorId=answer')
  assert.deepEqual(f.calls.at(-1), ['preview', 'source', undefined, { sourceVersionId: 'v1', sourceAnchorId: 'answer' }])
  assert.equal((await f.api('preview?logicalSessionId=source&sourceVersionId=v1')).status, 422)
  assert.equal((await f.api('preview?logicalSessionId=source&cursor=' + 'a'.repeat(4097))).status, 422)
})
test('untrusted origin cannot mutate or read scoped services', async t => {
  const f = await fixture(t)
  for (const headers of [{ origin: 'https://foreign.invalid' }, { 'sec-fetch-site': 'cross-site' }, { origin: 'null' }]) assert.equal((await f.api('directory', { headers })).status, 403)
  assert.equal((await f.api('ensure', { method: 'POST', body: { logicalSessionId: 'target' }, origin: false })).status, 403)
  assert.deepEqual(f.calls, [])
})
test('bounded requests and errors cannot leak secrets or bypass response limits', async t => {
  const f = await fixture(t)
  assert.equal((await f.api('save', { method: 'POST', body: { pad: 'x'.repeat(LIMIT) } })).status, 413)
  f.graph.directory = async () => { throw new Error('token=synthetic-private-token ' + 'x'.repeat(LIMIT)) }
  const error = await f.api('directory'); assert.doesNotMatch(error.text, /synthetic-private-token/); assert.ok(Buffer.byteLength(error.text) < 10000)
  f.graph.preview = async () => ({ text: 'x'.repeat(LIMIT) })
  assert.equal((await f.api('preview?logicalSessionId=source')).status, 413)
})
test('retired independent executor and review entry points remain unavailable', async t => {
  const f = await fixture(t)
  for (const path of ['/inject', '/stream', '/chat']) assert.equal((await f.send('/thoughtdag/api' + path, { method: 'POST', body: {} })).status, 410)
  assert.equal((await f.api('review-source', { method: 'POST', body: {} })).status, 404)
})
