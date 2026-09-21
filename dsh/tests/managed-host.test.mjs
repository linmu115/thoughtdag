import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { apply, inject } from '../lib/managed-entry.js'

const LIMIT = 512 * 1024

async function fixture(t, options = {}) {
  const calls = [], routes = [], sessions = new Map(), persisted = new Map(), disposers = []
  const rows = new Map()
  const data = { protocolVersion: 1, list: namespace => [...rows.values()].filter(row => row.namespace === namespace),
    async ready(namespace, sessionId) { if (options.unavailable) throw new Error('Synthetic replica unavailable'); calls.push(['ready', namespace, sessionId]) },
    async write(input) { const old = rows.get(input.objectId); if ((old?.revision ?? 0) !== input.expectedRevision) throw new Error('revision conflict'); const value = { ...input, revision: input.expectedRevision + 1 }; rows.set(input.objectId, value); calls.push(['write', value]); return value }
  }
  const references = { protocolVersion: 1,
    directory: async (...args) => { calls.push(['directory', ...args]); return { items: [], nextCursor: null } },
    preview: async (...args) => { calls.push(['preview', ...args]); return { items: [], nextCursor: null } },
  }
  const forbidden = new Proxy({}, { get() { throw new Error('DAG touched Maintenance directly') } })
  const services = { sessionExtensionData: data, sessionReferenceContext: references,
    maintenanceGraph: forbidden, maintenanceKnowledge: forbidden, maintenanceExtensionData: forbidden }
  if (options.missing) for (const name of options.missing) delete services[name]
  const ctx = {
    get: key => services[key], sessions, workspaceRegistry: { list: () => [{ id: 'workspace', title: 'Workspace' }], get: id => id === 'workspace' ? { id } : undefined },
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
  return { api, send, ctx, data, calls, routes, sessions, persisted, services, origin }
}

test('Core-only ports work even when incompatible Maintenance services are present', async t => {
  const f = await fixture(t), response = await f.api('status')
  assert.equal(response.status, 200); assert.equal(response.body.mode, 'local'); assert.equal(response.body.capabilities.mainGraph, true)
  const created = await f.api('ensure', { method: 'POST', body: { logicalSessionId: 'owner' } })
  assert.equal(created.status, 200); assert.equal(created.body.graph.ownerSessionId, 'owner')
  assert.equal((await f.api('canvas?objectId=' + created.body.objectId)).body.objectId, created.body.objectId)
})
test('missing or unavailable public ports report mainGraph false and preserve the reason', async t => {
  const absent = await fixture(t, { missing: ['sessionExtensionData'] })
  assert.equal((await absent.api('status')).body.capabilities.mainGraph, false)
  assert.equal((await absent.api('save', { method: 'POST', body: {} })).status, 503)
  const unavailable = await fixture(t, { unavailable: true })
  const status = (await unavailable.api('status')).body
  assert.equal(status.capabilities.mainGraph, false); assert.match(status.reason, /replica unavailable/)
})
test('registered write access pauses graph mutations without blocking existing reads', async t => {
  const f = await fixture(t)
  const first = await f.api('ensure', { method: 'POST', body: { logicalSessionId: 'owner' } })
  f.services.sessionWriteAccess = { assertWritable: async () => { throw new Error('write paused') } }
  assert.match((await f.api('ensure', { method: 'POST', body: { logicalSessionId: 'other' } })).body.error, /write paused/)
  assert.equal((await f.api('canvas?objectId=' + first.body.objectId)).status, 200)
})
test('graph validation and revision checks protect public session storage', async t => {
  const f = await fixture(t), result = await f.api('ensure', { method: 'POST', body: { logicalSessionId: 'owner' } })
  const body = { objectId: result.body.objectId, expectedRevision: 1, graph: result.body.graph }
  assert.equal((await f.api('save', { method: 'POST', body })).status, 200)
  assert.match((await f.api('save', { method: 'POST', body })).body.error, /revision conflict/)
  const forged = { ...body, expectedRevision: 2, graph: { ...body.graph, edges: [{ id: 'x', source: 'missing', target: 'missing', data: { kind: 'pending' } }] } }
  assert.equal((await f.api('save', { method: 'POST', body: forged })).status, 409)
})
test('workspace creation and immutable preview use public host ports', async t => {
  const f = await fixture(t)
  assert.equal((await f.api('create-session', { method: 'POST', body: { operationId: 'blank' } })).status, 422)
  assert.equal((await f.api('create-session', { method: 'POST', body: { operationId: 'blank', workspaceId: 'workspace' } })).status, 200)
  assert.equal(f.calls.some(call => call[0] === 'create'), true)
  assert.equal((await f.api('create-workspaces')).body.items[0].id, 'workspace')
  await f.api('preview?logicalSessionId=source&sourceVersionId=v1&sourceAnchorId=answer')
  assert.deepEqual(f.calls.at(-1), ['preview', 'source', undefined, { sourceVersionId: 'v1', sourceAnchorId: 'answer' }])
  assert.equal((await f.api('preview?logicalSessionId=source&sourceVersionId=v1')).status, 422)
})
test('native context remains optional and cannot override the host identity', async t => {
  const f = await fixture(t), body = { nativeSessionId: 'current', operation: 'status', input: {} }
  assert.equal((await f.api('native-context', { method: 'POST', body })).status, 503)
  f.services.sessionNativeContext = { protocolVersion: 1, requestAsUser: async () => ({ ok: true }) }
  assert.equal((await f.api('native-context', { method: 'POST', body })).status, 200)
  assert.equal((await f.api('native-context', { method: 'POST', body: { ...body, input: { runId: 'forged' } } })).status, 422)
})
test('cross-origin calls and missing origins cannot mutate session graphs', async t => {
  const f = await fixture(t), body = { logicalSessionId: 'owner' }
  assert.equal((await f.api('ensure', { method: 'POST', body, origin: false })).status, 403)
  assert.equal((await f.api('ensure', { method: 'POST', body, headers: { origin: 'https://foreign.invalid' } })).status, 403)
})
