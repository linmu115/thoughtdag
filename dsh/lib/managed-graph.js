import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const NAMESPACE = 'thoughtdag'
const OBJECT_NAMESPACES = new Set(['annotation', 'obsidian-links'])
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
  return { graph: graph?.protocolVersion === 1 ? graph : undefined, bridge }
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
  const creates = new Map()
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
      return { protocolVersion: 1, mode: 'maintenance', capabilities: { storage, sessions,
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
      if (operation === 'relations') return graph.relations(after)
      if (operation === 'canvases') return bridge.list(NAMESPACE, after, 'all')
      if (operation === 'canvas') return bridge.get(NAMESPACE, id(query.get('objectId'), '画布身份'))
      if (operation === 'objects') return bridge.list(objectNamespace(query.get('namespace')), after)
      if (operation === 'object') return bridge.get(objectNamespace(query.get('namespace')), id(query.get('objectId'), '对象身份'))
    }
    if (method === 'POST' && operation === 'save') {
      const objectId = id(input.objectId, '画布身份')
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw invalid('保存版本无效')
      if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 500) throw invalid('画布标题无效')
      if (input.deleted !== undefined && typeof input.deleted !== 'boolean') throw invalid('删除状态无效')
      if (input.body?.managedSchema !== 1 || !Array.isArray(input.body.nodes) || !Array.isArray(input.body.edges)) throw invalid('画布格式不受支持')
      // The Maintenance Adapter owns the strict graph schema. No second transcript.
      const logicalIds = [...new Set(input.body.nodes.map(n => n?.data?.logicalSessionId).filter(v => typeof v === 'string'))]
      if (logicalIds.length > 500) throw invalid('一个画布最多关联 500 个会话')
      return bridge.save(NAMESPACE, objectId, input.expectedRevision,
        { schemaVersion: 1, title: input.title, body: input.body, references: logicalIds.map(logicalSessionId => ({ logicalSessionId })) }, input.deleted ?? false)
    }
    if (method === 'POST' && operation === 'create-session') {
      const operationId = id(input.operationId, '创建操作')
      const cwd = input.cwd === undefined ? undefined : id(input.cwd, '工作目录')
      const signature = JSON.stringify([operationId, cwd ?? null])
      const existing = creates.get(operationId)
      if (existing && existing.signature !== signature) throw invalid('同一次创建操作的工作目录发生了变化')
      if (existing) return existing.task
      if (creates.size >= 128) throw new ManagedGraphError(429, '创建操作较多，请稍后重试')
      // A stable native identity survives a lost HTTP reply or host restart.
      const sessionId = 'td-' + createHash('sha256').update(operationId).digest('hex').slice(0, 32)
      const task = (async () => {
        let existingSession = ctx.sessions.get(sessionId)
        if (!existingSession) {
          try {
            await graph.resolve({ nativeSessionId: sessionId })
            existingSession = (await ctx.sessionController.resolveAgent(sessionId)).session
          } catch (error) {
            if (error?.code !== 'GRAPH_SESSION_NOT_FOUND') throw error
          }
        }
        if (existingSession && cwd) {
          const originalCwd = existingSession.header?.cwd ?? existingSession.header?.meta?.cwd
          if (typeof originalCwd !== 'string' || resolve(originalCwd) !== resolve(cwd)) throw invalid('同一次创建操作的工作目录发生了变化')
        }
        if (!existingSession) await ctx.sessionController.create({ sessionId, ...(cwd ? { cwd } : {}) })
        return graph.created(sessionId)
      })()
      creates.set(operationId, { signature, task })
      try { return await task } finally { creates.delete(operationId) }
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
