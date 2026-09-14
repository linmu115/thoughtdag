export type NodeKind = 'session' | 'sticker' | 'material' | 'note' | 'placeholder'
export type EdgeKind = 'branch' | 'upstream' | 'knowledge' | 'pending'

export type GraphNodeData = {
  kind: NodeKind
  label: string
  logicalSessionId?: string
  namespace?: string
  objectId?: string
  referenceId?: string
  excerpt?: string
  sourceVersionId?: string
  sourceAnchorId?: string
  creationWorkspaceId?: string
}

export type GraphNode = {
  id: string
  position: { x: number; y: number }
  data: GraphNodeData
}

export type GraphEdge = {
  id: string
  source: string
  target: string
  data: { kind: EdgeKind; relationId?: string; namespace?: string; sourceVersionId?: string; cutoffEventId?: string; sourceAnchorId?: string; state?: 'pending' | 'sent' | 'revoked'; targetMessageId?: string | null }
}

export type ManagedGraph = {
  managedSchema: 2
  ownerSessionId: string | null
  nodes: GraphNode[]
  edges: GraphEdge[]
  viewport?: { x: number; y: number; zoom: number }
  removedRelationIds?: string[]
  legacyEdges?: unknown[]
  migration?: { sourceObjectId: string; status: 'verified' | 'needs-review'; reason?: string }
}

export type UpstreamRelation = {
  namespace: 'annotation-upstream'
  objectId: string
  referenceId: string
  sourceSessionId: string
  targetSessionId: string
  sourceVersionId: string
  cutoffEventId: string
  sourceAnchorId: string
  state: 'pending' | 'sent' | 'revoked'
  targetMessageId: string | null
  revision: number
}

export const EMPTY_GRAPH: ManagedGraph = { managedSchema: 2, ownerSessionId: null, nodes: [], edges: [] }
export const EDGE_LABELS: Record<EdgeKind, string> = { branch: '分支来源', upstream: '上游引用', knowledge: '旧关联 · 未授权', pending: '待绑定连接' }
export const NODE_LABELS: Record<NodeKind, string> = { session: '会话', sticker: '会话贴纸 / 注释', material: '选段材料', note: '笔记引用', placeholder: '空卡片 · 未绑定' }

export function addPlaceholder(graph: ManagedGraph, id: string, position = nextPosition(graph)): ManagedGraph {
  return { ...graph, nodes: [...graph.nodes, { id, position, data: { kind: 'placeholder', label: '新会话' } }] }
}

export function bindPlaceholder(graph: ManagedGraph, nodeId: string, session: { logicalSessionId: string; title: string }): ManagedGraph {
  const existing = graph.nodes.find(node => node.id !== nodeId && node.data.logicalSessionId === session.logicalSessionId && node.data.kind === 'session')
  if (existing) return { ...graph, nodes: graph.nodes.filter(node => node.id !== nodeId), edges: graph.edges.map(edge => ({ ...edge, source: edge.source === nodeId ? existing.id : edge.source, target: edge.target === nodeId ? existing.id : edge.target })).filter(edge => edge.source !== edge.target) }
  return { ...graph, nodes: graph.nodes.map(node => node.id === nodeId ? { ...node, data: { kind: 'session', label: session.title, logicalSessionId: session.logicalSessionId } } : node) }
}

export function addSessionNode(graph: ManagedGraph, session: { logicalSessionId: string; title: string }): ManagedGraph {
  if (graph.nodes.some((node) => node.data.kind === 'session' && node.data.logicalSessionId === session.logicalSessionId)) return graph
  return { ...graph, nodes: [...graph.nodes, { id: `session:${session.logicalSessionId}`, position: nextPosition(graph), data: { kind: 'session', label: session.title, logicalSessionId: session.logicalSessionId } }] }
}

export function nextPosition(graph: ManagedGraph): { x: number; y: number } {
  return { x: (graph.nodes.length % 3) * 300 + 40, y: Math.floor(graph.nodes.length / 3) * 190 + 40 }
}

export function importRelations(graph: ManagedGraph, relations: UpstreamRelation[]): ManagedGraph {
  const removed = new Set(graph.removedRelationIds ?? [])
  const revoked = new Set(relations.filter(relation => relation.state === 'revoked').map(relation => relation.referenceId))
  const edges = graph.edges.filter(edge => !edge.data.relationId || (!removed.has(edge.data.relationId) && !revoked.has(edge.data.relationId)))
  for (const relation of relations) {
    if (relation.state === 'revoked' || relation.targetSessionId !== graph.ownerSessionId || removed.has(relation.referenceId)) continue
    const source = graph.nodes.find((node) => node.data.kind === 'session' && node.data.logicalSessionId === relation.sourceSessionId)
    const target = graph.nodes.find((node) => node.data.kind === 'session' && node.data.logicalSessionId === relation.targetSessionId)
    if (!source || !target || edges.some((edge) => edge.data.namespace === relation.namespace && edge.data.relationId === relation.referenceId)) continue
    edges.push({ id: `relation:${relation.referenceId}`, source: source.id, target: target.id, data: { kind: 'upstream', namespace: relation.namespace, relationId: relation.referenceId } })
  }
  return { ...graph, edges }
}

export function nodePrimaryAction(data: GraphNodeData): { operation: 'open-object'; input: { namespace: string; objectId: string } } | { operation: 'open-session'; logicalSessionId: string } | undefined {
  if ((data.kind === 'session' || data.kind === 'sticker') && data.logicalSessionId) return { operation: 'open-session', logicalSessionId: data.logicalSessionId }
  if ((data.kind === 'note' || data.kind === 'sticker') && data.namespace && data.objectId) return { operation: 'open-object', input: { namespace: data.namespace, objectId: data.objectId } }
  if (data.logicalSessionId) return { operation: 'open-session', logicalSessionId: data.logicalSessionId }
  return undefined
}

export function relationPresentation(edge: GraphEdge, relations: UpstreamRelation[], confirmedDrafts: ReadonlySet<string> = new Set(), confirmedRevoked: ReadonlySet<string> = new Set()): { state: 'knowledge' | 'pending' | 'sent' | 'draft' | 'revoked' | 'unknown'; label: string; muted: boolean; dashed: boolean } {
  if (edge.data.kind === 'pending') return { state: 'pending', label: EDGE_LABELS.pending, muted: true, dashed: true }
  if (edge.data.kind === 'knowledge') return { state: 'knowledge', label: EDGE_LABELS.knowledge, muted: false, dashed: true }
  const referenceId = edge.data.relationId
  const relation = relations.find((item) => item.referenceId === referenceId && item.namespace === edge.data.namespace)
  if (relation?.state === 'revoked' || (referenceId && confirmedRevoked.has(referenceId))) return { state: 'revoked', label: `${EDGE_LABELS[edge.data.kind]} · 已解除`, muted: true, dashed: true }
  if (relation?.state === 'sent') return { state: 'sent', label: `${EDGE_LABELS[edge.data.kind]} · 已提交`, muted: false, dashed: false }
  if (relation?.state === 'pending' || (referenceId && confirmedDrafts.has(referenceId))) return { state: 'draft', label: `${EDGE_LABELS[edge.data.kind]} · 待发送`, muted: false, dashed: true }
  return { state: 'unknown', label: `${EDGE_LABELS[edge.data.kind]} · 待核对`, muted: true, dashed: true }
}

export function createActionGuard() {
  let active = false
  return {
    begin() { if (active) return false; active = true; return true },
    end() { active = false },
    edit(action: () => void) { if (active) return false; action(); return true },
  }
}

export function connectPending(graph: ManagedGraph, source: string, target: string): ManagedGraph {
  if (source === target || !graph.nodes.some((node) => node.id === source) || !graph.nodes.some((node) => node.id === target)) return graph
  const id = `pending:${source}:${target}`
  if (graph.edges.some((edge) => edge.id === id)) return graph
  return { ...graph, edges: [...graph.edges, { id, source, target, data: { kind: 'pending' } }] }
}

export function arrangeBySources(graph: ManagedGraph): ManagedGraph {
  const positions = new Map<string, { x: number; y: number }>()
  const incoming = new Map(graph.nodes.map((node) => [node.id, graph.edges.filter((edge) => edge.target === node.id && edge.data.kind !== 'knowledge').map((edge) => edge.source)]))
  let lane = 0
  const visit = (id: string, path: Set<string>): { x: number; y: number } => {
    const known = positions.get(id)
    if (known) return known
    if (path.has(id)) throw new Error('会话之间存在循环引用，已保留当前布局；可以手动排列这些节点。')
    path.add(id)
    const parents = (incoming.get(id) ?? []).map((parent) => visit(parent, new Set(path)))
    const point = parents.length ? { x: parents[0].x, y: Math.max(...parents.map((parent) => parent.y)) + 200 } : { x: lane++ * 300 + 40, y: 40 }
    while ([...positions.values()].some((value) => value.x === point.x && value.y === point.y)) point.x += 300
    positions.set(id, point)
    return point
  }
  return { ...graph, nodes: graph.nodes.map((node) => ({ ...node, position: visit(node.id, new Set()) })) }
}

export function acceptCanvasBody(value: unknown): ManagedGraph {
  if (!value || typeof value !== 'object') throw new Error('画布数据缺失。')
  const graph = value as ManagedGraph
  if (graph.managedSchema !== 2 || (graph.ownerSessionId !== null && typeof graph.ownerSessionId !== 'string') || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('画布格式不兼容，请更新图谱扩展后重试。')
  const nodeIds = new Set<string>()
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== 'string' || nodeIds.has(node.id) || !node.data || !Object.hasOwn(NODE_LABELS, node.data.kind) || typeof node.data.label !== 'string' || !node.position || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) throw new Error('画布节点格式无效，未覆盖服务器数据。')
    nodeIds.add(node.id)
  }
  for (const edge of graph.edges) {
    if (!edge || typeof edge.id !== 'string' || !nodeIds.has(edge.source) || !nodeIds.has(edge.target) || !edge.data || !Object.hasOwn(EDGE_LABELS, edge.data.kind)) throw new Error('画布连线格式无效，未覆盖服务器数据。')
  }
  return graph
}
