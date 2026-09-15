import test from 'node:test'
import assert from 'node:assert/strict'
import { graphReferenceIds, layoutDraft, reconcileGraph } from './sync.ts'

const node = (id, y) => ({ id, position: { x: 40, y }, data: { kind: 'session', label: id, logicalSessionId: id } })
const edge = (id, source = 'source') => ({ id, source, target: 'owner', data: { kind: 'upstream', namespace: 'annotation-upstream', relationId: id, state: 'sent', sourceVersionId: 'fixed-v1', cutoffEventId: 'reply-1' } })
const base = () => ({ managedSchema: 2, ownerSessionId: 'owner', nodes: [node('source', 40), node('owner', 300)], edges: [edge('reference')] })

test('remote revoke preserves unsaved position while the session name follows current metadata', () => {
  const before = base(), local = structuredClone(before)
  local.nodes[1].position = { x: 700, y: 800 }; local.nodes[1].data.label = 'My layout'
  local.viewport = { x: 3, y: 4, zoom: 0.8 }
  const remote = { ...before, nodes: [{ ...before.nodes[1], data: { ...before.nodes[1].data, label: 'Renamed session' } }], edges: [], removedRelationIds: ['reference'] }
  const merged = reconcileGraph(before, local, remote)
  assert.deepEqual(merged.nodes.map(item => item.id), ['owner'])
  assert.deepEqual(merged.nodes[0].position, { x: 700, y: 800 })
  assert.equal(merged.nodes[0].data.label, 'Renamed session')
  assert.deepEqual(merged.viewport, local.viewport)
  assert.deepEqual(merged.edges, [])
  assert.deepEqual(merged.removedRelationIds, ['reference'])
  assert.deepEqual(before, base())
})

test('same source with another reference remains and retains its fixed bounds', () => {
  const before = base(); before.edges.push(edge('kept'))
  const remote = { ...before, edges: [{ ...before.edges[1], data: { ...before.edges[1].data, sourceVersionId: 'fixed-v2', cutoffEventId: 'reply-2' } }], removedRelationIds: ['reference'] }
  const result = reconcileGraph(before, before, remote)
  assert.equal(result.nodes.length, 2)
  assert.deepEqual(graphReferenceIds(result, 'owner'), ['kept'])
  assert.equal(result.edges[0].data.sourceVersionId, 'fixed-v2')
  assert.equal(result.edges[0].data.cutoffEventId, 'reply-2')
})

test('refresh adds authoritative cards without discarding a local empty card or pending connection', () => {
  const before = base(), local = structuredClone(before)
  local.nodes.push({ id: 'blank', position: { x: 40, y: 560 }, data: { kind: 'placeholder', label: 'New' } })
  local.edges.push({ id: 'draft-edge', source: 'owner', target: 'blank', data: { kind: 'pending' } })
  const remote = { ...before, nodes: [...before.nodes, node('new-source', -220)], edges: [...before.edges, edge('new-ref', 'new-source')] }
  const result = reconcileGraph(before, local, remote)
  assert.deepEqual(new Set(result.nodes.map(item => item.id)), new Set(['source', 'owner', 'new-source', 'blank']))
  assert.deepEqual(new Set(result.edges.map(item => item.id)), new Set(['reference', 'new-ref', 'draft-edge']))
})

test('archive preserves local layout, blocks start and can be copied without authority or archive state', () => {
  const before = base(), local = structuredClone(before)
  local.nodes[0].position.x = 600
  const archived = reconcileGraph(before, local, { ...before, archivedAt: '2026-09-15T00:00:00Z', edges: [], removedRelationIds: ['reference'] })
  assert.equal(archived.nodes[0].position.x, 600)
  assert.throws(() => graphReferenceIds(archived, 'owner'), /归档/)
  const draft = layoutDraft(archived)
  assert.equal(draft.ownerSessionId, null)
  assert.equal(draft.archivedAt, undefined)
  assert.deepEqual(draft.edges, [])
  assert.deepEqual(draft.nodes, archived.nodes)
  const restored = reconcileGraph(archived, archived, { ...archived, archivedAt: null })
  assert.deepEqual(graphReferenceIds(restored, 'owner'), [])
  assert.equal(restored.archivedAt, null)
})

test('start references are unique, target scoped and exclude revoked or tombstoned entries', () => {
  const graph = base()
  graph.edges.push(edge('a'), edge('a'), { ...edge('foreign'), target: 'source' }, { ...edge('revoked'), data: { ...edge('revoked').data, state: 'revoked' } }, edge('removed'))
  graph.removedRelationIds = ['removed']
  assert.deepEqual(graphReferenceIds(graph, 'owner'), ['a', 'reference'])
})
