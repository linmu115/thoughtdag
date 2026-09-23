
import { createSessionGraph, validateSessionGraph } from './session-graph.js'
const localGraphs = new WeakMap()
const NAMESPACE = 'thoughtdag'
const OBJECT_NAMESPACES = new Set(['annotation', 'obsidian-links'])
const MAX_BYTES = 512 * 1024
const NATIVE_CONTEXT_OPERATIONS = new Set(['status', 'inspect', 'requests', 'user-read', 'window-set', 'source-set', 'pin', 'release', 'graph-edit', 'discover'])

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
  const data = service(ctx, 'sessionExtensionData'), references = service(ctx, 'sessionReferenceContext')
  if (data?.protocolVersion === 1 && references?.protocolVersion === 1) {
    if (!localGraphs.has(ctx)) localGraphs.set(ctx, createSessionGraph(data, references, ctx))
    return localGraphs.get(ctx)
  }
  return { mode: 'local' }
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
  ctx.effect?.(() => () => { localGraphs.delete(ctx) }, 'thoughtdag: graph provider cache')
  let writeAccessSeen = service(ctx, 'sessionWriteAccess') !== undefined
  let writeAccessEpoch = 0
  ctx.inject?.(['sessionWriteAccess'], scope => {
    writeAccessSeen = true
    ++writeAccessEpoch
    scope.effect(() => () => { ++writeAccessEpoch }, 'thoughtdag: write access provider')
  })
  async function assertWritable() {
    const access = service(ctx, 'sessionWriteAccess')
    if (access !== undefined) writeAccessSeen = true
    if (!writeAccessSeen) return
    if (typeof access?.assertWritable !== 'function') throw new ManagedGraphError(503, '会话写入许可服务暂不可用，请等待恢复')
    const epoch = writeAccessEpoch
    await access.assertWritable()
    if (epoch !== writeAccessEpoch || typeof service(ctx, 'sessionWriteAccess')?.assertWritable !== 'function') {
      throw new ManagedGraphError(503, '会话写入许可服务已重新加载，请重试操作')
    }
  }
  async function dispatch(operation, method, query, input) {
    const { graph, bridge, mode = 'local' } = capabilities(ctx)
    if (operation === 'status' && method === 'GET') {
      let storage = false, sessions = false, reason
      try {
        if (!bridge) throw new Error('当前实例尚未接入图数据存储')
        await bridge.list(NAMESPACE)
        storage = true
        if (!graph) throw new Error('当前实例尚未提供会话图接口，请检查 Core 与会话数据服务')
        await graph.directory()
        sessions = true
      } catch (error) { reason = publicError(error) }
      return { protocolVersion: 2, mode, capabilities: { storage, sessions, mainGraph: storage && sessions && !!graph,
        references: sessions && service(ctx, 'sessionReferenceContext')?.protocolVersion === 1,
        nativeContext: service(ctx, 'sessionNativeContext')?.protocolVersion === 1 && typeof service(ctx, 'sessionNativeContext')?.requestAsUser === 'function' }, ...(reason ? { reason } : {}) }
    }
    if (!graph || !bridge) throw new ManagedGraphError(503, '当前实例缺少匹配的会话图接口或存储，请检查 Core 与会话数据服务')
    if (method === 'POST') await assertWritable()
    if (method === 'POST' && operation === 'native-context') {
      const nativeContext = service(ctx, 'sessionNativeContext')
      if (nativeContext?.protocolVersion !== 1 || typeof nativeContext.requestAsUser !== 'function') throw new ManagedGraphError(503, '当前实例尚未接入原生上下文管理，请安装匹配版本')
      if (!NATIVE_CONTEXT_OPERATIONS.has(input.operation)) throw invalid('没有这个上下文操作')
      const payload = input.input ?? {}
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalid('上下文操作参数无效')
      if (['actor', 'runId', 'profileId', 'instanceId', 'ownerSessionId', 'targetSessionId', 'targetNativeSessionId', 'executionId'].some(key => key in payload)) throw invalid('上下文操作不能覆盖当前会话身份')
      try { return await nativeContext.requestAsUser(id(input.nativeSessionId, '当前会话'), input.operation, payload) }
      catch (error) {
        const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status
          : ['AbortError', 'TimeoutError', 'TypeError'].includes(error?.name) ? 503 : 409
        throw new ManagedGraphError(status, publicError(error))
      }
    }
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
        return graph.createWorkspaces(after)
      }
      if (operation === 'canvases') {
        const page = await bridge.list(NAMESPACE, after, 'all')
        return { ...page, items: page.items.filter(item => !item.objectId.startsWith('disclosures-')) }
      }
      if (operation === 'canvas') return graph.load(id(query.get('objectId'), '画布身份'))
      if (operation === 'objects') {
        const namespace = objectNamespace(query.get('namespace'))
        return bridge.list(namespace, after)
      }
      if (operation === 'object') {
        const namespace = objectNamespace(query.get('namespace')), objectId = id(query.get('objectId'), '对象身份')
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
      if (input.graph?.managedSchema !== 2 || !Array.isArray(input.graph.nodes) || !Array.isArray(input.graph.edges)) throw invalid('主干格式不受支持，请升级会话图插件')
      validateSessionGraph(input.graph)
      if (input.title !== undefined && (typeof input.title !== 'string' || input.title.length > 500)) throw invalid('主干标题无效')
      return graph.save({ ...(objectId ? { objectId } : {}), expectedRevision: input.expectedRevision, graph: input.graph, ...(input.title === undefined ? {} : { title: input.title }) })
    }
    if (method === 'POST' && operation === 'ensure') return graph.ensure(id(input.logicalSessionId, '主干会话'))
    if (method === 'POST' && operation === 'create-session') {
      return graph.createSession(id(input.operationId, '创建操作'), id(input.workspaceId, '工作区'))
    }
    if (method === 'POST' && operation === 'create-sticker') {
      const sourceVersionId = optional(input.sourceVersionId, '来源版本')
      return graph.createSticker({
        operationId: id(input.operationId, '创建操作'),
        workspaceId: id(input.workspaceId, '工作区'),
        sourceSessionId: id(input.sourceSessionId, '来源会话'),
        currentSessionId: id(input.currentSessionId, '当前会话'),
        ...(sourceVersionId ? { sourceVersionId } : {}),
      })
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
