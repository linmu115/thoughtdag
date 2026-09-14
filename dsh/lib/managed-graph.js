
const NAMESPACE = 'thoughtdag'
const OBJECT_NAMESPACES = new Set(['annotation', 'obsidian-links', 'stickers'])
const MAX_BYTES = 512 * 1024

export class ManagedGraphError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
const invalid = message => new ManagedGraphError(422, message)
function id(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw invalid(`${name} 无效`)
  return value
}
function optional(value, name) { return value === undefined || value === null ? undefined : id(value, name) }
function service(ctx, name) {
  try { return typeof ctx.get === 'function' ? ctx.get(name) : ctx[name] } catch { return undefined }
}
function capabilities(ctx) {
  const graph = service(ctx, 'maintenanceGraph')
  const bridge = service(ctx, 'maintenanceExtensionData')?.bridge
  return { graph: graph?.protocolVersion === 2 ? graph : undefined, bridge }
}
function bounded(value) {
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES) throw new ManagedGraphError(413, '内容超过单次额度，请分成多个画布或缩小选段')
  return value
}
function objectNamespace(value) {
  if (!OBJECT_NAMESPACES.has(value)) throw invalid('未接入这个扩展数据类型')
  return value
}
function publicError(error) {
  const message = error instanceof Error ? error.message : '会话图暂不可用'
  return message.replace(/(Bearer\s+)[^\s,;]+/gi, '$1[redacted]')
    .replace(/((?:token|secret|password|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s,"';&]+/gi, '$1[redacted]').slice(0, 2048)
}
function safeOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new ManagedGraphError(403, '请求必须来自当前会话窗口')
  const origin = req.headers.origin
  if (origin !== undefined) {
    let parsed
    try { parsed = new URL(origin) } catch { throw new ManagedGraphError(403, '来源无效') }
    if (parsed.host !== req.headers.host || !['http:', 'https:'].includes(parsed.protocol)) throw new ManagedGraphError(403, '请求必须来自当前会话窗口')
  }
  if (req.method === 'POST' && !origin) throw new ManagedGraphError(403, '写入请求缺少当前窗口来源')
}
async function bodyOf(req) {
  if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw new ManagedGraphError(415, '请求需要 JSON 内容')
  const chunks = []; let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > MAX_BYTES) throw new ManagedGraphError(413, '画布超过单次保存额度')
    chunks.push(chunk)
  }
  let value
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw invalid('请求内容无效') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('请求内容无效')
  return value
}

/** Instance-bound bridge. It never accepts Engine credentials, paths or a run ID. */
export function createManagedGraph(ctx) {
  async function dispatch(operation, method, query, input) {
    const { graph, bridge } = capabilities(ctx)
    if (operation === 'status' && method === 'GET') {
      let storage = false, sessions = false, reason
      try {
        if (!bridge) throw new Error('当前实例尚未接入图数据存储')
        await bridge.list(NAMESPACE)
        storage = true
        if (!graph) throw new Error('当前维护插件尚未提供会话图接口，请安装匹配版本')
        await graph.directory()
        sessions = true
      } catch (error) { reason = publicError(error) }
      return { protocolVersion: 2, mode: 'maintenance', capabilities: { storage, sessions, mainGraph: !!graph,
        references: sessions && service(ctx, 'maintenanceSessionContext')?.protocolVersion === 1 }, ...(reason ? { reason } : {}) }
    }
    if (!graph || !bridge) throw new ManagedGraphError(503, '当前实例缺少匹配的会话图接口或存储，请检查维护插件配置')
    const after = optional(query.get('after'), '分页位置')
    if (method === 'GET') {
      if (operation === 'directory') return graph.directory(optional(query.get('workspaceId'), '工作区'), after)
      if (operation === 'resolve') {
        const logicalSessionId = optional(query.get('logicalSessionId'), '会话身份')
        const nativeSessionId = optional(query.get('nativeSessionId'), '原生会话身份')
        if (Boolean(logicalSessionId) === Boolean(nativeSessionId)) throw invalid('需要指定一个会话身份')
        return graph.resolve(logicalSessionId ? { logicalSessionId } : { nativeSessionId })
      }
      if (operation === 'preview') {
        const version = optional(query.get('sourceVersionId'), '来源版本'), anchor = optional(query.get('sourceAnchorId'), '来源回复')
        if (Boolean(version) !== Boolean(anchor)) throw invalid('固定来源需要版本和回复位置')
        const cursor = query.get('cursor') ?? undefined
        if (cursor && cursor.length > 4096) throw invalid('分页位置无效')
        return graph.preview(id(query.get('logicalSessionId'), '会话身份'), cursor,
          version ? { sourceVersionId: version, sourceAnchorId: anchor } : undefined)
      }
      if (operation === 'relations') return graph.relations(id(query.get('logicalSessionId'), '主干会话'), after)
      if (operation === 'disclosures') return graph.disclosures(id(query.get('objectId'), '主干图'), after)
      if (operation === 'create-workspaces') {
        const knowledge = service(ctx, 'maintenanceKnowledge')
        if (!knowledge?.dispatch) throw new ManagedGraphError(503, '当前维护插件尚未提供工作区创建接口')
        return knowledge.dispatch('create-workspaces', after ? { after } : {})
      }
      if (operation === 'canvases') {
        const page = await bridge.list(NAMESPACE, after, 'all')
        return { ...page, items: page.items.filter(item => !item.objectId.startsWith('disclosures-')) }
      }
      if (operation === 'canvas') return graph.load(id(query.get('objectId'), '画布身份'))
      if (operation === 'objects') {
        const namespace = objectNamespace(query.get('namespace'))
        if (namespace === 'stickers') {
          const knowledge = service(ctx, 'maintenanceKnowledge')
          if (!knowledge) throw new ManagedGraphError(503, '请升级知识数据适配器')
          const page = await knowledge.request('list', { namespace, ...(after ? { after } : {}) })
          return { ...page, items: page.items.map(o => ({ objectId: o.objectId, title: o.content.title, revision: o.revision, scope: o.scope, schemaVersion: o.content.schemaVersion, deleted: o.deleted })) }
        }
        return bridge.list(namespace, after)
      }
      if (operation === 'object') {
        const namespace = objectNamespace(query.get('namespace')), objectId = id(query.get('objectId'), '对象身份')
        if (namespace === 'stickers') {
          const knowledge = service(ctx, 'maintenanceKnowledge')
          if (!knowledge) throw new ManagedGraphError(503, '请升级知识数据适配器')
          return { object: await knowledge.request('get', { namespace, objectId }) }
        }
        return bridge.get(namespace, objectId)
      }
    }
    if (method === 'POST' && ['save', 'bind', 'remove'].includes(operation)) {
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw invalid('保存版本无效')
      const objectId = operation === 'save' ? optional(input.objectId, '主干图') : id(input.objectId, '主干图')
      if (operation === 'bind') return graph.bind({ objectId, expectedRevision: input.expectedRevision, logicalSessionId: id(input.logicalSessionId, '主干会话') })
      if (operation === 'remove') {
        const identifiers = (value, label) => {
          if (value === undefined) return []
          if (!Array.isArray(value) || value.length > 500) throw invalid(label + '数量无效')
          return [...new Set(value.map(item => id(item, label)))]
        }
        return graph.remove({ objectId, expectedRevision: input.expectedRevision, operationId: id(input.operationId, '移除操作'), nodeIds: identifiers(input.nodeIds, '卡片'), edgeIds: identifiers(input.edgeIds, '连接') })
      }
      if (input.graph?.managedSchema !== 2 || !Array.isArray(input.graph.nodes) || !Array.isArray(input.graph.edges)) throw invalid('主干格式不受支持，请升级匹配的维护插件')
      if (input.title !== undefined && (typeof input.title !== 'string' || input.title.length > 500)) throw invalid('主干标题无效')
      return graph.save({ ...(objectId ? { objectId } : {}), expectedRevision: input.expectedRevision, graph: input.graph, ...(input.title === undefined ? {} : { title: input.title }) })
    }
    if (method === 'POST' && operation === 'ensure') return graph.ensure(id(input.logicalSessionId, '主干会话'))
    if (method === 'POST' && operation === 'create-session') {
      const knowledge = service(ctx, 'maintenanceKnowledge')
      if (!knowledge?.dispatch) throw new ManagedGraphError(503, '当前维护插件尚未提供工作区创建接口')
      return knowledge.dispatch('create-session', { operationId: id(input.operationId, '创建操作'), workspaceId: id(input.workspaceId, '工作区') })
    }
    throw new ManagedGraphError(404, '没有这个会话图操作')
  }
  return async (req, res, path, url) => {
    try {
      safeOrigin(req)
      const input = req.method === 'POST' ? await bodyOf(req) : undefined
      const result = bounded(await dispatch(path.replace(/^\/managed\//, ''), req.method, url.searchParams, input))
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(result))
    } catch (error) {
      const status = error instanceof ManagedGraphError ? error.status : 409
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ error: publicError(error) }))
    }
  }
}
