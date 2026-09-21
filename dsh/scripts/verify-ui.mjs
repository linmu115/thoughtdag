// Packaged SPA + actual parent shim; all sessions, storage, previews and reference operations are synthetic.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { apply } from '../lib/managed-entry.js'
const output = resolve(process.argv[2] ?? '.local-e2e/main-graph-browser')
await mkdir(output, { recursive: true })
const refs = [], calls = [], routes = [], previews = [], created = new Map()
let headVersion = 'version-1'
const identities = [{ logicalSessionId: 'source', nativeSessionId: 'native-source', title: '来源讨论 X' }, { logicalSessionId: 'target', nativeSessionId: 'native-target', title: '接收会话 Y' }]
const copy = value => JSON.parse(JSON.stringify(value))
// session_extensions / reference_context / workspace_registry / session_controller
// 四个宿主机端口的合成实现：DAG 走的就是它自己那条本地路径（managed-entry.js 的
// createManagedGraph + session-graph.js），没有任何 maintenance 替身。
const sessionData = new Map(), refSeq = new Map()
const sessionExtensions = {
  protocolVersion: 1,
  list: (namespace, sessionId) => [...sessionData.values()].filter(row => row.namespace === namespace && (!sessionId || row.sessionId === sessionId)),
  get: (sessionId, namespace, objectId) => sessionData.get(JSON.stringify([sessionId, namespace, objectId])),
  ready: async () => {},
  write: async input => {
    const key = JSON.stringify([input.sessionId, input.namespace, input.objectId]), old = sessionData.get(key)
    if ((old?.revision ?? 0) !== input.expectedRevision) throw new Error('扩展对象修订冲突')
    const value = { sessionId: input.sessionId, namespace: input.namespace, objectId: input.objectId, revision: (old?.revision ?? 0) + 1, deleted: input.deleted, content: copy(input.content) }
    sessionData.set(key, value); return copy(value)
  },
}
/** Core 本地引用端口的等价形状：capture / describe 写读同一份 annotation-upstream 记录。 */
const sessionReferences = {
  protocolVersion: 1,
  directory: async (workspace, after) => ({ items: workspace ? identities.map(s => ({ id: s.nativeSessionId, title: s.title, logicalSessionId: s.logicalSessionId })) : [{ id: 'work-1', title: '合成测试工作区' }], nextCursor: null }),
  preview: async (logical, cursor, bounds) => {
    previews.push({ logical, cursor, bounds }); const version = bounds?.sourceVersionId ?? cursor?.split(':')[1] ?? headVersion
    return { ...await sessionReferences.resolve({ logicalSessionId: logical }), sourceVersionId: version,
      items: cursor ? [{ eventId: 'answer-1', role: 'assistant', text: '后续解释：已固定的来源继续页。', offset: 40, complete: true }] : [{ eventId: 'question-1', role: 'user', text: '如何减少训练显存？', offset: 0, complete: true }, { eventId: 'answer-1', role: 'assistant', text: '梯度检查点通过增加计算时间换取显存。', offset: 0, complete: false }],
      capture: { sourceSessionId: 'native-source', anchorId: 'answer-1', messageId: 'answer-1', role: 'assistant', occurrence: 0, selectedText: '换取显存' }, nextCursor: cursor ? null : 'page:' + version, hasMore: !cursor }
  },  // 真实 Core 能把任何已存在的会话解析成身份；合成替身也要能，否则宿主「新建会话」
  // 这条无 Maintenance 路径就无从检查。未知身份按幂等方式登记成自己。
  resolve: async input => {
    const key = input.logicalSessionId ?? input.nativeSessionId
    const found = identities.find(s => s.logicalSessionId === key || s.nativeSessionId === key)
    if (found) return copy(found)
    const created = { logicalSessionId: key, nativeSessionId: key, title: key }
    identities.push(created); return copy(created)
  },
  capture: async input => {
    calls.push(['capture', copy(input)])
    const referenceId = 'reference-' + (refSeq.get(input.targetNativeSessionId) ?? 0) + 1
    if (refSeq.get(input.targetNativeSessionId) === undefined) refSeq.set(input.targetNativeSessionId, 1); else refSeq.set(input.targetNativeSessionId, refSeq.get(input.targetNativeSessionId) + 1)
    const record = {
      referenceId, sourceNativeSessionId: input.sourceNativeSessionId, targetNativeSessionId: input.targetNativeSessionId,
      sourceTitle: '来源讨论 X', sourceVersionId: input.expectedSourceVersionId ?? headVersion, cutoffEventId: input.anchorId,
      sourceAnchorId: input.anchorId, selectedText: input.selectedText, state: 'pending', targetMessageId: null,
    }
    await sessionExtensions.write({ sessionId: input.targetNativeSessionId, namespace: 'annotation-upstream', objectId: referenceId, expectedRevision: 0, deleted: false, content: record })
    refs.push({ ...record, namespace: 'annotation-upstream', objectId: referenceId, sourceSessionId: 'source', targetSessionId: 'target' })
    return { ...record, requestDigest: 'digest', entries: [], turnStart: 0 }
  },
  describe: async (target, id) => {
    const stored = sessionData.get(JSON.stringify([target, 'annotation-upstream', id]))
    if (!stored) throw new Error('合成引用不存在')
    return { record: copy(stored.content), sourceNativeSessionId: stored.content.sourceNativeSessionId }
  },
  inspect: async (target, id) => (await sessionReferences.describe(target, id)).record,
  bind: async (target, id, messageId) => { const stored = sessionData.get(JSON.stringify([target, 'annotation-upstream', id])); stored.content = { ...stored.content, state: messageId === null ? 'revoked' : 'sent', targetMessageId: messageId }; return copy(stored.content) },
  status: async (target, id) => { const stored = sessionData.get(JSON.stringify([target, 'annotation-upstream', id])); return { referenceId: id, state: stored.content.state } },
}
const workspaceRegistry = { list: () => [{ id: 'work-1', title: '合成测试工作区', path: 'D:/synthetic-workspace' }, { id: 'work-2', title: '第二页工作区', path: 'D:/synthetic-second' }], get: id => workspaceRegistry.list().find(row => row.id === id) }
const sessionController = { create: async input => { calls.push(['create-session', copy(input)]); const i = identities.length, identity = { logicalSessionId: 'new-' + i, nativeSessionId: 'native-new-' + i, title: '新会话 ' + i }; created.set(input.sessionId, identity); identities.push(identity); return identity } }
const services = {
  sessionExtensionData: sessionExtensions,
  sessionReferenceContext: sessionReferences,
  workspaceRegistry,
  sessionController,
  // 会话标题由宿主的标题投影提供（DAG 从不从目录记录或 id 猜标题）。
  sessionQuery: { readTitleSnapshots: async ids => ids.map(sessionId => {
    const identity = identities.find(row => row.logicalSessionId === sessionId || row.nativeSessionId === sessionId)
    return identity ? { sessionId, status: 'fulfilled', value: { title: { title: identity.title } } } : { sessionId, status: 'rejected', reason: new Error('未知会话') }
  }) },
}
await apply({ get: name => services[name], sessions: new Map(), webServer: { register: route => { routes.push(route); return () => {} } }, effect: fn => fn(), logger: { info() {} } })
const parentHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;font:14px system-ui;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#111)}
:root{--fixture-sidebar:320px;--fixture-header-height:76px}#fixture-layout{height:100vh;display:grid;grid-template-columns:var(--fixture-sidebar) minmax(0,1fr)}
#fixture-nav{border-right:.5px solid #ddd;background:#f8f9fa;padding:24px;overflow:hidden}#fixture-main{min-width:0}
#fixture-header{height:var(--fixture-header-height);padding:10px 20px 0;border-bottom:.5px solid #ddd}
#fixture-title-row{display:flex;align-items:center;gap:10px;min-height:30px}#fixture-title{width:160px;flex-shrink:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#toolbar{width:max-content;flex:none}
#fixture-tabs{margin-top:10px}#fixture-content{padding:24px}textarea{display:block;width:90%;margin-top:24px}
@media(max-width:760px){:root{--fixture-sidebar:0px}#fixture-nav{padding:0;visibility:hidden}#fixture-title{width:100px}}
</style></head><body><div id="fixture-layout"><aside id="fixture-nav">会话工作区</aside><main id="fixture-main"><header id="fixture-header"><div id="fixture-title-row"><span id="fixture-title">来源讨论 X</span><div id="toolbar"></div></div><div id="fixture-tabs">对话　轨迹</div></header><section id="fixture-content">完整会话页<textarea aria-label="合成草稿">保留原有草稿</textarea></section></main></div><script>
window.fixture={selectionActions:{},current:'native-source',draft:'保留原有草稿',attachments:['保留附件'],actions:[]};
const sessions={list:{getSnapshot:()=>({current:fixture.current,byId:{[fixture.current]:{displayTitle:fixture.current,cwd:'D:/synthetic-workspace'}}}),subscribe:fn=>{fixture.onSessionsChanged=fn;return()=>{fixture.onSessionsChanged=null}}},refresh:async()=>{},open:async id=>{fixture.current=id;fixture.actions.push({operation:'open',id})}};
const workspaces={list:{getSnapshot:()=>({items:[{workspaceId:'work-1',title:'合成测试工作区',path:'D:/synthetic-workspace',sessionIds:['native-source','native-target','native-new-2']}]})}};
const core={registerSelectionAction:action=>{fixture.selectionActions[action.id]=action;return()=>delete fixture.selectionActions[action.id]},features:['native-selection-actions-v1','graph-reference-actions-v1','session-main-graph-v2'],prepareGraphReferences:async(target,referenceIds)=>{fixture.actions.push({operation:'prepare',target,referenceIds});return{preparedCount:referenceIds.length}},addCrossSessionReference:async(target,capture,options)=>{const r=await fetch('/fixture/reference',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({target,capture,options})});fixture.current=target;fixture.actions.push({operation:'reference',target,capture});return r.json()},resolveReferenceLink:async(target,referenceId)=>({setId:'set',referenceId,state:'pending'}),deleteReferenceLink:async(target,setId,referenceId)=>{fixture.actions.push({operation:'delete-reference',target,referenceId});return{deleted:true}}};
const react={useState:value=>[value,()=>{}],useEffect:fn=>fn(),createElement:(tag,props,...children)=>{const el=document.createElement(tag);for(const[k,v]of Object.entries(props||{})){if(k==='onClick')el.onclick=v;else if(k==='className')el.className=v;else if(v!==undefined)el.setAttribute(k,v)}for(const c of children.flat())el.append(c instanceof Node?c:String(c));return el}};
window.__ModuleLoader__={load:mod=>mod.factory(()=>react).apply({inject:(deps,fn)=>{if(deps.includes('annotationCore'))fn({get:()=>core,effect:fn=>fn()});return{dispose(){}}},sessions,get:name=>name==='annotationCore'?core:name==='workspaces'?workspaces:undefined,effect:fn=>fn(),slots:{inject:(_name,fn)=>fn(),register:(_meta,C)=>{document.querySelector('#toolbar').append(C());return()=>{}}}})};
</script><script src="/client.js"></script></body></html>`
// DAG 自己的管理端点：直接交给插件真实的 webServer 路由处理，不经过任何替身。
// 冒烟断言要看结果时读 sessionData / calls，而不是读一个假服务端的状态。
const managedThrough = async (operation, input) => {
  const route = routes.find(item => item.kind === 'prefix' && item.path === '/thoughtdag/api')
  assert.ok(route, 'thoughtdag 管理路由尚未注册')
  const body = Buffer.from(JSON.stringify(input))
  const request = { method: 'POST', url: '/thoughtdag/api/managed/' + operation, headers: { host: '127.0.0.1', origin: 'http://127.0.0.1', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, async *[Symbol.asyncIterator]() { yield body } }
  const captured = { status: 0, body: '' }
  const response = { writeHead: status => { captured.status = status }, end: value => { captured.body = String(value ?? '') } }
  await route.handler(request, response, new URL(request.url, 'http://fixture'))
  if (captured.status !== 200) throw new Error('合成管理操作失败：' + captured.body)
  return JSON.parse(captured.body)
}
const server = createServer(async (req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html;charset=utf-8' }); return res.end(parentHtml) }
  if (req.url === '/client.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(await readFile(new URL('../lib/client.js', import.meta.url))) }
  if (req.url === '/fixture/reference') {
    const chunks = []; for await (const part of req) chunks.push(part); const input = JSON.parse(Buffer.concat(chunks).toString())
    // Core 的 addCrossSessionReference 在这里落地：捕获一条固定上游引用并放进目标会话草稿，
    // 再把承载它的 upstream 连接写进目标会话的图（绑定之外的读取授权正是由它表达的）。
    const target = await sessionReferences.resolve({ nativeSessionId: input.target })
    const captured = await sessionReferences.capture({ operationId: input.options.operationId, sourceNativeSessionId: input.capture.sourceSessionId, targetNativeSessionId: input.target, anchorId: input.capture.anchorId, selectedText: input.capture.selectedText, ...(input.capture.expectedSourceVersionId ? { expectedSourceVersionId: input.capture.expectedSourceVersionId } : {}) })
    const doc = await managedThrough('ensure', { logicalSessionId: target.logicalSessionId })
    const source = await sessionReferences.resolve({ nativeSessionId: input.capture.sourceSessionId })
    const sessionNode = (identity, index) => ({ id: 'session:' + identity.logicalSessionId, position: { x: 60, y: index * 220 + 50 }, data: { kind: 'session', label: identity.title, logicalSessionId: identity.logicalSessionId } })
    doc.graph.nodes = [sessionNode(source, 0), sessionNode(target, 1)]
    doc.graph.edges.push({ id: 'relation:' + captured.referenceId, source: 'session:' + source.logicalSessionId, target: 'session:' + target.logicalSessionId, data: { kind: 'upstream', namespace: 'annotation-upstream', relationId: captured.referenceId, sourceVersionId: captured.sourceVersionId, sourceAnchorId: captured.sourceAnchorId } })
    await managedThrough('save', { objectId: doc.objectId, expectedRevision: doc.revision, title: doc.title, graph: doc.graph })
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ referenceId: captured.referenceId, created: true }))
  }
  const path = new URL(req.url, 'http://fixture').pathname, route = routes.find(r => r.kind === 'exact' ? path === r.path : path.startsWith(r.path + '/'))
  if (!route) { res.writeHead(404); return res.end() }
  try { await route.handler(req, res, path, new URL(req.url, 'http://fixture')) } catch (error) { res.writeHead(500); res.end(error.message) }
})
server.listen(0, '127.0.0.1'); await once(server, 'listening')
const origin = 'http://127.0.0.1:' + server.address().port
const browser = await chromium.launch({ executablePath: process.env.TEST_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }), errors = [], checks = []
page.on('pageerror', error => errors.push(error.message))
const app = page.frameLocator('iframe')
const toggleMap = async () => { if (!(await page.locator('.dsh-td-overlay').evaluate(el => el.classList.contains('is-open')))) await page.locator('.dsh-td-header-switch [data-view=map]').click(); await app.getByRole('button', { name: '画布更多操作', exact: true }).waitFor() }
const menu = async () => { await app.getByRole('button', { name: '画布更多操作', exact: true }).click() }
const nodeMenu = async label => { await app.getByRole('button', { name: label + '的更多操作', exact: true }).click() }
const addSession = async label => { await menu(); await app.getByRole('menuitem', { name: '添加已有会话', exact: true }).click(); await app.getByRole('button', { name: '合成测试工作区', exact: false }).click(); await app.getByRole('button', { name: label, exact: false }).click() }
try {
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort())
  await page.goto(origin)
  await toggleMap(); await app.getByText('来源讨论 X', { exact: true }).waitFor()
  await page.locator('.dsh-td-canvas-switch [data-view=dialog]').click()
  await page.waitForTimeout(400)
  const slide = await page.evaluate(async () => {
    const header = document.querySelector('.dsh-td-header-switch'), canvas = document.querySelector('.dsh-td-canvas-switch')
    const thumb = el => new DOMMatrixReadOnly(getComputedStyle(el, '::before').transform).m41
    const box = el => { const { x, y, width, height } = el.getBoundingClientRect(); return { x, y, width, height } }
    const initialBox = box(header)
    header.querySelector('[data-view=map]').click()
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
    await new Promise(r => setTimeout(r, 80))
    const outgoing = [thumb(header), thumb(canvas)], openBox = box(canvas)
    canvas.querySelector('[data-view=dialog]').click()
    const atReverse = thumb(header)
    await new Promise(r => setTimeout(r, 40))
    const returning = thumb(header)
    await new Promise(r => setTimeout(r, 400))
    const settled = thumb(header)
    header.querySelector('[data-view=map]').click()
    await new Promise(r => setTimeout(r, 400))
    return { initialBox, openBox, outgoing, atReverse, returning, settled, end: thumb(canvas), headerEnd: thumb(header) }
  })
  await writeFile(resolve(output, 'selector-motion.json'), JSON.stringify(slide, null, 2))
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(slide.initialBox[key] - slide.openBox[key]) < .75, 'switch stays fixed: ' + key)
  assert.ok(slide.outgoing.every(x => x > 0 && x < slide.end), 'thumb visibly travels between states')
  assert.ok(Math.abs(slide.outgoing[0] - slide.outgoing[1]) < 1, 'both surfaces share the animated thumb position')
  assert.ok(Math.abs(slide.atReverse - slide.outgoing[0]) < 1, 'reversal starts at the current position')
  assert.ok(slide.returning < slide.atReverse && slide.returning > 0, 'reversal moves continuously toward dialog')
  assert.equal(slide.settled, 0); assert.equal(slide.headerEnd, slide.end)
  checks.push('shared sliding thumb stays aligned across surfaces and reverses continuously without moving labels or frame')
  await toggleMap(); await app.getByText('来源讨论 X', { exact: true }).waitFor()
  const alignment = async label => {
    await page.waitForFunction(() => {
      const host = document.querySelector('#fixture-header').getBoundingClientRect(), doc = document.querySelector('iframe').contentDocument
      const main = doc.querySelector('.mg-main'), chrome = doc.querySelector('.mg-toolbar')
      if (!chrome) return false
      return host.width > 200 && Math.abs(main.getBoundingClientRect().left - host.left) < .75 && Math.abs(chrome.getBoundingClientRect().bottom - host.bottom) < .75
    })
    const header = await page.locator('.dsh-td-header-switch').boundingBox(), canvas = await page.locator('.dsh-td-canvas-switch').boundingBox()
    for (const axis of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(header[axis] - canvas[axis]) < .75, label + ': switch ' + axis)
    checks.push(label)
  }
  await page.screenshot({ path: resolve(output, 'aligned-light.png'), animations: 'disabled' })
  await page.evaluate(() => { document.documentElement.style.setProperty('--fixture-sidebar', '280px'); document.documentElement.style.setProperty('--fixture-header-height', '96px') })
  await alignment('frame follows sidebar resizing and native header height changes')
  await page.evaluate(() => { document.documentElement.style.setProperty('--fixture-sidebar', '56px') })
  await alignment('native collapsed 56px rail is retained instead of shifting canvas left to zero')
  await app.getByRole('button', { name: '主干导航', exact: true }).click()
  await alignment('opening compact navigation does not move the main canvas border')
  await page.keyboard.press('Escape')
  await page.evaluate(() => { document.documentElement.style.removeProperty('--fixture-sidebar'); document.documentElement.style.removeProperty('--fixture-header-height') })
  await alignment('restored host frame stays aligned')
  const oldSwitchX = (await page.locator('.dsh-td-canvas-switch').boundingBox()).x
  await page.evaluate(() => { document.querySelector('#fixture-title').style.width = '210px'; fixture.onSessionsChanged() })
  await page.waitForFunction(old => document.querySelector('.dsh-td-canvas-switch').getBoundingClientRect().left > old + 40, oldSwitchX)
  await alignment('title metadata changes reposition the switch without a window resize')
  await page.waitForFunction(() => !document.querySelector('.dsh-td-overlay').hasAttribute('data-transitioning'))
  const rapid = await page.evaluate(async () => {
    const frame = document.querySelector('iframe'), overlay = document.querySelector('.dsh-td-overlay'), native = document.querySelector('#fixture-layout')
    const before = frame.contentWindow.document
    const samples = []
    for (let n = 0; n < 5; n++) {
      overlay.querySelector('[data-view=dialog]').click()
      await new Promise(r => setTimeout(r, 45))
      samples.push(Number(getComputedStyle(overlay).opacity))
      document.querySelector('.dsh-td-header-switch [data-view=map]').click()
      await new Promise(r => setTimeout(r, 45))
    }
    const reused = before === frame.contentWindow.document
    overlay.querySelector('[data-view=dialog]').click()
    await new Promise(r => setTimeout(r, 500))
    return { samples, reused, hidden: overlay.hidden, inert: overlay.inert, underlayRestored: !native.inert,
      viewHidden: frame.contentDocument.querySelector('.mg-app').dataset.viewShown === 'false',
      transientLayerRemoved: !overlay.hasAttribute('data-transitioning'), focusRestored: document.activeElement?.dataset.view === 'dialog', draft: document.querySelector('textarea').value }
  })
  assert.ok(rapid.samples.every(value => value > 0 && value < 1), 'normal motion must include intermediate opacity')
  assert.equal(rapid.reused, true); assert.equal(rapid.hidden, true); assert.equal(rapid.inert, true); assert.equal(rapid.underlayRestored, true); assert.equal(rapid.viewHidden, true); assert.equal(rapid.transientLayerRemoved, true); assert.equal(rapid.focusRestored, true); assert.equal(rapid.draft, '保留原有草稿')
  checks.push('continuous reversal reuses the iframe, settles closed, restores focus scope and never reopens from a delayed timer')
  await page.emulateMedia({ reducedMotion: 'reduce' }); await toggleMap()
  assert.equal(await page.locator('.dsh-td-overlay').evaluate(el => getComputedStyle(el).transitionDuration), '0s')
  assert.equal(await page.locator('.dsh-td-canvas-switch').evaluate(el => getComputedStyle(el, '::before').transitionDuration), '0s')
  await page.locator('.dsh-td-canvas-switch [data-view=dialog]').click()
  assert.equal(await page.locator('.dsh-td-overlay').evaluate(el => el.hidden), true)
  checks.push('reduced motion disables transitions and closes immediately')
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await toggleMap()
  await page.evaluate(() => { document.body.setAttribute('data-ds-dark-theme', ''); document.body.style.setProperty('--dsw-alias-bg-base', '#151517'); document.body.style.setProperty('--dsw-alias-label-primary', '#f5f5f7'); document.body.style.setProperty('--dsw-alias-label-primary-inverted', 'rgb(53, 54, 56)'); document.body.style.setProperty('--dsw-alias-label-secondary', 'rgb(207, 211, 214)'); document.body.style.setProperty('--dsw-alias-border-l3', '#ffffff24') })
  await app.locator('html').evaluate(el => new Promise(resolve => { const check = () => el.dataset.theme === 'dark' ? resolve() : requestAnimationFrame(check); check() }))
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.dsh-td-canvas-switch button.active')).color === 'rgb(53, 54, 56)')
  const darkSwitchContrast = await page.locator('.dsh-td-canvas-switch').evaluate(el => {
    const luminance = value => {
      const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
    }
    return [...el.querySelectorAll('button')].map(button => {
      const style = getComputedStyle(button), foreground = luminance(style.color)
      const background = luminance(button.classList.contains('active') ? getComputedStyle(el, '::before').backgroundColor : getComputedStyle(el).backgroundColor)
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05)
    })
  })
  assert.ok(darkSwitchContrast.every(value => value >= 4.5), 'official dark inverse and secondary tokens keep both switch labels readable')
  await alignment('dark host theme preserves frame alignment and readable switch contrast')
  await page.screenshot({ path: resolve(output, 'aligned-dark.png'), animations: 'disabled' })
  await page.evaluate(() => { document.body.removeAttribute('data-ds-dark-theme'); document.body.style.cssText = '' })
  assert.equal(refs.length, 0); assert.equal(previews.length, 0); assert.equal(calls.filter(c => c[0] === 'ensure').length, 1)
  assert.equal(await app.getByText('全局维护网络', { exact: true }).count(), 0); assert.equal(await app.getByText('局部问答', { exact: false }).count(), 0)
  checks.push('opening a graph creates only the current owner main graph; removed global UI and preview panel stay absent')
  await app.getByRole('button', { name: '新建未绑定草稿', exact: true }).first().click(); await menu(); await app.getByRole('menuitem', { name: '添加空卡片', exact: true }).click()
  assert.equal(created.size, 0); await nodeMenu('新会话'); await app.getByRole('menuitem', { name: '在此节点开始会话', exact: true }).click()
  await app.getByRole('button', { name: '加载更多', exact: true }).click(); await app.getByRole('button', { name: '第二页工作区', exact: false }).waitFor(); await app.getByRole('button', { name: '关闭', exact: true }).click(); assert.equal(created.size, 0)
  await nodeMenu('新会话'); await app.getByRole('menuitem', { name: '在此节点开始会话', exact: true }).click(); await app.getByRole('button', { name: '合成测试工作区', exact: false }).click(); await app.getByRole('button', { name: '在所选工作区创建并绑定', exact: true }).click()
  await page.waitForFunction(() => fixture.actions.some(a => a.operation === 'open' && a.id.startsWith('native-new-'))); assert.equal(created.size, 1); await toggleMap()
  checks.push('empty card cancellation creates nothing; paged workspace confirmation creates and binds one real session')
  await app.getByRole('button', { name: '新建未绑定草稿', exact: true }).first().click(); await addSession('来源讨论 X'); await addSession('接收会话 Y'); assert.equal(refs.length, 0)
  await nodeMenu('来源讨论 X'); await app.getByRole('menuitem', { name: '连接到节点', exact: true }).click(); await app.getByRole('button', { name: '接收会话 Y · 会话', exact: true }).click()
  await app.getByRole('dialog', { name: '确认上下文来源' }).waitFor(); assert.equal(refs.length, 0); await app.getByRole('button', { name: '确认固定来源并连接', exact: true }).click()
  await page.waitForFunction(() => fixture.actions.some(a => a.operation === 'reference')); await toggleMap(); await app.locator('.react-flow__edge').waitFor()
  assert.equal(refs[0].targetSessionId, 'target'); assert.equal(docs.get('main-source').graph.edges.length, 0); assert.equal(docs.get('main-target').graph.edges.length, 1)
  checks.push('existing cards do not grant access; confirmed X to Y relation appears only in Y main graph')
  headVersion = 'version-2'; await nodeMenu('来源讨论 X'); await app.getByRole('menuitem', { name: '查看来源', exact: true }).click(); await app.getByText('梯度检查点通过增加计算时间换取显存。', { exact: true }).waitFor(); assert.equal(previews.at(-1).bounds.sourceVersionId, 'version-1')
  await app.getByRole('button', { name: '继续读取这一来源', exact: true }).click(); await app.getByText('后续解释：已固定的来源继续页。', { exact: true }).waitFor(); assert.equal(previews.at(-1).cursor, 'page:version-1'); await app.getByRole('button', { name: '关闭', exact: true }).click()
  checks.push('right-click source preview stays fixed after source append; subsequent pages preserve immutable cursor')
  await nodeMenu('接收会话 Y'); await app.getByRole('menuitem', { name: '在此节点开始会话', exact: true }).click(); await page.waitForFunction(() => fixture.actions.some(a => a.operation === 'prepare')); assert.deepEqual(await page.evaluate(() => fixture.actions.find(a => a.operation === 'prepare').referenceIds), ['reference-1']); assert.equal(await page.evaluate(() => fixture.draft), '保留原有草稿'); assert.deepEqual(await page.evaluate(() => fixture.attachments), ['保留附件']); await toggleMap()
  checks.push('starting a bound node prepares only incoming reference IDs and preserves existing draft and attachments')
  await app.locator('.react-flow__edge').click({ button: 'right' }); await app.getByRole('menuitem', { name: '查看固定来源与读取位置', exact: true }).click(); await app.getByText('已准备 · 交付未确认', { exact: false }).waitFor(); await app.getByText('早期记录已裁剪', { exact: false }).waitFor(); await page.screenshot({ path: resolve(output, 'fixed-source-log.png') }); await app.getByRole('button', { name: '关闭', exact: true }).click()
  const removals = calls.filter(c => c[0] === 'remove').length; await app.locator('.react-flow__edge').click(); await page.keyboard.press('Delete'); await app.getByText('所选卡片和连接已移除', { exact: false }).waitFor(); assert.equal(calls.filter(c => c[0] === 'remove').length, removals + 1); assert.equal(refs[0].state, 'revoked'); assert.equal(docs.get('main-target').graph.edges.length, 0)
  await app.getByRole('button', { name: '刷新主干', exact: true }).click(); await app.getByRole('button', { name: '画布更多操作', exact: true }).waitFor(); assert.equal(await app.locator('.react-flow__edge').count(), 0)
  checks.push('edge log distinguishes prepared delivery, truncation and fixed cutoff; Delete uses domain revocation and refresh cannot revive it')
  await nodeMenu('来源讨论 X'); await app.getByRole('menuitem', { name: '移除卡片', exact: true }).click(); await app.getByText('所选卡片和连接已移除', { exact: false }).waitFor(); assert.equal(docs.get('main-target').graph.nodes.some(n => n.data.logicalSessionId === 'source'), false); assert.ok(identities.some(i => i.logicalSessionId === 'source'))
  await menu(); await app.getByRole('menuitem', { name: '添加空卡片', exact: true }).click(); conflictNext = true; await app.getByRole('button', { name: '保存', exact: true }).click(); await app.getByText('修订冲突，本地编辑保留', { exact: false }).waitFor(); assert.equal(await app.getByRole('button', { name: '新会话的更多操作', exact: true }).count(), 1)
  await app.getByRole('button', { name: '保留布局副本并重新载入', exact: true }).click(); await app.getByText('本地布局已另存', { exact: false }).waitFor()
  checks.push('node context deletion retains real session; revision conflict preserves local layout and supports a separate recovery draft')
  await page.setViewportSize({ width: 390, height: 844 }); await alignment('narrow host aligns both frame edges and keeps view switch fixed'); await app.getByRole('button', { name: '主干导航', exact: true }).click(); await app.getByRole('button', { name: '当前会话的主干', exact: true }).waitFor(); await page.screenshot({ path: resolve(output, 'mobile-navigation.png'), animations: 'disabled' }); await page.keyboard.press('Escape'); await menu(); await page.screenshot({ path: resolve(output, 'mobile-menu.png'), animations: 'disabled' }); const bounds = await app.getByRole('menu').boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391); assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 845); await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1100, height: 850 }); await page.goto(origin);
  await page.waitForFunction(() => !!window.fixture.selectionActions['thoughtdag.reference']);
  await page.evaluate(() => fixture.selectionActions['thoughtdag.reference'].run({ sourceSessionId: 'native-source', anchorId: 'answer-1', messageId: 'answer-1', selectedText: '减少训练显存', role: 'assistant', occurrence: 0 }));
  const ownershipFrame = page.frameLocator('iframe');
  await ownershipFrame.getByRole('dialog', { name: '引用到会话', exact: true }).waitFor();
  await ownershipFrame.getByRole('dialog', { name: '引用到会话', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
  checks.push('native cross-session action opens the graph-owned picker without Sidechat or Better Sidebar');
  await page.locator('.dsh-td-canvas-switch').getByRole('button', { name: '对话', exact: true }).click();
  await page.evaluate(() => fixture.selectionActions['thoughtdag.session-sticker'].run({ sourceSessionId: 'native-source', anchorId: 'answer-1', messageId: 'answer-1', selectedText: '减少训练显存', role: 'assistant', occurrence: 0 }));
  const panel = ownershipFrame.getByRole('dialog', { name: '会话贴纸', exact: true }); await panel.waitFor();
  // 会话贴纸在当前会话自己的工作区直接开会话：面板里不再有工作区选择这一步。
  assert.equal(await panel.getByRole('button', { name: '选择新会话所在工作区', exact: true }).count(), 0, '贴纸面板不应再要求选择工作区');
  await panel.getByRole('button', { name: '在当前工作区新建会话', exact: true }).click();
  await page.waitForFunction(() => fixture.actions.some(action => action.operation === 'open' && action.id.startsWith('native-new-')));
  const newIdentity = identities.find(identity => identity.nativeSessionId === 'native-new-2');
  assert.ok(newIdentity, '新会话应由宿主会话控制器创建');
  // 绑定边只在新会话自己的图里，方向是「被选段会话 → 新会话」。
  const stickerDoc = sessionData.get(JSON.stringify([newIdentity.logicalSessionId, 'thoughtdag', 'graph-' + createHash('sha256').update(newIdentity.logicalSessionId).digest('hex')]))
  assert.ok(stickerDoc, '新会话应当带上自己的图');
  const bound = stickerDoc.content.graph.edges.filter(edge => edge.data.kind === 'bound');
  assert.deepEqual(bound.map(edge => [edge.source, edge.target]), [['session:source', 'session:' + newIdentity.logicalSessionId]], '绑定边方向与归属');
  assert.equal(bound.every(edge => edge.data.relationId === undefined), true, '绑定边不得声明引用授权');
  assert.equal(stickerDoc.content.graph.ownerSessionId, newIdentity.logicalSessionId);
  assert.equal(sessionData.has(JSON.stringify(['native-source', 'thoughtdag', 'graph-' + createHash('sha256').update('source').digest('hex')])), false, '被选段会话的图上不重复存这条边');
  // 引用留在新会话的草稿里，未被发送。
  const staged = [...sessionData.values()].filter(row => row.namespace === 'annotation-upstream' && row.sessionId === newIdentity.nativeSessionId);
  assert.equal(staged.length, 1); assert.equal(staged[0].content.state, 'pending'); assert.equal(staged[0].content.selectedText, '减少训练显存');
  assert.equal(calls.filter(call => call[0] === 'create-session').length, 1);
  await page.screenshot({ path: resolve(output, 'session-stickers-in-map.png'), fullPage: true });
  checks.push('session sticker opens a real session in the current workspace and records one topology-only bound edge in the new session graph');
  assert.deepEqual(errors, []); await writeFile(resolve(output, 'result.json'), JSON.stringify({ userData: false, modelCalls: 0, checks, errors, references: refs.map(r => ({ referenceId: r.referenceId, state: r.state })), nativeCreates: created.size }, null, 2)); console.log(JSON.stringify({ output, checks: checks.length, errors }))
} catch (error) { await page.screenshot({ path: resolve(output, 'failure.png') }); await writeFile(resolve(output, 'failure.txt'), error.stack + '\n' + JSON.stringify({calls,refs,previews,checks,errors})); throw error } finally { await browser.close(); server.close(); await once(server, 'close') }





