import test from 'node:test'
import assert from 'node:assert/strict'
import { addPlaceholder, addSessionNode, acceptCanvasBody, arrangeBySources, bindPlaceholder, connectPending, createActionGuard, EMPTY_GRAPH, importRelations, nodePrimaryAction, relationPresentation } from './model.ts'
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
test('explicit import is target scoped, accepts authoritative drafts and never revives tombstones', () => {
  const first = importRelations({ ...sessions(), removedRelationIds: ['removed'] }, [relation, { ...relation, referenceId: 'removed' }, { ...relation, referenceId: 'revoked', state: 'revoked' }, { ...relation, referenceId: 'other-owner', targetSessionId: 'a' }, { ...relation, referenceId: 'draft', state: 'pending' }])
  assert.deepEqual(first.edges.map(edge => edge.data.relationId), ['ref-1', 'draft'])
  assert.equal(importRelations(first, [relation]).edges.length, 2)
  assert.equal(importRelations(first, [{ ...relation, state: 'revoked' }]).edges.some(edge => edge.data.relationId === relation.referenceId), false)
})
test('session stickers start their real session while notes retain object navigation', () => {
  assert.deepEqual(nodePrimaryAction({ kind: 'sticker', logicalSessionId: 'a', namespace: 'stickers', objectId: 'sticker', label: 'S' }), { operation: 'open-session', logicalSessionId: 'a' })
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
