import type { ManagedGraph } from './model'

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

// Only layout edits can win a refresh. Membership and reference permissions come
// from the latest server document, including removals made in another panel.
export function reconcileGraph(base: ManagedGraph, local: ManagedGraph, remote: ManagedGraph): ManagedGraph {
  const baseNodes = new Map(base.nodes.map(node => [node.id, node]))
  const localNodes = new Map(local.nodes.map(node => [node.id, node]))
  const nodes = remote.nodes.map(node => {
    const before = baseNodes.get(node.id), edited = localNodes.get(node.id)
    if (!before || !edited) return node
    return {
      ...node,
      position: equal(before.position, edited.position) ? node.position : edited.position,
      data: { ...node.data, ...(node.data.kind !== 'session' && before.data.label !== edited.data.label ? { label: edited.data.label } : {}) },
    }
  })
  const ids = new Set(nodes.map(node => node.id))
  for (const node of local.nodes) if (!baseNodes.has(node.id) && !ids.has(node.id)) { nodes.push(node); ids.add(node.id) }
  const baseEdges = new Set(base.edges.map(edge => edge.id))
  const remoteEdges = new Set(remote.edges.map(edge => edge.id))
  const removedRelationIds = [...new Set([...(local.removedRelationIds ?? []), ...(remote.removedRelationIds ?? [])])]
  const edges = [...remote.edges, ...local.edges.filter(edge => edge.data.kind === 'pending' && !edge.data.relationId && !baseEdges.has(edge.id) && !remoteEdges.has(edge.id))]
    .filter(edge => ids.has(edge.source) && ids.has(edge.target) && (!edge.data.relationId || (!removedRelationIds.includes(edge.data.relationId) && edge.data.state !== 'revoked')))
  return { ...remote, nodes, edges, ...(equal(base.viewport, local.viewport) ? {} : { viewport: local.viewport }), ...(removedRelationIds.length ? { removedRelationIds } : {}) }
}

export function layoutDraft(graph: ManagedGraph): ManagedGraph {
  return { managedSchema: 2, ownerSessionId: null, nodes: graph.nodes, edges: graph.edges.filter(edge => edge.data.kind === 'pending' && !edge.data.relationId), ...(graph.viewport ? { viewport: graph.viewport } : {}) }
}

export function graphReferenceIds(graph: ManagedGraph, logicalSessionId: string): string[] {
  if (graph.archivedAt) throw new Error('此主干会话已归档，请先在会话列表恢复后再开始。')
  const targets = new Set(graph.nodes.filter(node => node.data.logicalSessionId === logicalSessionId).map(node => node.id))
  return [...new Set(graph.edges.filter(edge => targets.has(edge.target) && edge.data.namespace === 'annotation-upstream' && edge.data.relationId && edge.data.state !== 'revoked' && !graph.removedRelationIds?.includes(edge.data.relationId)).map(edge => edge.data.relationId!))].sort()
}
