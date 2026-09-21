import test from 'node:test'
import assert from 'node:assert/strict'
import { addPlaceholder, addSessionNode, acceptCanvasBody, arrangeBySources, bindPlaceholder, bindUpstream, connectPending, createActionGuard, EDGE_LABELS, EMPTY_GRAPH, importRelations, nodePrimaryAction, relationPresentation, sameEdges } from './model.ts'
const sessions = () => ({ ...addSessionNode(addSessionNode(EMPTY_GRAPH, { logicalSessionId: 'a', title: 'A' }), { logicalSessionId: 'b', title: 'B' }), ownerSessionId: 'b' })
const relation = { namespace: 'annotation-upstream', objectId: 'upstream-1', referenceId: 'ref-1', sourceSessionId: 'a', targetSessionId: 'b', state: 'sent' }
test('empty cards do not create native identities and binding preserves position and pending edges', () => {
  const blank = addPlaceholder(sessions(), 'blank', { x: 300, y: 500 })
  assert.equal(blank.nodes.at(-1).data.logicalSessionId, undefined)
  const pending = connectPending(blank, 'session:a', 'blank')
  assert.deepEqual(pending.edges[0].data, { kind: 'pending' })
  const bound = bindPlaceholder(pending, 'blank', { logicalSessionId: 'c', title: 'C' })
  assert.deepEqual(bound.nodes.at(-1).position, { x: 300, y: 500 })
  assert.equal(bound.edges[0].data.relationId, undefined)
  assert.equal(bound.ownerSessionId, 'b')
})
test('repeated existing session additions reuse one identity', () => {
  const first = sessions(); assert.equal(addSessionNode(first, { logicalSessionId: 'a', title: 'Renamed' }), first)
})

test('default additions follow the lowest card vertically and retain explicit canvas positions', () => {
  const first = addSessionNode(EMPTY_GRAPH, { logicalSessionId: 'a', title: 'A' })
  const second = addPlaceholder(first, 'blank')
  assert.equal(second.nodes[0].position.x, second.nodes[1].position.x)
  assert.ok(second.nodes[1].position.y - second.nodes[0].position.y >= 200)
  const moved = { ...second, nodes: second.nodes.map(node => node.id === 'blank' ? { ...node, position: { x: 957, y: 1234 } } : node) }
  const third = addSessionNode(moved, { logicalSessionId: 'c', title: 'C' })
  assert.deepEqual(third.nodes.slice(0, 2), moved.nodes)
  assert.equal(third.nodes[2].position.x, 957)
  assert.ok(third.nodes[2].position.y > 1234)
  assert.deepEqual(addPlaceholder(third, 'at-pointer', { x: -11, y: 52 }).nodes.at(-1).position, { x: -11, y: 52 })
})

test('imported upstream cards sit above the owner, distribute multiple parents and keep saved layouts', () => {
  const owner = { ...addSessionNode(EMPTY_GRAPH, { logicalSessionId: 'b', title: 'B' }), ownerSessionId: 'b' }
  let graph = addSessionNode(owner, { logicalSessionId: 'a', title: 'A' }, { upstreamOf: 'b' })
  assert.equal(graph.nodes[0].position.x, graph.nodes[1].position.x)
  assert.ok(graph.nodes[1].position.y < graph.nodes[0].position.y)
  const initial = structuredClone(graph.nodes)
  for (const id of ['c', 'd', 'e', 'f']) graph = addSessionNode(graph, { logicalSessionId: id, title: id }, { upstreamOf: 'b' })
  assert.deepEqual(graph.nodes.slice(0, 2), initial)
  const parents = graph.nodes.slice(1)
  assert.ok(parents.every(node => node.position.y < graph.nodes[0].position.y))
  assert.equal(new Set(parents.map(node => node.position.y)).size, 1)
  for (const [index, node] of parents.entries()) for (const other of parents.slice(index + 1)) assert.ok(Math.abs(node.position.x - other.position.x) >= 300)
  const manual = { ...graph, nodes: graph.nodes.map(node => node.data.logicalSessionId === 'a' ? { ...node, position: { x: -71, y: 999 } } : node) }
  assert.equal(addSessionNode(manual, { logicalSessionId: 'a', title: 'A' }, { upstreamOf: 'b' }), manual)
})
test('explicit import is target scoped, accepts authoritative drafts and never revives tombstones', () => {
  const first = importRelations({ ...sessions(), removedRelationIds: ['removed'] }, [relation, { ...relation, referenceId: 'removed' }, { ...relation, referenceId: 'revoked', state: 'revoked' }, { ...relation, referenceId: 'other-owner', targetSessionId: 'a' }, { ...relation, referenceId: 'draft', state: 'pending' }])
  assert.deepEqual(first.edges.map(edge => edge.data.relationId), ['ref-1', 'draft'])
  assert.equal(importRelations(first, [relation]).edges.length, 2)
  assert.equal(importRelations(first, [{ ...relation, state: 'revoked' }]).edges.some(edge => edge.data.relationId === relation.referenceId), false)
})
test('binding an upstream session records topology only and binds a pair once', () => {
  const graph = sessions()
  const bound = bindUpstream(graph, 'session:a', 'session:b')
  assert.equal(bound.edges.length, 1)
  assert.deepEqual(bound.edges[0], { id: 'bound:session:a:session:b', source: 'session:a', target: 'session:b', data: { kind: 'bound' } })
  // No relationId and no namespace: nothing was authorized and nothing will be read.
  assert.equal(bound.edges[0].data.relationId, undefined)
  assert.equal(bound.edges[0].data.namespace, undefined)
  // The same pair binds once, even if the user drags the connection again.
  assert.equal(bindUpstream(bound, 'session:a', 'session:b'), bound)
  // Binding is not a delivery, so it reads as a standing connection.
  assert.deepEqual(relationPresentation(bound.edges[0], []), { state: 'knowledge', label: EDGE_LABELS.bound, muted: false, dashed: true })
  // A binding needs no Core authorization, so importing relations must not drop it.
  assert.equal(importRelations(bound, [relation]).edges.some(edge => edge.id === 'bound:session:a:session:b'), true)
  // Self-connection and unknown endpoints are refused.
  assert.equal(bindUpstream(graph, 'session:a', 'session:a'), graph)
  assert.equal(bindUpstream(graph, 'session:a', 'missing'), graph)
})
test('an authorized relation without an edge is written to the canvas exactly once', () => {
  const drawn = importRelations(sessions(), [relation])
  assert.equal(drawn.edges.length, 1)
  assert.equal(drawn.edges[0].id, `relation:${relation.referenceId}`)
  // Re-importing is stable, so a load must not write the document again.
  assert.equal(sameEdges(drawn.edges, importRelations(drawn, [relation]).edges), true)
  assert.equal(sameEdges(sessions().edges, drawn.edges), false)
  assert.equal(sameEdges(drawn.edges, []), false)
  const relabelled = importRelations(drawn, [{ ...relation, namespace: 'other' }])
  assert.equal(relabelled.edges[0].id, drawn.edges[0].id)
  assert.equal(sameEdges(drawn.edges, relabelled.edges), false)
})
test('session cards open their real session while notes retain object navigation', () => {
  assert.deepEqual(nodePrimaryAction({ kind: 'session', logicalSessionId: 'a', label: 'S' }), { operation: 'open-session', logicalSessionId: 'a' })
  assert.equal(nodePrimaryAction({ kind: 'placeholder', label: 'Blank' }), undefined)
  assert.equal(nodePrimaryAction({ kind: 'note', logicalSessionId: 'a', namespace: 'obsidian-links', objectId: 'note', label: 'Note' }).operation, 'open-object')
})
test('edge presentation distinguishes permissions, drafts, pending binding and revocation', () => {
  const edge = importRelations(sessions(), [relation]).edges[0]
  assert.equal(relationPresentation(edge, []).state, 'unknown')
  assert.equal(relationPresentation(edge, [{ ...relation, state: 'pending' }]).state, 'draft')
  assert.equal(relationPresentation(edge, [relation]).state, 'sent')
  assert.equal(relationPresentation(edge, [{ ...relation, state: 'revoked' }]).muted, true)
  assert.equal(relationPresentation(connectPending(sessions(), 'session:a', 'session:b').edges[0], []).state, 'pending')
})
test('same-tick action lock blocks edits and double execution until completion', () => {
  const guard = createActionGuard(); let calls = 0
  assert.equal(guard.begin(), true); assert.equal(guard.begin(), false); assert.equal(guard.edit(() => calls++), false)
  guard.end(); assert.equal(guard.edit(() => calls++), true); assert.equal(calls, 1)
})
test('old or malformed formats cannot silently become empty graphs', () => {
  assert.throws(() => acceptCanvasBody({ managedSchema: 1, nodes: [], edges: [] }), /不兼容/)
  assert.throws(() => acceptCanvasBody({ ...sessions(), edges: [{ id: 'bad', source: 'missing', target: 'session:a', data: { kind: 'pending' } }] }), /连线/)
  assert.deepEqual(acceptCanvasBody(sessions()), sessions())
})
test('source layout keeps conversation chains vertical and preserves cycles for manual review', () => {
  const graph = arrangeBySources(importRelations(sessions(), [relation]))
  assert.equal(graph.nodes[0].position.x, graph.nodes[1].position.x); assert.ok(graph.nodes[0].position.y < graph.nodes[1].position.y)
  const cycle = { ...graph, edges: [...graph.edges, { id: 'reverse', source: 'session:b', target: 'session:a', data: { kind: 'pending' } }] }
  assert.throws(() => arrangeBySources(cycle), /循环引用/)
})
