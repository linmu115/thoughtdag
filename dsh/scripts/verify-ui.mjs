// Real browser, packaged SPA and actual parent shim; all data/services are synthetic.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { apply } from '../lib/managed-entry.js'

const output = resolve(process.argv[2] ?? '.local-e2e/managed-browser')
await mkdir(output, { recursive: true })
await writeFile(resolve(output, 'SYNTHETIC-FIXTURE.json'), JSON.stringify({ userData: false, modelCalls: 0 }))
const objects = new Map(), requests = [], routes = [], knowledgeRequests = [], previewRequests = []
let conflictNext = false, headVersion = 'version-1'
const identities = [
  { logicalSessionId: 'logical-source', nativeSessionId: 'native-source', title: '训练优化讨论' },
  { logicalSessionId: 'logical-target', nativeSessionId: 'native-target', title: '显存实验记录' },
]
const graph = {
  protocolVersion: 1,
  directory: async workspace => ({ items: workspace ? identities.map(s => ({ id: s.nativeSessionId, title: s.title, logicalSessionId: s.logicalSessionId })) : [{ id: 'project-1', title: '合成测试项目' }], nextCursor: null }),
  resolve: async input => { const value = identities.find(s => s.logicalSessionId === input.logicalSessionId || s.nativeSessionId === input.nativeSessionId); if (!value) throw Object.assign(new Error('未找到合成会话'), { code: 'GRAPH_SESSION_NOT_FOUND' }); return value },
  preview: async (logicalId, cursor, selection) => {
    if (cursor && selection) throw new Error('继续读取不能同时更改预览来源')
    previewRequests.push({ logicalId, cursor, selection })
    const version = selection?.sourceVersionId ?? cursor?.split(':')[1] ?? headVersion
    if (!['version-1', 'version-2'].includes(version)) throw new Error('固定来源版本已不可用')
    return { ...await graph.resolve({ logicalSessionId: logicalId }), sourceVersionId: version,
      items: cursor ? [{ eventId: 'answer-1', role: 'assistant', text: '后续解释：按需重计算可以减少激活值的保存。', offset: 40, complete: true }]
        : [{ eventId: 'question-1', role: 'user', text: '训练大模型时如何减少显存占用？', offset: 0, complete: true }, { eventId: 'answer-1', role: 'assistant', text: '梯度检查点通过增加计算时间换取显存。它减少中间激活值的保存。', offset: 0, complete: false }],
      capture: { sourceSessionId: 'native-source', anchorId: 'answer-1', messageId: 'answer-1', role: 'assistant', occurrence: 0, selectedText: '换取显存' },
      nextCursor: cursor ? null : 'page-2:' + version, hasMore: !cursor }
  },
  relations: async () => ({ items: [], nextCursor: null }),
  created: async id => graph.resolve({ nativeSessionId: id }),
}
const bridge = {
  list: async (namespace, _after, deleted = 'active') => {
    if (namespace !== 'thoughtdag') throw new Error('当前实例尚未配置这个扩展对象')
    return { items: [...objects.values()].filter(o => deleted === 'all' || !o.deleted).map(({ content, ...o }) => o), nextCursor: null }
  },
  get: async (_namespace, objectId) => { const object = objects.get(objectId); if (!object) throw new Error('画布不存在'); return { object } },
  save: async (namespace, objectId, revision, content, deleted) => {
    const old = objects.get(objectId)
    if (conflictNext || (old?.revision ?? 0) !== revision) {
      conflictNext = false
      return { status: 'conflict', conflict: { current: old } }
    }
    const object = { objectId, title: content.title, revision: revision + 1, content, deleted, schemaVersion: 1, scope: { namespace } }
    objects.set(objectId, object)
    return { status: 'saved', object }
  },
}
const referenceRows = ['reference-1', 'reference-2', 'reference-3'].map((referenceId, index) => {
  const source = identities[index === 2 ? 1 : 0], target = identities[index === 2 ? 0 : 1]
  return { key: 'annotation-upstream:' + referenceId, kind: 'reference', title: source.title + ' → ' + target.title,
    namespace: 'annotation-upstream', objectId: referenceId, logicalSessionIds: [source.logicalSessionId, target.logicalSessionId], deleted: false, conflicts: 0, available: true,
    reference: { referenceId, sourceSessionId: source.logicalSessionId, targetSessionId: target.logicalSessionId, sourceVersionId: 'version-1', sourceAnchorId: 'answer-1', sourceTitle: source.title, targetTitle: target.title, state: index === 2 ? 'revoked' : 'sent' } }
})
const knowledge = { request: async(operation,input) => {
  knowledgeRequests.push({ operation, input })
  if (operation === 'network') {
    if (input.direction !== 'all' && !input.logicalSessionId) throw new Error('方向查询需要会话身份')
    let items = [...identities.map(s => ({ key: 'session:' + s.logicalSessionId, kind: 'session', title: s.title, logicalSessionIds: [s.logicalSessionId], deleted: false, conflicts: 0, available: true })), ...referenceRows]
    items = items.filter(item => (input.kind === 'all' || input.kind === item.kind) && (!input.query || (item.title + (item.reference ? '换取显存' + item.reference.referenceId : '')).includes(input.query))
      && (!input.logicalSessionId || (input.direction === 'incoming' ? item.reference?.targetSessionId === input.logicalSessionId : input.direction === 'outgoing' ? item.reference?.sourceSessionId === input.logicalSessionId : item.logicalSessionIds.includes(input.logicalSessionId))))
    const start = input.after ? Number(input.after) : 0, size = input.kind === 'reference' ? 1 : 20
    return { items: items.slice(start, start + size), nextCursor: start + size < items.length ? String(start + size) : null }
  }
  if(operation==='impact')return {sourceLogicalSessionId:input.logicalSessionId,visited:2,truncated:false,items:[{referenceId:'impact-ref',sourceSessionId:'logical-source',targetSessionId:'logical-target',title:'显存实验记录',sourceVersionId:'old-version',currentSourceVersionId:'version-1',sourceAnchorId:'answer-1',status:'new-content',depth:1}]}
  if(operation==='list')return {items:[],nextCursor:null}
  throw new Error('Unexpected knowledge operation')
} }
const ctx = { get: name => ({ maintenanceGraph: graph, maintenanceKnowledge:knowledge, maintenanceExtensionData: { bridge }, maintenanceSessionContext: { protocolVersion: 1 } })[name],
  sessions: new Map(), sessionController: {}, webServer: { register: route => { routes.push(route); return () => {} } }, effect: fn => fn(), logger: { info() {} } }
await apply(ctx)
const parentHtml = `<!doctype html><html><head><meta charset="utf-8"><style>#toolbar{margin:12px 0 0 18vw;width:max-content}</style></head><body><div id="toolbar"></div>
<script>
window.fixture = { current:'native-source', draft:'目标会话原有草稿', actions:[] };
const sessions = { list:{getSnapshot:()=>({current:fixture.current,byId:{'native-source':{displayTitle:'训练优化讨论'},'native-target':{displayTitle:'显存实验记录'}}})},refresh:async()=>{},open:async id=>{fixture.current=id;fixture.actions.push({operation:'open',id})} };
const annotation = { features:['graph-reference-actions-v1'],
 updateComment:async(target,referenceId,comment)=>{fixture.actions.push({operation:'comment',target,referenceId,comment})},
 addCrossSessionReference:async(target,capture,options)=>{if(!['version-1','version-2'].includes(capture.expectedSourceVersionId))throw Error('缺少来源版本核对');fixture.current=target;fixture.actions.push({operation:'reference',target,capture,options});return{setId:'set-1',referenceId:'ref-1',created:true}},
 resolveReferenceLink:async()=>({setId:'set-1',referenceId:'ref-1',state:'pending'}),deleteReferenceLink:async()=>({deleted:true}) };
const react = { useState:value=>[value,()=>{}],useEffect:fn=>fn(),createElement:(tag,props,...children)=>{const el=document.createElement(tag);for(const[k,v]of Object.entries(props||{})){if(k==='onClick')el.onclick=v;else if(k==='className')el.className=v;else if(v!==undefined)el.setAttribute(k,v)}for(const c of children.flat())el.append(c instanceof Node?c:String(c));return el} };
window.__ModuleLoader__={load:mod=>mod.factory(()=>react).apply({sessions,get:name=>name==='annotationCore'?annotation:undefined,effect:fn=>fn(),slots:{inject:(_name,fn)=>fn(),register:(_meta,Component)=>{document.querySelector('#toolbar').append(Component());return()=>{}}}})};
</script><script src="/client.js"></script></body></html>`
const server = createServer(async (req, res) => {
  requests.push(req.url)
  if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(parentHtml) }
  if (req.url === '/client.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); return res.end(await readFile(new URL('../lib/client.js', import.meta.url))) }
  const path = new URL(req.url, 'http://fixture').pathname
  if(path.startsWith('/maintenance-knowledge/api/')) { const chunks=[];for await(const chunk of req)chunks.push(chunk);try{const value=await knowledge.request(path.split('/').at(-1),JSON.parse(Buffer.concat(chunks).toString()));res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(value))}catch(e){res.writeHead(409,{'content-type':'application/json'});return res.end(JSON.stringify({error:{message:e.message}}))} }
  const route = routes.find(r => r.kind === 'exact' ? path === r.path : path.startsWith(r.path + '/'))
  if (!route) { res.writeHead(404); return res.end() }
  try { await route.handler(req, res) } catch (error) { res.writeHead(500); res.end(error.message) }
})
server.listen(0, '127.0.0.1'); await once(server, 'listening')
const origin = 'http://127.0.0.1:' + server.address().port
const browser = await chromium.launch({ executablePath: process.env.TEST_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('dialog', dialog => dialog.accept())
const checks = []
try {
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort())
  await page.goto(origin)
  const headerSwitch = page.locator('.dsh-td-header-switch')
  const sameBounds = (actual, expected) => {
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(actual[key] - expected[key]) <= 0.5, key + ' moved between views')
  }
  const headerBounds = await headerSwitch.boundingBox()
  await page.getByRole('button', { name: '思维图', exact: true }).click()
  const canvasSwitch = page.locator('.dsh-td-canvas-switch')
  sameBounds(await canvasSwitch.boundingBox(), headerBounds)
  assert.equal(await canvasSwitch.getByRole('button').count(), 2)
  assert.equal(await canvasSwitch.getByRole('button', { name: '思维图', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.equal(await canvasSwitch.getByRole('button', { name: '对话', exact: true }).getAttribute('aria-pressed'), 'false')
  const canvasUrl = await page.locator('iframe').getAttribute('src')
  await canvasSwitch.getByRole('button', { name: '对话', exact: true }).click()
  assert.equal(await page.locator('.dsh-td-overlay').isVisible(), false)
  sameBounds(await headerSwitch.boundingBox(), headerBounds)
  await page.getByRole('button', { name: '思维图', exact: true }).click()
  assert.equal(await page.locator('iframe').getAttribute('src'), canvasUrl)
  assert.equal(await canvasSwitch.getByRole('button', { name: '思维图', exact: true }).getAttribute('aria-pressed'), 'true')
  checks.push('both views retain the same two-way switch and canvas state survives the return trip')
  for (const width of [900, 390, 1440]) {
    await page.setViewportSize({ width, height: 960 })
    await page.waitForFunction(() => Math.abs(document.querySelector('.dsh-td-canvas-switch').getBoundingClientRect().left - document.querySelector('.dsh-td-header-switch').getBoundingClientRect().left) <= 0.5)
    sameBounds(await canvasSwitch.boundingBox(), await headerSwitch.boundingBox())
  }
  checks.push('switch position and size match the header on both views, including narrow viewport changes')
  const frame = page.frameLocator('iframe')
  await frame.getByRole('button', { name: '新建画布', exact: true }).click()
  await frame.getByRole('textbox', { name: '画布名称' }).fill('训练显存讨论')
  await frame.getByRole('button', { name: '保存', exact: true }).click()
  await frame.getByText('画布已保存。', { exact: true }).waitFor()
  checks.push('create, rename and durable save')
  await frame.getByRole('button', { name: '＋ 会话', exact: true }).click()
  await frame.getByRole('button', { name: /合成测试项目/ }).click()
  await frame.getByRole('button', { name: /训练优化讨论.*选择/ }).click()
  await frame.locator('[data-id="session:logical-source"] .mg-node-kind').click()
  await frame.getByRole('button', { name: '展开局部问答' }).click()
  await frame.getByText('训练大模型时如何减少显存占用？', { exact: true }).waitFor()
  const source = frame.locator('.mg-source-text').last()
  await source.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); const selected = window.getSelection(); selected.removeAllRanges(); selected.addRange(range); element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })) })
  await frame.getByRole('button', { name: '制作材料卡' }).click()
  await frame.getByRole('button', { name: '保存', exact: true }).click()
  await frame.getByText('画布已保存。', { exact: true }).waitFor()
  const stored = [...objects.values()][0]
  assert.equal(stored.content.body.nodes.length, 2)
  const material = stored.content.body.nodes.find(n => n.data.kind === 'material')
  assert.equal(material.data.sourceVersionId, 'version-1')
  assert.equal(JSON.stringify(stored).includes('训练大模型时如何减少'), false)
  checks.push('paged workspace discovery, on-demand QA, fixed selected material without transcript snapshot')
  headVersion = 'version-2'
  await frame.locator(`[data-id="${material.id}"] .mg-node-kind`).click()
  await frame.getByRole('button', { name: '展开局部问答' }).click()
  await frame.getByText(/正在读取材料保存时的固定来源版本/).waitFor()
  assert.deepEqual(previewRequests.at(-1).selection, { sourceVersionId: 'version-1', sourceAnchorId: 'answer-1' })
  await frame.getByRole('button', { name: '继续读取这一来源' }).click()
  await frame.getByText('后续解释：按需重计算可以减少激活值的保存。', { exact: true }).waitFor()
  assert.equal(previewRequests.at(-1).cursor, 'page-2:version-1')
  assert.equal(previewRequests.at(-1).selection, undefined)
  checks.push('after source append, fixed material displays its saved version and continues that version through the real HTTP bridge')
  await frame.locator('[data-id="session:logical-source"] .mg-node-kind').click()
  await frame.getByRole('button', { name: '展开局部问答' }).click()
  await frame.locator('.mg-source-text').last().evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); const selected = window.getSelection(); selected.removeAllRanges(); selected.addRange(range); element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })) })
  await frame.getByRole('button', { name: '引用到会话', exact: true }).click()
  await frame.getByRole('button', { name: /合成测试项目/ }).click()
  await frame.getByRole('button', { name: /显存实验记录.*选择/ }).click()
  await page.waitForFunction(() => window.fixture.actions.some(a => a.operation === 'reference'))
  assert.equal(await page.evaluate(() => window.fixture.draft), '目标会话原有草稿')
  assert.equal(await page.evaluate(() => window.fixture.current), 'native-target')
  await page.getByRole('button', { name: '思维图', exact: true }).click()
  await frame.getByRole('button', { name: '保存', exact: true }).click()
  await frame.getByText('画布已保存。', { exact: true }).waitFor()
  checks.push('actual parent shim routes a version-checked reference to target with draft preserved')
  await frame.locator('.mg-source-text').last().evaluate(() => window.getSelection()?.removeAllRanges())
  await frame.locator('.react-flow__controls-fitview').click()
  await frame.getByRole('button', { name: '保存', exact: true }).click()
  await frame.getByText('画布已保存。', { exact: true }).waitFor()
  await page.screenshot({ path: resolve(output, 'managed-canvas.png'), fullPage: true })
  conflictNext = true
  await frame.getByRole('textbox', { name: '画布名称' }).fill('本地未覆盖的冲突编辑')
  await frame.getByRole('button', { name: '保存', exact: true }).click()
  await frame.getByRole('button', { name: '放弃本地编辑，重新载入' }).waitFor()
  assert.equal(await frame.getByRole('textbox', { name: '画布名称' }).inputValue(), '本地未覆盖的冲突编辑')
  await frame.getByRole('button', { name: '放弃本地编辑，重新载入' }).click()
  await frame.getByRole('button', { name: '移除画布', exact: true }).click()
  await frame.getByText('画布已移到回收列表，会话和引用关系仍保留。', { exact: true }).waitFor()
  await frame.getByRole('button', { name: '已移除的画布', exact: true }).click()
  await frame.getByRole('button', { name: /训练显存讨论.*已移除/ }).waitFor()
  await frame.getByRole('button', { name: '恢复画布', exact: true }).click()
  await frame.getByText('画布已保存。', { exact: true }).waitFor()
  checks.push('CAS conflict keeps edits, explicit reload, trash list and restore')
  await frame.getByRole('button',{name:'全局维护网络',exact:true}).click()
  await frame.locator('.mg-network-list article').filter({ has: frame.getByRole('button', { name: '训练优化讨论', exact: true }) }).getByRole('button', { name: '训练优化讨论', exact: true }).click()
  await page.waitForFunction(() => fixture.actions.some(action => action.operation === 'open' && action.id === 'native-source'))
  assert.equal(await page.evaluate(() => fixture.current), 'native-source')
  assert.ok(requests.some(path => path.includes('resolve?nativeSessionId=native-source')))
  assert.equal(requests.some(path => path.includes('nativeSessionId=undefined')), false)
  await page.getByRole('button', { name: '思维图', exact: true }).click()
  const invalidResult = await frame.locator('body').evaluate(() => new Promise(resolve => {
    const requestId = 'invalid-network-open'
    const timer = setTimeout(() => { window.removeEventListener('message', receive); resolve({ timeout: true }) }, 3000)
    const receive = event => { if (event.source === parent && event.data?.type === 'td:managed-result' && event.data.requestId === requestId) { clearTimeout(timer); window.removeEventListener('message', receive); resolve(event.data) } }
    window.addEventListener('message', receive)
    parent.postMessage({ source: 'dsh-thoughtdag', type: 'td:managed-request', requestId, operation: 'open-session', input: { logicalSessionId: 'logical-source' } }, location.origin)
  }))
  assert.equal(invalidResult.ok, false)
  assert.match(invalidResult.error, /原生会话身份/)
  assert.equal(requests.some(path => path.includes('nativeSessionId=undefined')), false)
  checks.push('actual network session click crosses iframe and HTTP bridge with native identity; malformed identity is rejected before any lookup')
  await frame.getByRole('combobox', { name: '网络类型' }).selectOption('reference')
  await frame.getByRole('textbox', { name: '搜索网络' }).fill('换取显存')
  await frame.getByRole('button', { name: '查询', exact: true }).click()
  await frame.locator('.mg-network-reference').first().waitFor()
  assert.equal(await frame.locator('.mg-network-reference').count(), 1)
  await frame.getByRole('textbox', { name: '搜索网络' }).fill('尚未提交的搜索')
  await frame.getByRole('button', { name: '加载更多', exact: true }).click()
  assert.equal(knowledgeRequests.at(-1).input.query, '换取显存')
  assert.equal(await frame.locator('.mg-network-reference').count(), 2)
  await frame.getByRole('button', { name: '目标引用了哪些来源', exact: true }).first().click()
  assert.equal(knowledgeRequests.at(-1).input.direction, 'incoming')
  assert.equal(knowledgeRequests.at(-1).input.logicalSessionId, 'logical-target')
  await frame.getByRole('button', { name: '来源被哪些会话引用', exact: true }).first().click()
  assert.equal(knowledgeRequests.at(-1).input.direction, 'outgoing')
  assert.equal(knowledgeRequests.at(-1).input.logicalSessionId, 'logical-source')
  await frame.getByRole('button', { name: '目标：显存实验记录', exact: true }).first().click()
  await page.waitForFunction(() => fixture.actions.some(action => action.operation === 'open' && action.id === 'native-target'))
  await page.getByRole('button', { name: '思维图', exact: true }).click()
  await frame.getByRole('button', { name: '查看全部会话', exact: true }).click()
  await frame.getByRole('button', { name: '加载更多', exact: true }).click()
  await frame.getByRole('button', { name: '加载更多', exact: true }).click()
  await frame.locator('.mg-network-reference-details').getByText('已解除引用', { exact: true }).waitFor()
  checks.push('independent reference search, stable pagination, incoming/outgoing scope, explicit target navigation and revoked state are usable in the browser')
  await frame.getByRole('combobox', { name: '网络类型' }).selectOption('all')
  await frame.getByRole('button', { name: '查询', exact: true }).click()
  await frame.locator('.mg-network-list article').filter({ has: frame.getByRole('button', { name: '训练优化讨论', exact: true }) }).getByRole('button',{name:'查看影响',exact:true}).click()
  await frame.getByText('来源有新内容，待你判断',{exact:true}).waitFor()
  const referencesBefore=await page.evaluate(()=>fixture.actions.filter(a=>a.operation==='reference').length)
  await frame.locator('.mg-impact-row input').check()
  assert.equal(await page.evaluate(()=>fixture.actions.filter(a=>a.operation==='reference').length),referencesBefore)
  await frame.getByRole('button',{name:/准备下一条重新回答/}).click()
  await page.waitForFunction(()=>fixture.actions.some(a=>a.operation==='comment'))
  assert.equal(await page.evaluate(()=>fixture.draft),'目标会话原有草稿')
  assert.equal(await page.evaluate(()=>fixture.actions.filter(a=>a.operation==='reference').length),referencesBefore+1)
  assert.match(await page.evaluate(()=>fixture.actions.find(a=>a.operation==='comment').comment),/来源有新内容/)
  await page.getByRole('button',{name:'思维图',exact:true}).click()
  await frame.getByRole('button',{name:/准备下一条重新回答（已选 0/}).waitFor()
  await page.screenshot({path:resolve(output,'knowledge-network.png'),fullPage:true})
  await frame.getByRole('button',{name:'关闭',exact:true}).click()
  checks.push('global source-impact network prepares only the explicitly chosen reply with original draft preserved and no automatic send')
  assert.equal(requests.some(path => /disksessions|\/stream|\/roots|\/inject|\/latest/.test(path)), false)
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ passed: true, synthetic: true, modelCalls: 0, checks, pageErrors: errors, screenshots: ['managed-canvas.png'] }, null, 2))
  console.log(JSON.stringify({ passed: true, checks: checks.length, output }))
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true })
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ passed: false, synthetic: true, checks, error: error.stack, pageErrors: errors }, null, 2))
  throw error
} finally { await browser.close(); server.close(); await once(server, 'close') }
