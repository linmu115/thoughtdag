import { createHash } from 'node:crypto'

const namespace = 'thoughtdag'
const identity = value => typeof value === 'string' && value.length > 0 && value.length <= 256
const fail = message => { throw new Error(message) }

/** DAG owns graph validity. The host data port only owns durable revisioned objects. */
export function validateSessionGraph(graph) {
  if (!graph || graph.managedSchema !== 2 || !(graph.ownerSessionId === null || identity(graph.ownerSessionId)) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) fail('图结构格式无效')
  if (graph.nodes.length > 10000 || graph.edges.length > 20000) fail('图结构超过大小限制')
  const nodes = new Map(), edges = new Set(), incoming = new Map(), outgoing = new Map()
  // A bound edge is topology only: it authorizes no read, so it is validated
  // like a placeholder and is excluded from the structural cycle check below.
  const isStructural = edge => edge.data.kind !== 'bound'
  for (const node of graph.nodes) {
    if (!identity(node.id) || nodes.has(node.id) || !Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y) || typeof node.data?.label !== 'string') fail('图节点身份或坐标无效')
    if (!['session', 'material', 'note', 'placeholder'].includes(node.data.kind)) fail('图节点类型无效')
    if (['session', 'material'].includes(node.data.kind) && !identity(node.data.logicalSessionId)) fail('会话节点缺少会话身份')
    if (node.data.kind === 'material' && (!identity(node.data.sourceVersionId) || !identity(node.data.sourceAnchorId))) fail('材料节点缺少固定来源')
    if (node.data.kind === 'note' && (!identity(node.data.namespace) || !identity(node.data.objectId))) fail('扩展节点缺少对象身份')
    nodes.set(node.id, node); incoming.set(node.id, 0); outgoing.set(node.id, [])
  }
  for (const edge of graph.edges) {
    if (!identity(edge.id) || edges.has(edge.id) || !nodes.has(edge.source) || !nodes.has(edge.target) || edge.source === edge.target) fail('图连接身份或端点无效')
    const data = edge.data
    if (!data || !['pending', 'bound', 'upstream', 'branch'].includes(data.kind)) fail('图连接必须表达上下文授权')
    if (data.kind === 'pending' || data.kind === 'bound') {
      if (data.relationId || data.namespace || data.sourceVersionId || data.cutoffEventId || data.state) fail(data.kind === 'bound' ? '上游绑定连接不能声明上下文权限' : '待绑定连接不能声明上下文权限')
    } else if (!identity(data.relationId) || data.namespace !== 'annotation-upstream') fail('上下文连接缺少 Core 引用身份')
    edges.add(edge.id)
    if (isStructural(edge)) { incoming.set(edge.target, incoming.get(edge.target) + 1); outgoing.get(edge.source).push(edge.target) }
  }
  const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id)
  let visited = 0
  while (queue.length) { const id = queue.pop(); visited++; for (const next of outgoing.get(id)) { const count = incoming.get(next) - 1; incoming.set(next, count); if (!count) queue.push(next) } }
  if (visited !== nodes.size) fail('图连接不能形成上下文循环')
  return structuredClone(graph)
}

export function createSessionGraph(data, references, host = {}) {
  if (data?.protocolVersion !== 1 || references?.protocolVersion !== 1) fail('需要 Core 的会话数据和引用接口')
  const graphId = sessionId => `graph-${createHash('sha256').update(sessionId).digest('hex')}`
  const document = object => ({ objectId: object.objectId, revision: object.revision, title: object.content.title, graph: validateSessionGraph(object.content.graph) })
  const find = objectId => data.list(namespace).find(object => object.objectId === objectId && !object.deleted)
  // Core's local reference record carries the selected text but no source
  // transcript, so it cannot be asked where in the reply the excerpt sits. The
  // excerpt alone is enough for the marker list and its actions; it is also the
  // best available anchor key, so the marker is reported at that message with
  // occurrence 0 rather than a fabricated position.
  const relation = object => { const record = object.content; return { namespace: 'annotation-upstream', objectId: object.objectId, revision: object.revision, referenceId: record.referenceId, sourceSessionId: record.sourceNativeSessionId, targetSessionId: record.targetNativeSessionId, sourceVersionId: record.sourceVersionId, sourceAnchorId: record.sourceAnchorId, cutoffEventId: record.cutoffEventId, state: record.state, targetMessageId: record.targetMessageId, ...(typeof record.selectedText === 'string' ? { selectedText: record.selectedText, sourceOccurrence: 0 } : {}) } }
  const page = rows => ({ items: rows, nextCursor: null })
  // SessionRecord deliberately has no title in rc.2. Titles are a separate
  // log-backed projection; never infer them from a directory record or ID.
  async function titles(ids) {
    const query = host.get?.('sessionQuery') ?? host.sessionQuery
    const unique = [...new Set(ids.filter(identity))], result = new Map()
    if (query?.readTitleSnapshots) {
      const rows = await query.readTitleSnapshots(unique)
      for (const row of rows) if (row.status === 'fulfilled' && row.value.title?.title) result.set(row.sessionId, row.value.title.title)
    } else if (query?.readTitle) {
      const rows = await Promise.allSettled(unique.map(id => query.readTitle(id)))
      rows.forEach((row, index) => { if (row.status === 'fulfilled' && row.value?.title) result.set(unique[index], row.value.title) })
    }
    return result
  }
  async function present(value) {
    const names = await titles([value.graph.ownerSessionId, ...value.graph.nodes.filter(node => node.data.kind === 'session').map(node => node.data.logicalSessionId)])
    // Display current names without rewriting stored layouts or bumping revisions.
    return { ...value, title: names.get(value.graph.ownerSessionId) || value.title,
      graph: { ...value.graph, nodes: value.graph.nodes.map(node => node.data.kind === 'session' && names.has(node.data.logicalSessionId)
        ? { ...node, data: { ...node.data, label: names.get(node.data.logicalSessionId) } } : node) } }
  }
  const api = {
    protocolVersion: 2,
    async directory(workspaceId, after) {
      const result = await references.directory(workspaceId, after)
      if (!workspaceId) return result
      const names = await titles(result.items.map(row => row.logicalSessionId ?? row.id))
      return { ...result, items: result.items.map(row => ({ ...row, title: names.get(row.logicalSessionId ?? row.id) || row.title })) }
    },
    async preview(sessionId, cursor, selection) { if (!references.preview) fail('本地会话来源不支持预览'); return references.preview(sessionId, cursor, selection) },
    async resolve(input) {
      const id = input.nativeSessionId ?? input.logicalSessionId
      if (!identity(id)) fail('会话身份无效')
      return { logicalSessionId: id, nativeSessionId: id, title: (await titles([id])).get(id) || id, status: 'active' }
    },
    async load(objectId) { const object = find(objectId); if (!object) fail('会话图不存在'); return present(document(object)) },
    async ensure(sessionId) {
      await data.ready?.(namespace, sessionId)
      const objectId = graphId(sessionId), existing = find(objectId)
      const current = existing ? document(existing) : undefined
      // Repair only the old untouched initial empty document. Later edits,
      // including intentional removal of cards, retain their existing meaning.
      if (current && (current.revision !== 1 || current.graph.nodes.length || current.graph.edges.length || current.graph.archivedAt)) return present(current)
      const owner = await api.resolve({ nativeSessionId: sessionId })
      const graph = current?.graph ?? { managedSchema: 2, ownerSessionId: sessionId, nodes: [], edges: [] }
      return api.save({ objectId, expectedRevision: current?.revision ?? 0, title: owner.title,
        graph: { ...graph, nodes: [{ id: `session:${sessionId}`, position: { x: 40, y: 40 }, data: { kind: 'session', logicalSessionId: sessionId, label: owner.title } }] } })
    },
    async save(input) {
      const graph = validateSessionGraph(input.graph), owner = graph.ownerSessionId
      if (!identity(owner)) fail('请先将图绑定到一个会话，再保存')
      await data.ready?.(namespace, owner)
      const objectId = graphId(owner)
      if (input.objectId && input.objectId !== objectId) fail('图身份与所属会话不一致')
      for (const edge of graph.edges.filter(edge => edge.data.kind !== 'pending' && edge.data.relationId)) {
        const target = graph.nodes.find(node => node.id === edge.target)?.data.logicalSessionId ?? owner
        const source = graph.nodes.find(node => node.id === edge.source)?.data.logicalSessionId
        const described = await references.describe?.(target, edge.data.relationId)
        if (!described || (source && described.sourceNativeSessionId !== source) || described.record.state === 'revoked') fail('图连接未取得匹配的 Core 引用授权')
      }
      const object = await data.write({ sessionId: owner, namespace, objectId, expectedRevision: input.expectedRevision, deleted: false, content: { title: input.title ?? owner, graph } })
      return present(document(object))
    },
    async bind(input) {
      const current = await api.load(input.objectId)
      if (current.graph.ownerSessionId !== input.logicalSessionId) fail('图已经属于另一会话；请打开该会话的图')
      if (current.revision !== input.expectedRevision) fail('图版本已改变，请刷新')
      return current
    },
    async remove(input) {
      const current = await api.load(input.objectId)
      if (current.revision !== input.expectedRevision) fail('图版本已改变，请刷新')
      const removed = new Set(input.nodeIds ?? []), edges = new Set(input.edgeIds ?? [])
      const graph = current.graph, removedEdges = graph.edges.filter(edge => edges.has(edge.id) || removed.has(edge.source) || removed.has(edge.target))
      for (const edge of removedEdges) if (edge.data.relationId) {
        const target = graph.nodes.find(node => node.id === edge.target)?.data.logicalSessionId ?? graph.ownerSessionId
        await references.bind(target, edge.data.relationId, null)
      }
      return api.save({ ...current, expectedRevision: current.revision, graph: { ...graph, nodes: graph.nodes.filter(node => !removed.has(node.id)), edges: graph.edges.filter(edge => !removedEdges.includes(edge)) } })
    },
    async relations(sessionId, after) {
      const rows = data.list('annotation-upstream').filter(object => !object.deleted && (!after || object.objectId > after) && [object.content.sourceNativeSessionId, object.content.targetNativeSessionId].includes(sessionId)).sort((a, b) => a.objectId.localeCompare(b.objectId))
      return { items: rows.slice(0, 50).map(relation), nextCursor: rows.length > 50 ? rows[49].objectId : null }
    },
    async disclosures() { fail('本地会话图尚未提供披露回执目录；不会把缺失记录显示成已核验的空历史') },
    async createWorkspaces(after) {
      const registry = host.get?.('workspaceRegistry') ?? host.workspaceRegistry
      if (!registry?.list) fail('宿主工作区服务尚未就绪')
      const rows = registry.list().map(row => ({ id: String(row.id), title: row.title || row.path })).filter(row => !after || row.id > after).sort((a, b) => a.id.localeCompare(b.id))
      return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null }
    },
    async createSession(operationId, workspaceId) {
      const registry = host.get?.('workspaceRegistry') ?? host.workspaceRegistry
      if (!registry?.get(workspaceId)) fail('工作区已不存在，请重新选择')
      const controller = host.get?.('sessionController') ?? host.sessionController
      if (!controller?.create) fail('宿主会话控制器尚未就绪')
      const sessionId = 'graph-session-' + createHash('sha256').update(JSON.stringify([operationId, workspaceId])).digest('hex').slice(0, 32)
      await controller.create({ sessionId, workspaceId })
      return api.resolve({ nativeSessionId: sessionId })
    },
    /**
     * 会话贴纸 = 一个新会话 + 一条单向拓扑绑定边。没有贴纸对象，也没有命名空间。
     *
     * 新会话开在 `workspaceId`（调用方从当前会话自己算出来，不额外选工作区）；
     * 绑定边落在**新会话自己的图**里，方向为「被选段会话 → 新会话」，因此
     * `upstreamNotice` 会把被选段会话报成新会话的上游支流。被选段会话的图上不
     * 重复存这条边，它的支流由渲染层按反向关系呈现。
     *
     * 绑定是纯拓扑：不带 relationId，不授权任何读取。真正的读取授权来自 Core 的
     * 引用，而那要等用户在新会话里自己发送。
     */
    async createSticker(input) {
      const source = await api.resolve({ nativeSessionId: input.sourceSessionId })
      const current = await api.resolve({ nativeSessionId: input.currentSessionId })
      const target = await api.createSession(input.operationId, input.workspaceId)
      // 先确保新会话的图存在：ensure 会写下它自己的会话卡片并成为图的主干。
      await api.ensure(current.nativeSessionId)
      const targetGraph = await api.ensure(target.nativeSessionId)
      const nodes = [...targetGraph.graph.nodes]
      for (const identity of [source, current]) {
        if (!nodes.some(node => node.data.kind === 'session' && node.data.logicalSessionId === identity.logicalSessionId)) {
          nodes.push({ id: `session:${identity.logicalSessionId}`, position: { x: 40 + 280 * nodes.length, y: 40 }, data: { kind: 'session', logicalSessionId: identity.logicalSessionId, label: identity.title } })
        }
      }
      const sourceNode = `session:${source.logicalSessionId}`, targetNode = `session:${target.logicalSessionId}`
      const edges = targetGraph.graph.edges.some(edge => edge.source === sourceNode && edge.target === targetNode && edge.data.kind === 'bound')
        ? targetGraph.graph.edges
        : [...targetGraph.graph.edges, { id: `bound:${sourceNode}:${targetNode}`, source: sourceNode, target: targetNode, data: { kind: 'bound' } }]
      const saved = await api.save({ objectId: targetGraph.objectId, expectedRevision: targetGraph.revision, title: targetGraph.title, graph: { ...targetGraph.graph, nodes, edges } })
      return { ...target, boundSourceSessionId: source.nativeSessionId, graphObjectId: saved.objectId, boundEdgeId: `bound:${sourceNode}:${targetNode}`, ...(input.sourceVersionId ? { sourceVersionId: input.sourceVersionId } : {}) }
    },
  }
  const extension = object => ({ objectId: object.objectId, revision: object.revision, deleted: object.deleted,
    title: object.content.title ?? object.objectId, scope: { namespace: object.namespace }, schemaVersion: 1,
    content: { schemaVersion: 1, title: object.content.title ?? object.objectId, body: object.namespace === namespace ? object.content.graph : object.content } })
  const bridge = {
    async list(requestedNamespace, after, deleted = 'active') {
      await data.ready?.(requestedNamespace)
      const rows = data.list(requestedNamespace).filter(object => !after || object.objectId > after).filter(object => deleted === 'all' || object.deleted === (deleted === 'deleted')).sort((a, b) => a.objectId.localeCompare(b.objectId))
      return { items: rows.slice(0, 50).map(extension), nextCursor: rows.length > 50 ? rows[49].objectId : null }
    },
    async get(requestedNamespace, objectId) { const object = data.list(requestedNamespace).find(object => object.objectId === objectId); if (!object) fail('会话扩展对象不存在'); return { object: extension(object) } },
  }
  return { graph: api, bridge, mode: 'local' }
}
