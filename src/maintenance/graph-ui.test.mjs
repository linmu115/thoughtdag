import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { basename } from 'node:path'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'

const browserPath = process.env.THOUGHTDAG_TEST_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

async function fixture(t, { width = 1100, height = 800, holdStatus = false, seedGraph, embedded = false } = {}) {
  const calls = []
  let releaseStatus
  const statusReady = new Promise(resolve => { releaseStatus = resolve })
  if (!holdStatus) releaseStatus()
  let current
  const output = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import App from './src/maintenance/ManagedGraphApp.tsx'; import {initDshAppearance} from './src/maintenance/theme'; initDshAppearance(); createRoot(document.getElementById('root')).render(<App/>);`, loader: 'tsx', resolveDir: process.cwd() }, outfile: 'app.js', bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })
  const server = createServer(async (req, res) => {
    if (req.url === '/client.js') { res.setHeader('content-type', 'text/javascript'); res.end(readFileSync('dsh/lib/client.js')); return }
    if (req.url === '/thoughtdag/api/version') { res.setHeader('content-type', 'application/json'); res.end('{"version":"fixture"}'); return }
    if (embedded && req.url === '/') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(parentFixture); return }
    if (req.url === '/app.js' || req.url === '/app.css') { res.setHeader('content-type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(output.outputFiles.find(file => basename(file.path) === req.url.slice(1)).text); return }
    if (req.url.startsWith('/thoughtdag/api/managed/')) {
      const url = new URL(req.url, 'http://fixture'), endpoint = url.pathname.split('/').at(-1)
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined
      calls.push({ endpoint, query: Object.fromEntries(url.searchParams), body })
      let result
      if (endpoint === 'status') { await statusReady; result = { protocolVersion: 2, mode: 'local', capabilities: { storage: true, sessions: true, references: true, mainGraph: true } } }
      else if (endpoint === 'save') { current = { objectId: 'synthetic-canvas', revision: (current?.revision ?? 0) + 1, title: body.title, graph: !current && seedGraph ? structuredClone(seedGraph) : body.graph }; result = current }
      else if (endpoint === 'ensure') { current = { objectId: 'synthetic-canvas', revision: 1, title: embedded ? '模型版本与可用工具检查' : '合成主干', graph: seedGraph ? structuredClone(seedGraph) : {managedSchema:2,ownerSessionId:'existing',nodes:[],edges:[]} }; result = current }
      else if (endpoint === 'relations') result = {items:[],nextCursor:null}
      else if (endpoint === 'canvas') result = current
      else if (endpoint === 'directory') result = { items: url.searchParams.has('workspaceId') ? [{ id: 'existing', logicalSessionId: 'existing', title: '已有会话标题' }] : [{ id: 'workspace', title: '合成工作区' }] }
      else if (endpoint === 'resolve') result = { logicalSessionId: 'existing', nativeSessionId: 'native-existing', title: '已有会话标题' }
      else { res.writeHead(500); res.end(JSON.stringify({ error: `Unexpected fixture endpoint ${endpoint}` })); return }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(result)); return
    }
    res.setHeader('content-type', 'text/html'); res.end(`<html data-dsh-managed data-dsh-compact="${width <= 760}"><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script>window.addEventListener('message',event=>{if(event.data?.type==='td:request-current'){window.postMessage({source:'dsh-thoughtdag',type:'td:current-session',session:{id:'native-existing',title:'合成主干'}},location.origin);window.postMessage({source:'dsh-thoughtdag',type:'td:view',shown:true},location.origin)}})</script><script src="/app.js"></script></body></html>`)
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const browser = await chromium.launch({ executablePath: browserPath, headless: true })
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  t.after(async () => { releaseStatus(); await browser.close(); server.close(); await once(server, 'close'); assert.deepEqual(errors, []) })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  return { page, calls, releaseStatus }
}

// Use the real parent shim around a synthetic native header, including nonzero
// sidebar/top offsets. The graph API and all conversation data remain synthetic.
const parentFixture = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;font:14px system-ui;--dsw-alias-bg-base:#fff}
#layout{display:flex;height:calc(100vh - 24px);margin-top:24px}aside{width:240px;flex:none;background:#f7f7f7}main{flex:1;min-width:0}
header{height:76px;padding:10px 28px 0 20px;border-bottom:.5px solid #ddd}
.title-row{display:flex;min-height:30px;align-items:center}nav button{font:500 14px/20px system-ui;padding:4px 8px;border:0;background:none;color:#111}.tabs{margin-top:10px}
</style><div id="layout"><aside></aside><main data-pane="conversation"><header><div class="title-row"><nav><button disabled>模型版本与可用工具检查</button></nav><div id="toolbar"></div></div><div class="tabs">对话　轨迹</div></header></main></div><script>
const react={useState:v=>[v,()=>{}],useEffect:fn=>fn(),createElement:(tag,props,...children)=>{const el=document.createElement(tag);for(const[k,v]of Object.entries(props||{})){if(k==='onClick')el.onclick=v;else if(k==='className')el.className=v;else if(v!==undefined)el.setAttribute(k,v)}for(const c of children.flat())el.append(c instanceof Node?c:String(c));return el}};
window.__ModuleLoader__={load:mod=>mod.factory(()=>react).apply({sessions:{list:{getSnapshot:()=>({current:'native-existing',byId:{'native-existing':{title:'模型版本与可用工具检查'}}}),subscribe:()=>()=>{}}},effect:fn=>fn(),slots:{inject:(_name,fn)=>fn(),register:(_meta,C)=>{document.querySelector('#toolbar').append(C());return()=>{}}}})};
</script><script src="/client.js"></script>`

async function draft(page) {
  assert.equal(await page.getByRole('button', { name: '新建未绑定草稿', exact: true }).count(), 0)
  await page.getByRole('button', { name: '添加空卡片', exact: true }).waitFor()
}

const navigationGraph = { managedSchema: 2, ownerSessionId: 'existing', viewport: { x: 0, y: 0, zoom: 1 }, nodes: [
  { id: 'upper', position: { x: 80, y: 90 }, data: { kind: 'placeholder', label: '上游卡片' } },
  { id: 'lower', position: { x: 430, y: 380 }, data: { kind: 'placeholder', label: '接收卡片' } },
], edges: [{ id: 'link', source: 'upper', target: 'lower', data: { kind: 'pending' } }] }

test('navigation overview pans by click, drag and keyboard without modifying nodes or references', { skip: !existsSync(browserPath) }, async t => {
  const { page, calls } = await fixture(t, { seedGraph: navigationGraph })
  const overview = page.getByRole('group', { name: '画布导航小地图' })
  await overview.waitFor()
  assert.equal(await overview.locator('.mg-navigator-node').count(), 2)
  assert.equal(await overview.locator('.mg-navigator-edge').count(), 1)
  const transform = () => page.locator('.react-flow__viewport').evaluate(el => el.style.transform)
  const before = await transform(), box = await overview.boundingBox()
  await page.mouse.click(box.x + box.width * .85, box.y + box.height * .8)
  await page.waitForFunction(value => document.querySelector('.react-flow__viewport').style.transform !== value, before)
  const clicked = await transform()
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .5)
  await page.mouse.down(); await page.mouse.move(box.x + 20, box.y + 20, { steps: 12 }); await page.mouse.up()
  assert.notEqual(await transform(), clicked)
  const dragged = await transform()
  await overview.focus(); await page.keyboard.press('ArrowRight')
  await page.waitForFunction(value => document.querySelector('.react-flow__viewport').style.transform !== value, dragged)
  await page.getByRole('button', { name: '保存主干', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.mg-save-state')?.textContent.includes('已保存'))
  const saved = calls.filter(call => call.endpoint === 'save').at(-1).body.graph
  assert.deepEqual(saved.nodes, navigationGraph.nodes)
  assert.deepEqual(saved.edges, navigationGraph.edges)
  assert.notDeepEqual(saved.viewport, navigationGraph.viewport)
  assert.equal(saved.viewport.zoom, 1)
  assert.deepEqual([...new Set(calls.filter(call => call.body).map(call => call.endpoint))], ['ensure', 'save'])
})

test('real parent shim aligns canvas title and divider to native header after sidebar and viewport resizing', { skip: !existsSync(browserPath) }, async t => {
  const { page } = await fixture(t, { width: 1440, height: 900, embedded: true, seedGraph: navigationGraph })
  await page.locator('.dsh-td-header-switch [data-view="map"]').click()
  const app = page.frameLocator('iframe')
  await app.locator('.mg-navigator').waitFor()
  const geometry = () => page.evaluate(() => {
    const native = document.querySelector('header'), title = native.querySelector('button:disabled'), style = getComputedStyle(title)
    const frame = document.querySelector('iframe'), doc = frame.contentDocument, offset = frame.getBoundingClientRect()
    const rect = el => { const b = el.getBoundingClientRect(); return { x:b.x, y:b.y, bottom:b.bottom } }
    return { native:rect(native), nativeTitle:rect(title), padding:[parseFloat(style.paddingLeft),parseFloat(style.paddingTop)], offset:rect(frame), toolbar:rect(doc.querySelector('.mg-toolbar')), title:rect(doc.querySelector('.mg-title-group input')), state:rect(doc.querySelector('.mg-save-state')), flow:rect(doc.querySelector('.mg-flow')), actions:rect(doc.querySelector('.mg-actions')), border:doc.defaultView.getComputedStyle(doc.querySelector('.mg-actions')).borderBottomWidth }
  })
  const assertAlignment = async () => {
    await page.waitForFunction(() => { const f=document.querySelector('iframe'), h=f.contentDocument.querySelector('.mg-toolbar'); return h && Math.abs(f.getBoundingClientRect().top+h.getBoundingClientRect().bottom-document.querySelector('header').getBoundingClientRect().bottom)<1 })
    const g = await geometry()
    assert.ok(Math.abs(g.title.x + g.offset.x - g.nativeTitle.x - g.padding[0]) < 1, JSON.stringify(g))
    assert.ok(Math.abs(g.title.y + g.offset.y - g.nativeTitle.y - g.padding[1]) < 1, JSON.stringify(g))
    assert.ok(g.state.bottom < g.toolbar.bottom, 'Save state must be above the divider')
    assert.ok(Math.abs(g.flow.y - g.toolbar.bottom) < 1, 'Canvas starts at the only divider')
    assert.ok(g.actions.y > g.flow.y && g.actions.y < g.flow.y + 20, 'Operations float inside canvas')
    assert.equal(g.border, '0px')
  }
  await assertAlignment()
  await app.getByRole('group', { name:'画布导航小地图' }).focus()
  await page.keyboard.press('ArrowRight')
  await app.locator('.mg-save-state').filter({hasText:'未保存'}).waitFor()
  const overview = await app.locator('.mg-navigator').boundingBox(), controls = await app.locator('.react-flow__controls').boundingBox()
  assert.ok(overview.y + overview.height < controls.y, 'Minimap and zoom controls must not overlap')
  await page.waitForFunction(() => !document.querySelector('.dsh-td-overlay').hasAttribute('data-transitioning'))
  mkdirSync('.local-e2e/canvas-navigation', { recursive:true })
  await page.screenshot({ path:'.local-e2e/canvas-navigation/desktop.png' })
  await page.evaluate(() => { document.querySelector('aside').style.width='80px'; document.querySelector('header').style.height='92px' })
  await page.setViewportSize({width:960,height:700})
  await assertAlignment()
  await page.locator('.dsh-td-canvas-switch [data-view="dialog"]').click()
  await page.locator('.dsh-td-header-switch [data-view="map"]').click()
  await assertAlignment()
})

test('dragging a measured card keeps it visible and preserves its saved position', { skip: !existsSync(browserPath) }, async t => {
  const { page, calls } = await fixture(t)
  await draft(page)
  await page.getByRole('button', { name: '添加空卡片', exact: true }).click()
  const node = page.locator('.react-flow__node').first()
  await node.waitFor({ state: 'visible' })
  await page.getByRole('button', { name: '保存主干', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.mg-save-state')?.textContent.includes('已保存'))
  await node.evaluate(element => {
    window.dragVisibility = []
    window.dragObserver = new MutationObserver(records => {
      for (const record of records) if (record.attributeName === 'style' && (/visibility:\s*hidden/.test(record.oldValue || '') || element.style.visibility === 'hidden')) window.dragVisibility.push({ old: record.oldValue, current: element.getAttribute('style') })
    })
    window.dragObserver.observe(element, { attributes: true, attributeOldValue: true })
  })
  const before = calls.filter(call => call.endpoint === 'save').at(-1).body.graph.nodes[0].position
  const box = await node.boundingBox()
  await page.mouse.move(box.x + 100, box.y + 65)
  await page.mouse.down()
  await page.mouse.move(box.x + 180, box.y + 145, { steps: 24 })
  await page.mouse.up()
  await page.getByRole('button', { name: '保存主干', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.mg-save-state')?.textContent.includes('已保存'))
  const after = calls.filter(call => call.endpoint === 'save').at(-1).body.graph.nodes[0]
  assert.ok(after.position.x > before.x + 40 && after.position.y > before.y + 40, JSON.stringify({ before, after }))
  assert.deepEqual(Object.keys(after).sort(), ['data', 'id', 'position'])
  const hidden = await page.evaluate(() => { window.dragObserver.disconnect(); return window.dragVisibility })
  assert.deepEqual(hidden, [], 'A measured card must not be hidden for remeasurement during drag/save')
})

test('connected cards stay measured through background refresh during dragging', { skip: !existsSync(browserPath) }, async t => {
  const seedGraph = { managedSchema: 2, ownerSessionId: null, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [
    { id: 'upper', position: { x: 40, y: 40 }, data: { kind: 'placeholder', label: '上游卡片' } },
    { id: 'lower', position: { x: 40, y: 300 }, data: { kind: 'placeholder', label: '接收卡片' } },
  ], edges: [{ id: 'link', source: 'upper', target: 'lower', data: { kind: 'pending' } }] }
  const { page, calls } = await fixture(t, { seedGraph })
  assert.equal(await page.getByRole('button', { name: '新建未绑定草稿', exact: true }).count(), 0)
  await page.locator('.react-flow__edge-path').waitFor({ state: 'attached' })
  const node = page.locator('.react-flow__node[data-id="upper"]')
  await page.evaluate(() => {
    window.hiddenCount = 0; window.edgePath = document.querySelector('.react-flow__edge-path')
    window.cardObserver = new MutationObserver(records => {
      for (const record of records) if (record.target.matches('.react-flow__node') && (/visibility:\s*hidden/.test(record.oldValue || '') || record.target.style.visibility === 'hidden')) window.hiddenCount++
    })
    window.cardObserver.observe(document.querySelector('.react-flow__nodes'), { subtree: true, attributes: true, attributeFilter: ['style'], attributeOldValue: true })
  })
  const box = await node.boundingBox(), priorReads = calls.filter(call => call.endpoint === 'canvas').length
  await page.mouse.move(box.x + 100, box.y + 65); await page.mouse.down()
  await page.mouse.move(box.x + 135, box.y + 90, { steps: 12 })
  const refreshed = page.waitForResponse(response => response.url().includes('/managed/canvas'))
  await page.evaluate(() => window.postMessage({ source: 'dsh-thoughtdag', type: 'td:graph-changed' }, location.origin))
  await refreshed
  await page.mouse.move(box.x + 180, box.y + 125, { steps: 18 }); await page.mouse.up()
  await page.getByRole('button', { name: '保存主干', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.mg-save-state')?.textContent.includes('已保存'))
  const result = await page.evaluate(() => { window.cardObserver.disconnect(); return { hidden: window.hiddenCount, sameEdge: window.edgePath === document.querySelector('.react-flow__edge-path') } })
  assert.deepEqual(result, { hidden: 0, sameEdge: true })
  assert.ok(calls.filter(call => call.endpoint === 'canvas').length > priorReads)
  const saved = calls.filter(call => call.endpoint === 'save').at(-1).body.graph
  assert.ok(saved.nodes[0].position.x > 90)
  assert.deepEqual(saved.nodes[1], seedGraph.nodes[1])
  assert.deepEqual(saved.edges, seedGraph.edges)
  for (const item of saved.nodes) assert.deepEqual(Object.keys(item).sort(), ['data', 'id', 'position'])
})

test('opening feedback is truthful, and empty-card action only edits the graph without creating sessions or references', { skip: !existsSync(browserPath) }, async t => {
  const { page, calls, releaseStatus } = await fixture(t, { holdStatus: true })
  await page.getByRole('status').filter({ hasText: '正在打开会话主干' }).waitFor()
  assert.equal(await page.getByRole('button', { name: '添加空卡片', exact: true }).count(), 0)
  releaseStatus()
  await draft(page)
  const writes = calls.filter(call => call.body)
  assert.equal(writes.length, 1)
  await page.getByRole('button', { name: '添加空卡片', exact: true }).click()
  await page.locator('.mg-node-title').filter({ hasText: '新会话' }).waitFor()
  assert.match(await page.locator('.mg-canvas-count').innerText(), /1 张卡片 · 0 条连接/)
  assert.equal(calls.filter(call => call.body).length, writes.length)
  assert.match(await page.locator('.mg-save-state').innerText(), /未保存/)
})

test('empty canvas offers workspace-first existing sessions and keeps adding separate from authorizing a reference', { skip: !existsSync(browserPath) }, async t => {
  const { page, calls } = await fixture(t)
  await draft(page)
  await page.getByRole('button', { name: '添加已有会话', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /合成工作区/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: /已有会话标题/ }).click()
  await page.locator('.mg-node-title').filter({ hasText: '已有会话标题' }).waitFor()
  assert.deepEqual(calls.filter(call => call.endpoint === 'directory').map(call => call.query), [{}, { workspaceId: 'workspace' }])
  assert.deepEqual(calls.filter(call => call.body).map(call => call.endpoint), ['ensure'])
  assert.equal(await page.getByRole('dialog').count(), 0)
})

test('canvas menu stays in narrow viewport and supports full keyboard navigation without deleting selected cards', { skip: !existsSync(browserPath) }, async t => {
  const { page, calls } = await fixture(t, { width: 600, height: 780 })
  await draft(page)
  const pane = await page.locator('.react-flow__pane').boundingBox()
  await page.mouse.click(pane.x + pane.width - 4, pane.y + 30, { button: 'right' })
  const menu = page.getByRole('menu')
  await menu.waitFor()
  const box = await menu.boundingBox()
  assert.ok(box.x >= 7 && box.y >= 7 && box.x + box.width <= 593 && box.y + box.height <= 773, JSON.stringify(box))
  await page.keyboard.press('End')
  assert.equal(await page.evaluate(() => document.activeElement.textContent), '导入当前目标已有引用（不新建权限）')
  await page.keyboard.press('Home')
  assert.equal(await page.evaluate(() => document.activeElement.textContent), '添加空卡片')
  await page.keyboard.press('Enter')
  await page.locator('.mg-node-title').waitFor()
  const more = page.getByRole('button', { name: '新会话的更多操作', exact: true })
  await more.focus(); await page.keyboard.press('Enter')
  await page.getByRole('menu').waitFor()
  await page.keyboard.press('Delete')
  assert.equal(await page.locator('.mg-node-title').count(), 1)
  assert.equal(calls.some(call => call.endpoint === 'remove'), false)
  await page.keyboard.press('Tab')
  assert.equal(await page.getByRole('menu').count(), 0)
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '新会话的更多操作')
  assert.equal(await more.evaluate(element => element === document.activeElement), true, await page.evaluate(() => document.activeElement.outerHTML.slice(0, 600)))
  await page.keyboard.press('Enter')
  await page.getByRole('menu').waitFor()
  await page.evaluate(() => {
    const style = document.createElement('style'); style.textContent = '.mg-node-more { visibility: hidden !important; }'; document.head.append(style)
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    requestAnimationFrame(() => requestAnimationFrame(() => style.remove()))
  })
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '新会话的更多操作')
  assert.equal(await more.evaluate(element => element === document.activeElement), true)
  assert.equal(await page.getByRole('button', { name: '主干导航', exact: true }).count(), 0)
  await page.getByText('图示与操作', { exact: true }).click()
  const help = await page.locator('.mg-canvas-help > div').boundingBox()
  assert.ok(help.x >= 0 && help.x + help.width <= 600 && help.y >= 0)
  assert.equal(calls.filter(call => call.body).length, 1)
})
