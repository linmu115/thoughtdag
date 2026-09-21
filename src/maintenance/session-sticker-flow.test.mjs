import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'

// 贴纸面板的行为测试：面板只跟 DAG 自己的 `/thoughtdag/api/managed/*` 说话，
// 所以夹具提供的也是这条路由。夹具**不再**伪造任何 maintenance 服务 —— 那正是
// 之前让本次故障（405 + 空响应体）在测试里看不见的原因。
const browserPath = process.env.THOUGHTDAG_TEST_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

async function fixture(t, { failCreate = false, failStage = false, failOpen = false } = {}) {
  const calls = []
  const output = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {SessionStickerPanel} from './src/maintenance/SessionStickerPanel.tsx';createRoot(document.getElementById('root')).render(<SessionStickerPanel capture={{sourceSessionId:'source-native',anchorId:'message',messageId:'message',role:'assistant',selectedText:'selected source',occurrence:2}} sourceSessionId="source-native" currentSessionId="current-native" workspaceId="workspace" onClose={()=>window.closedPanel=true}/>);`, loader: 'tsx', resolveDir: process.cwd() }, outfile: 'app.js', bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })
  // 合成路由只让「第一次创建」失败一次：这样重试才能真正验证面板是否复用了身份。
  const attempts = new Map()
  const attemptsOf = operation => { const count = (attempts.get(operation) ?? 0) + 1; attempts.set(operation, count); return count }
  const server = createServer(async (req, res) => {
    if (req.url === '/app.js' || req.url === '/app.css') { res.setHeader('content-type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(output.outputFiles.find(file => basename(file.path) === req.url.slice(1)).text); return }
    if (req.url.startsWith('/thoughtdag/api/managed/')) {
      const operation = req.url.split('/').at(-1), chunks = []; for await (const chunk of req) chunks.push(chunk)
      const input = JSON.parse(Buffer.concat(chunks).toString()); calls.push({ operation, input })
      attemptsOf(operation)
      if (failCreate && operation === 'create-sticker' && attempts.get(operation) === 1) { res.writeHead(409, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: '合成创建失败' })) }
      if (operation !== 'create-sticker') { res.writeHead(404, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unexpected ' + operation })) }
      res.setHeader('content-type', 'application/json')
      return res.end(JSON.stringify({ logicalSessionId: 'new-logical', nativeSessionId: 'new-native', title: '新会话', boundSourceSessionId: 'source-native', sourceVersionId: 'fixed-version', graphRevision: 2 }))
    }
    res.setHeader('content-type', 'text/html')
    if (req.url === '/') {
      res.end(`<html><body><iframe src="/frame" style="width:100%;height:95vh;border:0"></iframe><script>
      window.actions=[];window.failures=${JSON.stringify({ 'open-session': Number(failOpen), 'stage-reference': Number(failStage) })};
      // 每种失败只发生一次：这样「再点一次」验证的才是面板自己的重试，而不是永远失败。
      window.addEventListener('message',event=>{const m=event.data;if(m.type!=='td:managed-request')return;window.actions.push(m);const budget=window.failures[m.operation]??0;if(budget>0)window.failures[m.operation]=budget-1;event.source.postMessage({source:'dsh-thoughtdag',type:'td:managed-result',requestId:m.requestId,ok:!(budget>0),error:'合成失败，可重试',result:m.operation==='stage-reference'?{referenceId:'fixed-reference'}:{opened:true}},location.origin)});
      </script></body></html>`); return
    }
    res.end(`<html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script>window.actions=window.parent.actions;</script><script src="/app.js"></script></body></html>`)
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const browser = await chromium.launch({ executablePath: browserPath, headless: true }), hostPage = await browser.newPage()
  const errors = []; hostPage.on('pageerror', e => errors.push(e.message))
  t.after(async () => { await browser.close(); server.close(); await once(server, 'close'); assert.deepEqual(errors, []) })
  await hostPage.goto(`http://127.0.0.1:${server.address().port}`)
  const page = hostPage.frames().find(frame => frame.url().endsWith('/frame')); assert.ok(page)
  const create = async () => { await page.getByRole('button', { name: '在当前工作区新建会话', exact: true }).click() }
  await page.getByRole('button', { name: '在当前工作区新建会话', exact: true }).waitFor()
  return { page, calls, create }
}

test('贴纸在当前工作区直接开会话：先建会话与拓扑绑定，再放引用，最后进入会话且不发送', { skip: !existsSync(browserPath) }, async t => {
  const { page, calls, create } = await fixture(t)
  // 面板不再有任何工作区选择步骤。
  assert.equal(await page.getByText('选择新会话所在工作区', { exact: true }).count(), 0)
  await create(); await page.waitForFunction(() => window.closedPanel)
  assert.deepEqual(calls.map(call => call.operation), ['create-sticker'])
  assert.equal(calls[0].input.sourceSessionId, 'source-native')
  assert.equal(calls[0].input.currentSessionId, 'current-native')
  assert.equal(calls[0].input.workspaceId, 'workspace')
  const actions = await page.evaluate(() => window.actions.map(action => action.operation))
  assert.deepEqual(actions, ['stage-reference', 'open-session'])
  const staged = await page.evaluate(() => window.actions[0].input)
  assert.equal(staged.targetSessionId, 'new-native')
  assert.equal(staged.capture.sourceSessionId, 'source-native')
  assert.equal(staged.capture.expectedSourceVersionId, 'fixed-version')
  assert.equal(staged.capture.occurrence, 2)
})

for (const failure of ['failCreate', 'failStage', 'failOpen']) test(`重试 ${failure} 不会重复创建会话，也不会假装成功`, { skip: !existsSync(browserPath) }, async t => {
  const { page, calls, create } = await fixture(t, { [failure]: true })
  await create(); await page.getByRole('alert').waitFor()
  assert.equal(await page.evaluate(() => Boolean(window.closedPanel)), false)
  await create(); await page.waitForFunction(() => window.closedPanel)
  // 重试带上同一个操作身份：宿主的确定性 sessionId 让创建幂等，所以即使再调一次
  // create-sticker，也只会落到同一个新会话上，不会多开一个会话。
  const attempts = calls.filter(call => call.operation === 'create-sticker')
  assert.ok(attempts.length >= 1)
  assert.equal(new Set(attempts.map(call => call.input.operationId)).size, 1, '重试必须沿用同一个操作身份')
  assert.equal(new Set(attempts.map(call => call.input.workspaceId)).size, 1)
  assert.equal(new Set(attempts.map(call => call.input.currentSessionId)).size, 1)
  const actions = await page.evaluate(() => window.actions)
  // 失败步骤会被重试；已经成功的步骤不得重做 —— 引用绝不能因为重试被放入两次。
  assert.ok(actions.filter(action => action.operation === 'stage-reference').length <= 2, '引用步骤最多重试一次')
  assert.equal(actions.filter(action => action.operation === 'stage-reference').at(-1).input.targetSessionId, 'new-native')
  assert.ok(actions.some(action => action.operation === 'open-session'), '最终必须真的进入新会话')
  if (failure !== 'failCreate') assert.equal(actions.filter(action => action.operation === 'stage-reference').length, failure === 'failStage' ? 2 : 1)
})



