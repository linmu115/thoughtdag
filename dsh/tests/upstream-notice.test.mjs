import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { upstreamNotice } from '../lib/managed-entry.js'
import { createSessionGraph } from '../lib/session-graph.js'

const graphId = sessionId => `graph-${createHash('sha256').update(sessionId).digest('hex')}`

function data(graphs) {
  return {
    list: namespace => graphs.filter(value => value.namespace === namespace && !value.deleted),
  }
}
function graphFor(sessionId, edges, nodes = [{ id: 'session:self', data: { label: '本会话' } }]) {
  return {
    namespace: 'thoughtdag',
    objectId: graphId(sessionId),
    revision: 1,
    content: { title: 'T', graph: { managedSchema: 2, ownerSessionId: sessionId, nodes, edges } },
  }
}

test('a session with no bindings contributes no prompt text', () => {
  const target = 'session-target'
  assert.equal(upstreamNotice(data([]), target), '')
  // A graph that exists but has no branch edge is silent too.
  assert.equal(upstreamNotice(data([graphFor(target, [])]), target), '')
  // A deleted graph, a foreign graph and a missing session id are all silent.
  const deleted = { ...graphFor(target, [{ id: 'bound:a:b', source: 'session:a', target: 'session:self', data: { kind: 'bound' } }]), deleted: true }
  assert.equal(upstreamNotice(data([deleted]), target), '')
  assert.equal(upstreamNotice(data([graphFor(target, [])]), 'other-session'), '')
  assert.equal(upstreamNotice(data([graphFor(target, [])]), undefined), '')
})

test('declared branches are reported as topology, never as read material', () => {
  const target = 'session-target'
  const nodes = [
    { id: 'session:a', data: { label: '上游甲', logicalSessionId: 'session:a' } },
    { id: 'session:self', data: { label: '本会话' } },
  ]
  const graph = graphFor(target, [
    { id: 'bound:session:a:session:self', source: 'session:a', target: 'session:self', data: { kind: 'bound' } },
    { id: 'relation:ref-1', source: 'session:a', target: 'session:self', data: { kind: 'upstream', relationId: 'ref-1' } },
    { id: 'pending:session:a:session:self', source: 'session:a', target: 'session:self', data: { kind: 'pending' } },
  ], nodes)
  const text = upstreamNotice(data([graph]), target)
  assert.match(text, /^<dsh-thoughtdag-upstream>/)
  assert.match(text, /上游甲（session:a） → 本会话（上游绑定：仅拓扑，未读取任何内容）/)
  assert.match(text, /上游甲（session:a） → 本会话（已有固定来源引用）/)
  // The pending edge is a placeholder with no binding, so it must not be announced.
  assert.equal(text.match(/上游甲（session:a） → 本会话/g).length, 2)
  assert.match(text, /拓扑信息，不是内容授权/)
  assert.match(text, /不能凭会话 id 直接读/)
  assert.match(text, /<\/dsh-thoughtdag-upstream>$/)
})

test('an unknown source label falls back to the node id', () => {
  const target = 'session-target'
  const graph = graphFor(target, [
    { id: 'bound:session:gone:session:self', source: 'session:gone', target: 'session:self', data: { kind: 'bound' } },
  ], [{ id: 'session:self', data: { label: '本会话' } }])
  assert.match(upstreamNotice(data([graph]), target), /- session:gone → 本会话/)
})

test('a binding that survived the DAG save path is what the notice reports', async () => {
  // Nothing here is stubbed: validateSessionGraph accepts the graph, the DAG
  // write path stores it, and the notice reads the stored object back.
  const rows = new Map()
  const extensionData = {
    protocolVersion: 1,
    list: namespace => [...rows.values()].filter(row => row.namespace === namespace),
    async write(input) {
      assert.equal(rows.get(input.objectId)?.revision ?? 0, input.expectedRevision)
      const saved = structuredClone({ ...input, revision: input.expectedRevision + 1 })
      rows.set(input.objectId, saved); return saved
    },
  }
  const api = createSessionGraph(extensionData, { protocolVersion: 1 },
    { sessionQuery: { readTitle: async id => ({ title: `标题 ${id}` }) } }).graph
  const upstream = { id: 'session:up', position: { x: 0, y: 0 }, data: { kind: 'material', logicalSessionId: 'session:up',
    sourceVersionId: 'version-1', sourceAnchorId: 'anchor-1', label: '上游研究' } }
  const saved = await api.save({ expectedRevision: 0, title: '上游研究', graph: { managedSchema: 2, ownerSessionId: 'target',
    nodes: [upstream, { id: 'session:target', position: { x: 0, y: 200 }, data: { kind: 'session', logicalSessionId: 'target', label: '本会话' } }],
    edges: [
      { id: 'bound:session:up:session:target', source: 'session:up', target: 'session:target', data: { kind: 'bound' } },
      // A placeholder announces nothing, so the stored graph stays honest.
      { id: 'pending:session:up:session:target', source: 'session:up', target: 'session:target', data: { kind: 'pending' } },
    ] } })
  assert.equal(rows.get(saved.objectId).content.graph.edges.length, 2)
  const text = upstreamNotice(extensionData, 'target')
  assert.match(text, /- 上游研究（session:up） → 本会话（上游绑定：仅拓扑，未读取任何内容）/)
  assert.equal(text.match(/上游研究（session:up） → 本会话/g).length, 1)
  assert.match(text, /拓扑信息，不是内容授权/)
})
