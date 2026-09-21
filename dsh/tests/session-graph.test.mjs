import assert from 'node:assert/strict'
import test from 'node:test'
import { createSessionGraph, validateSessionGraph } from '../lib/session-graph.js'

const node = id => ({ id, position: { x: 0, y: 0 }, data: { kind: 'session', logicalSessionId: id, label: id } })
const graph = () => ({ managedSchema: 2, ownerSessionId: 'b', nodes: [node('a'), node('b')], edges: [{ id: 'edge', source: 'a', target: 'b', data: { kind: 'pending' } }] })
// A binding is topology: `bindUpstream` writes `bound:<source>:<target>` with
// `data = { kind: 'bound' }` and no context-authorizing field at all.
const boundEdge = (source, target) => ({ id: `bound:${source}:${target}`, source, target, data: { kind: 'bound' } })

function fixture() {
  const rows = new Map(), writes = []
  const data = { protocolVersion: 1, list: ns => [...rows.values()].filter(row => row.namespace === ns), async write(input) {
    assert.equal(rows.get(input.objectId)?.revision ?? 0, input.expectedRevision)
    const saved = structuredClone({ ...input, revision: input.expectedRevision + 1 })
    rows.set(input.objectId, saved); writes.push(saved); return saved
  } }
  const references = { protocolVersion: 1 }
  const host = { sessionQuery: { readTitle: async id => id === 'b' ? { title: 'Current conversation' } : undefined } }
  return { rows, writes, data, references, host, api: createSessionGraph(data, references, host).graph }
}

test('a new session graph contains its own session card and reopening does not duplicate or rewrite it', async () => {
  const { api, data, references, host, writes } = fixture()
  const first = await api.ensure('b')
  assert.equal(first.title, 'Current conversation')
  assert.deepEqual(first.graph.nodes, [{ id: 'session:b', position: { x: 40, y: 40 }, data: { kind: 'session', logicalSessionId: 'b', label: 'Current conversation' } }])
  assert.deepEqual(first.graph.edges, [])
  assert.deepEqual(await createSessionGraph(data, references, host).graph.ensure('b'), first)
  assert.equal(writes.length, 1)
})

test('repairs the old initial empty graph in place and keeps later intentional edits', async () => {
  const { api, writes } = fixture()
  const empty = await api.save({ expectedRevision: 0, title: 'b', graph: { managedSchema: 2, ownerSessionId: 'b', nodes: [], edges: [] } })
  const repaired = await api.ensure('b')
  assert.equal(repaired.objectId, empty.objectId)
  assert.equal(repaired.revision, 2)
  assert.equal(repaired.graph.nodes[0].data.logicalSessionId, 'b')
  await api.ensure('b'); assert.equal(writes.length, 2)
  const removed = await api.remove({ objectId: repaired.objectId, expectedRevision: 2, nodeIds: ['session:b'] })
  assert.deepEqual(await api.ensure('b'), removed)
  assert.equal(writes.length, 3)
})

test('leaves existing nonempty graphs, layouts and context edges untouched', async () => {
  const { api, writes } = fixture()
  const original = graph(); original.nodes[0].position = { x: -400, y: 300 }; original.viewport = { x: 20, y: 10, zoom: 0.7 }
  const saved = await api.save({ expectedRevision: 0, title: 'existing', graph: original })
  assert.deepEqual(await api.ensure('b'), saved)
  assert.equal(writes.length, 1)
})

test('current titles decorate stored owner and session cards without writes or changing material labels', async () => {
  const { api, host, rows, writes } = fixture()
  const saved = await api.ensure('b')
  const stored = structuredClone(rows.get(saved.objectId))
  host.sessionQuery.readTitleSnapshots = async ids => ids.map(sessionId => ({ sessionId, status: 'fulfilled', value: { title: { title: 'Renamed conversation' } } }))
  host.sessionQuery.listSessions = () => { throw new Error('rc.2 directory records do not contain titles') }
  const renamed = await api.load(saved.objectId)
  assert.equal(renamed.title, 'Renamed conversation')
  assert.equal(renamed.graph.nodes[0].data.label, 'Renamed conversation')
  assert.equal(renamed.revision, saved.revision)
  assert.deepEqual(rows.get(saved.objectId), stored)
  assert.equal(writes.length, 1)
  host.sessionQuery.readTitleSnapshots = async ids => ids.map(sessionId => ({ sessionId, status: 'rejected', reason: new Error('unavailable') }))
  assert.deepEqual(await api.load(saved.objectId), saved)
})

test('directory titles use title projection and leave workspace names alone', async () => {
  const { host, data } = fixture()
  const references = { protocolVersion: 1, directory: async workspace => ({ items: [{ id: workspace ? 'b' : 'workspace', title: workspace ? 'b' : 'Workspace' }], nextCursor: 'next' }) }
  const api = createSessionGraph(data, references, host).graph
  assert.equal((await api.directory()).items[0].title, 'Workspace')
  assert.deepEqual(await api.directory('workspace'), { items: [{ id: 'b', title: 'Current conversation' }], nextCursor: 'next' })
})
test('local creation uses the chosen host workspace and stable retry identity without sending a prompt', async () => {
  const calls = []
  const host = { workspaceRegistry: { list: () => [{ id: 'workspace', path: '/synthetic' }], get: id => id === 'workspace' ? { id } : undefined },
    sessionController: { create: async request => { calls.push(request); return { sessionId: request.sessionId } } } }
  const graph = createSessionGraph({ protocolVersion: 1 }, { protocolVersion: 1 }, host).graph
  assert.equal((await graph.createWorkspaces()).items[0].id, 'workspace')
  const first = await graph.createSession('operation', 'workspace'), retry = await graph.createSession('operation', 'workspace')
  assert.equal(first.nativeSessionId, retry.nativeSessionId)
  assert.deepEqual(calls, [{ sessionId: first.nativeSessionId, workspaceId: 'workspace' }, { sessionId: first.nativeSessionId, workspaceId: 'workspace' }])
  await assert.rejects(graph.createSession('other', 'missing'), /工作区/)
  assert.equal(calls.length, 2)
})
test('DAG rejects cycles, missing nodes and fabricated context authorizations before storage', () => {
  assert.equal(validateSessionGraph(graph()).nodes.length, 2)
  const cycle = graph(); cycle.edges.push({ id: 'back', source: 'b', target: 'a', data: { kind: 'pending' } })
  assert.throws(() => validateSessionGraph(cycle), /循环/)
  const missing = graph(); missing.edges[0].source = 'missing'; assert.throws(() => validateSessionGraph(missing), /端点/)
  const forged = graph(); forged.edges[0].data = { kind: 'upstream' }; assert.throws(() => validateSessionGraph(forged), /引用身份/)
})
test('DAG accepts a topology-only upstream binding and keeps it across a save and reload', async () => {
  const { api, rows, writes } = fixture()
  const original = graph(); original.edges.push(boundEdge('a', 'b'))
  const saved = await api.save({ expectedRevision: 0, title: 'bound', graph: original })
  assert.deepEqual(saved.graph.edges.map(edge => edge.data), [{ kind: 'pending' }, { kind: 'bound' }])
  assert.deepEqual((await api.load(saved.objectId)).graph.edges, original.edges)
  assert.equal(writes.length, 1)
})
test('DAG saves two mutually bound sessions, because a binding is not a structural dependency', async () => {
  const { api, writes } = fixture()
  const mutual = graph(); mutual.edges.push(boundEdge('a', 'b'), boundEdge('b', 'a'))
  assert.deepEqual(validateSessionGraph(mutual).edges.length, 3)
  const saved = await api.save({ expectedRevision: 0, title: 'mutual', graph: mutual })
  assert.equal(saved.graph.edges.filter(edge => edge.data.kind === 'bound').length, 2)
  assert.equal(writes.length, 1)
  // Only bindings are exempt: one real pending and one real upstream cycle remain rejected.
  const pendingCycle = graph(); pendingCycle.edges.push(boundEdge('b', 'a'), { id: 'pending:b:a', source: 'b', target: 'a', data: { kind: 'pending' } })
  assert.throws(() => validateSessionGraph(pendingCycle), /循环/)
  const upstreamCycle = graph(); upstreamCycle.edges.push(
    { id: 'up', source: 'a', target: 'b', data: { kind: 'upstream', relationId: 'ref-1', namespace: 'annotation-upstream' } },
    { id: 'down', source: 'b', target: 'a', data: { kind: 'branch', relationId: 'ref-2', namespace: 'annotation-upstream' } })
  assert.throws(() => validateSessionGraph(upstreamCycle), /循环/)
})
test('DAG rejects a binding that declares any context authority of its own', async () => {
  const { api, writes } = fixture()
  for (const forged of [{ relationId: 'ref-1' }, { namespace: 'annotation-upstream' }, { sourceVersionId: 'version-1' },
    { cutoffEventId: 'event-1' }, { state: 'sent' }]) {
    const candidate = graph(); candidate.edges.push({ ...boundEdge('a', 'b'), data: { kind: 'bound', ...forged } })
    assert.throws(() => validateSessionGraph(candidate), /上游绑定连接不能声明上下文权限/)
  }
  const namespaceOnly = graph(); namespaceOnly.edges.push({ ...boundEdge('a', 'b'), data: { kind: 'bound', namespace: 'annotation-upstream' } })
  await assert.rejects(api.save({ expectedRevision: 0, title: 'forged', graph: namespaceOnly }), /上游绑定连接不能声明上下文权限/)
  assert.equal(writes.length, 0)
  // Authorization-free is not the same as unvalidated: id and endpoints still hold.
  const badEndpoint = graph(); badEndpoint.edges.push(boundEdge('a', 'missing'))
  assert.throws(() => validateSessionGraph(badEndpoint), /端点/)
  const selfLoop = graph(); selfLoop.edges.push(boundEdge('a', 'a'))
  assert.throws(() => validateSessionGraph(selfLoop), /端点/)
})
test('DAG saves and deletes through session data and retains the graph when its UI is recreated', async () => {
  const rows = new Map(), writes = []
  const data = { protocolVersion: 1, list: ns => [...rows.values()].filter(row => row.namespace === ns), async write(input) {
    const old = rows.get(input.objectId); assert.equal(old?.revision ?? 0, input.expectedRevision)
    const value = { ...input, revision: input.expectedRevision + 1 }; writes.push(value); rows.set(input.objectId, structuredClone(value)); return value
  } }
  const references = { protocolVersion: 1, directory: async () => ({ items: [{ id: 'b', title: 'b' }], nextCursor: null }) }
  const first = createSessionGraph(data, references).graph
  const saved = await first.save({ expectedRevision: 0, graph: graph() })
  const reopened = createSessionGraph(data, references).graph
  assert.deepEqual((await reopened.load(saved.objectId)).graph, graph())
  const result = await reopened.remove({ objectId: saved.objectId, expectedRevision: 1, nodeIds: ['a'], edgeIds: [], operationId: 'remove' })
  assert.equal(result.graph.nodes.length, 1); assert.equal(result.graph.edges.length, 0)
  assert.equal(writes.length, 2); assert.equal(writes[1].sessionId, 'b')
})
