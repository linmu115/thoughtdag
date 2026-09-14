import test from 'node:test'
import assert from 'node:assert/strict'
import { addSessionNode, acceptCanvasBody, arrangeBySources, connectKnowledge, createActionGuard, EMPTY_GRAPH, importRelations, nodePrimaryAction, relationPresentation, removePresentation } from './model.ts'

const sessions = () => addSessionNode(addSessionNode(EMPTY_GRAPH, { logicalSessionId: 'a', title: 'A' }), { logicalSessionId: 'b', title: 'B' })
const relation = { namespace: 'annotation-upstream', objectId: 'upstream-1', referenceId: 'ref-1', sourceSessionId: 'a', targetSessionId: 'b', state: 'sent' }

test('several canvases reuse one logical identity without duplicating sessions', () => {
  const first = sessions()
  assert.equal(addSessionNode(first, { logicalSessionId: 'a', title: 'A renamed' }), first)
  assert.equal(first.nodes[0].id, addSessionNode(EMPTY_GRAPH, { logicalSessionId: 'a', title: 'A' }).nodes[0].id)
})

test('imports only existing authoritative active relations with present endpoints', () => {
  const first = importRelations(sessions(), [relation, { ...relation, referenceId: 'revoked', state: 'revoked' }, { ...relation, referenceId: 'missing', sourceSessionId: 'elsewhere' }, { ...relation, referenceId: 'capture-without-core-confirmation', state: 'pending' }])
  assert.equal(first.edges.length, 1)
  assert.equal(first.edges[0].data.relationId, 'ref-1')
  assert.equal(importRelations(first, [relation]).edges.length, 1)
})

test('node primary action opens source notes and annotations even when linked to a session', () => {
  assert.deepEqual(nodePrimaryAction({ kind: 'session', logicalSessionId: 'a', label: 'A' }), { operation: 'open-session', logicalSessionId: 'a' })
  assert.deepEqual(nodePrimaryAction({ kind: 'note', logicalSessionId: 'a', namespace: 'obsidian-links', objectId: 'note', label: 'Note' }), { operation: 'open-object', input: { namespace: 'obsidian-links', objectId: 'note' } })
  assert.deepEqual(nodePrimaryAction({ kind: 'sticker', logicalSessionId: 'a', namespace: 'annotation', objectId: 'set', label: 'Sticker' }), { operation: 'open-object', input: { namespace: 'annotation', objectId: 'set' } })
})

test('line states never turn orphan pending or missing relations into verified context', () => {
  const edge = importRelations(sessions(), [relation]).edges[0]
  assert.equal(relationPresentation(edge, []).state, 'unknown')
  assert.equal(relationPresentation(edge, [{ ...relation, state: 'pending' }]).state, 'unknown')
  assert.equal(relationPresentation(edge, [{ ...relation, state: 'pending' }], new Set(['ref-1'])).state, 'draft')
  assert.equal(relationPresentation(edge, [relation]).state, 'sent')
  const revoked = relationPresentation(edge, [{ ...relation, state: 'revoked' }], new Set(['ref-1']))
  assert.equal(revoked.state, 'revoked')
  assert.equal(revoked.muted, true)
  assert.equal(revoked.dashed, true)
  assert.equal(relationPresentation(edge, [], new Set(['ref-1']), new Set(['ref-1'])).state, 'revoked')
})

test('async action lock prevents edits before a UI rerender and releases after failures', async () => {
  const guard = createActionGuard()
  let graph = sessions()
  let release
  const waiting = new Promise((resolve) => { release = resolve })
  assert.equal(guard.begin(), true)
  const request = (async () => { try { await waiting; throw new Error('request failed') } finally { guard.end() } })()
  assert.equal(guard.edit(() => { graph = removePresentation(graph, ['session:a']) }), false)
  assert.equal(guard.begin(), false)
  assert.equal(graph.nodes.length, 2)
  release()
  await assert.rejects(request, /failed/)
  assert.equal(guard.edit(() => { graph = removePresentation(graph, ['session:a']) }), true)
  assert.equal(graph.nodes.length, 1)
})

test('removing presentation never modifies the underlying relation', () => {
  const graph = importRelations(sessions(), [relation])
  const removed = removePresentation(graph, [], [graph.edges[0].id])
  assert.equal(removed.edges.length, 0)
  assert.equal(relation.state, 'sent')
  assert.equal(importRelations(removed, [relation]).edges.length, 1)
  assert.equal(removePresentation(graph, ['session:a']).edges.length, 0)
})

test('drawing an edge creates knowledge presentation without upstream access', () => {
  const graph = connectKnowledge(sessions(), 'session:a', 'session:b')
  assert.deepEqual(graph.edges[0].data, { kind: 'knowledge' })
  assert.equal(connectKnowledge(graph, 'session:a', 'session:a'), graph)
  assert.equal(connectKnowledge(graph, 'session:a', 'session:b'), graph)
})

test('incompatible graph schemas cannot silently become empty canvases', () => {
  assert.throws(() => acceptCanvasBody({ managedSchema: 2, nodes: [], edges: [] }), /不兼容/)
  assert.throws(() => acceptCanvasBody({ ...sessions(), edges: [{ id: 'bad', source: 'missing', target: 'session:a', data: { kind: 'knowledge' } }] }), /连线/)
  assert.deepEqual(acceptCanvasBody(sessions()), sessions())
})

test('source layout keeps conversation chains vertical and arrows forward', () => {
  const graph = arrangeBySources(importRelations(sessions(), [relation]))
  assert.equal(graph.nodes[0].position.x, graph.nodes[1].position.x)
  assert.ok(graph.nodes[0].position.y < graph.nodes[1].position.y)
})

test('cyclic session references leave manual presentation intact', () => {
  const graph = importRelations(sessions(), [relation, { ...relation, referenceId: 'reverse', sourceSessionId: 'b', targetSessionId: 'a' }])
  const previous = JSON.stringify(graph)
  assert.throws(() => arrangeBySources(graph), /循环引用/)
  assert.equal(JSON.stringify(graph), previous)
})
