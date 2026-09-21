// Managed DSH entry. The standalone app retains the upstream execution model.
// This entry serves the canvas and delegates to instance-bound services.
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createManagedGraph } from './managed-graph.js'

export const name = 'thoughtdag'
export const inject = ['webServer', 'sessions', 'sessionController', 'annotationCoreHost', 'sessionExtensionData', 'sessionReferenceContext']
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
  ctx.logger.info('[dsh-thoughtdag] Session canvas mounted at ' + prefix + '/')
}
