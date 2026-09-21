// Managed DSH entry. The standalone app retains the upstream execution model.
// This entry serves the canvas and delegates to instance-bound services.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createManagedGraph } from './managed-graph.js'

export const name = 'thoughtdag'
export const inject = ['webServer', 'sessions', 'sessionController', 'annotationCoreHost', 'sessionExtensionData', 'sessionReferenceContext', 'systemPrompt']
const root = fileURLToPath(new URL('../', import.meta.url))
const appDir = resolve(root, 'dist-app')
const version = createRequire(import.meta.url)('../package.json').version
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
}
function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}
export async function apply(ctx, config = {}) {
  if (config.mountPrefix !== undefined && config.mountPrefix !== '/thoughtdag') throw new Error('此构建的画布入口固定为 /thoughtdag')
  const prefix = '/thoughtdag'
  const trustedHosts = new Set(['localhost', '127.0.0.1', ...(config.trustedHosts ?? [])].map(h => String(h).trim().toLowerCase()))
  const allowed = req => trustedHosts.has(String(req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase())
  const managed = createManagedGraph(ctx)
  const api = async (req, res) => {
    if (!allowed(req)) return json(res, 403, { error: 'untrusted Host header' })
    const url = new URL(req.url ?? '/', 'http://dsh.local')
    const path = url.pathname.slice((prefix + '/api').length)
    if (path.startsWith('/managed/')) return managed(req, res, path, url)
    if (path === '/version' && req.method === 'GET') return json(res, 200, { version, mode: 'local' })
    return json(res, 410, { error: '请使用会话图入口；此实例通过统一引用接口读取上下文' })
  }
  const serve = async (req, res) => {
    if (!allowed(req)) return json(res, 403, { error: 'untrusted Host header' })
    const url = new URL(req.url ?? '/', 'http://dsh.local')
    let rel
    try { rel = decodeURIComponent(url.pathname.slice(prefix.length)).replace(/^\/+/, '') || 'index.html' }
    catch { return json(res, 400, { error: 'invalid asset path' }) }
    const file = resolve(appDir, rel)
    if (file !== appDir && !file.startsWith(appDir + sep)) return json(res, 403, { error: 'forbidden' })
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': mime[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'x-content-type-options': 'nosniff', 'cache-control': rel === 'index.html' ? 'no-store' : 'public, max-age=3600' })
      res.end(body)
    } catch { json(res, 404, { error: 'asset not found' }) }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: prefix, handler: (req, res) => {
    if (!allowed(req)) return json(res, 403, { error: 'untrusted Host header' })
    res.writeHead(302, { location: prefix + '/' }); res.end()
  } }), 'thoughtdag: redirect')
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix + '/api', handler: api }), 'thoughtdag: api')
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler: serve }), 'thoughtdag: static')
  applyUpstreamContext(ctx)
  ctx.logger.info('[dsh-thoughtdag] Session canvas mounted at ' + prefix + '/')
}

/**
 * Tell the current session which upstream branches its graph declares.
 *
 * A binding is topology, not material: it authorizes no read, carries no
 * document and is deliberately absent from the reference context message. That
 * left the model with no way to know its own upstream at all, so the graph
 * reports its shape here instead.
 *
 * This goes through the prompt's dynamic context, which is evaluated per
 * assembly and contributes nothing when empty: sessions without bindings pay no
 * tokens, and no read or reference is created by being mentioned. `list()` is
 * synchronous, so the provider needs no I/O.
 */
function applyUpstreamContext(ctx) {
  const prompt = (() => { try { return ctx.get('systemPrompt') } catch { return undefined } })()
  const data = (() => { try { return ctx.get('sessionExtensionData') } catch { return undefined } })()
  if (!prompt?.context || !data?.list) return
  ctx.effect(() => prompt.context({
    name: 'thoughtdag:upstream-branches',
    order: 10,
    text: assembly => upstreamNotice(data, assembly?.agent?.session?.id),
  }), 'thoughtdag: upstream notice')
}

/** The notice text for one session, or '' when the session declares no branch. */
export function upstreamNotice(data, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return ''
  const objectId = `graph-${createHash('sha256').update(sessionId).digest('hex')}`
  const object = data.list('thoughtdag').find(value => value.objectId === objectId && !value.deleted)
  const graph = object?.content?.graph
  if (!graph || graph.ownerSessionId !== sessionId) return ''
  const label = id => graph.nodes.find(node => node.id === id)?.data?.label
  const bound = graph.edges.filter(edge => edge.data?.kind === 'bound' && !edge.data?.relationId)
  const delivered = graph.edges.filter(edge => edge.data?.kind === 'upstream' && edge.data?.relationId)
  if (!bound.length && !delivered.length) return ''
  const lines = []
  if (bound.length) lines.push(...bound.map(edge => `- ${label(edge.source) ?? edge.source} → 本会话（上游绑定，尚未读取任何内容）`))
  if (delivered.length) lines.push(...delivered.map(edge => `- ${label(edge.source) ?? edge.source} → 本会话（已有固定来源引用）`))
  return [
    '<dsh-thoughtdag-upstream>',
    '思维图声明的上游支流（当前会话作为接收方）：',
    ...lines,
    '这是拓扑信息，不是内容授权：绑定本身未读取、也未注入任何上游正文，不要声称读过它们。',
    '若需要上游内容，请按用户要求或参考资料走正常的引用流程；不要因为看到支流就自行展开读取。',
    '</dsh-thoughtdag-upstream>',
  ].join('\n')
}
