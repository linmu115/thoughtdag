import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'

const browserPath = process.env.THOUGHTDAG_TEST_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const source = { referenceId: 'ref', sourceSessionId: 'upstream', sourceVersionId: 'fixed-version', cutoffEventId: 'reply40', title: '固定来源', enabled: true, window: null, authorityState: 'sent' }
const entry = ordinal => ({ requestId: `request${ordinal}`, eventId: `request${ordinal}`, nativeMessageId: null, ordinal, createdAt: null, text: `第 ${ordinal} 个真实需求`, totalChars: 12, textOffset: 0, nextTextCursor: null, sourceTrust: 'verified', attachmentRefs: [], attachmentsOmitted: 0, executionRefs: [], replyRefs: [{ eventId: `reply${ordinal}`, nativeMessageId: null, completed: true }], replyRefsOmitted: 0, turnId: null, turnBoundaryEventId: null, relation: 'initial', state: 'completed', associationState: 'verified', location: { requestEventId: `request${ordinal}`, startEventId: `request${ordinal}`, endEventId: `reply${ordinal}`, replyEventId: `reply${ordinal}`, readCursor: `read${ordinal}`, rangeState: 'complete' } })

async function fixture(t, available = true) {
  const calls = []
  const doc = { schemaVersion: 1, protocolVersion: 1, kind: 'native-context', ownerSessionId: 'owner', objectId: 'context', revision: 1, nativeSessionId: 'current-native', sources: [{ ...source }], materials: [{ materialId: 'material', eventSeq: 5, referenceIds: ['ref'], kind: 'read', bytes: 1000, contentHash: 'hash', ranges: [{ referenceId: 'ref', eventId: 'reply38', start: 0, end: 300 }], state: 'retained', pinnedByUser: false, pinnedByModel: false, createdAt: '2026-09-15' }], operations: [], trimmedMaterials: 0, trimmedOperations: 0 }
  let dropNextMutation = false
  const code = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {SourceContextPanel} from './src/maintenance/SourceContextPanel.tsx'; const root=createRoot(document.getElementById('root')); root.render(<div className="mg-app"><SourceContextPanel nativeSessionId="current-native" referenceId="ref" available={${available}} onChanged={()=>{window.changed=(window.changed||0)+1}}/></div>);`
  const output = await build({ stdin: { contents: code, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })
  const server = createServer(async (req, res) => {
    if (req.url === '/app.js') { res.setHeader('content-type', 'text/javascript'); res.end(output.outputFiles[0].text); return }
    if (req.url?.startsWith('/thoughtdag/api/managed/native-context')) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      const request = JSON.parse(Buffer.concat(chunks).toString()); calls.push(request)
      if (request.operation === 'requests') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ schemaVersion: 1, snapshot: 'snapshot', logicalSessionId: 'upstream', sourceVersionId: 'fixed-version', referenceId: 'ref', cutoffEventId: 'reply40', directoryOnly: true, items: [entry(38), entry(40)], nextCursor: null, hasMore: false, remainingBytes: 5000, budgetExhausted: false })); return }
      if (request.operation === 'user-read') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ referenceId: 'ref', sourceSessionId: 'upstream', sourceVersionId: 'fixed-version', cutoffEventId: 'reply40', items: [{ eventId: 'request38', role: 'user', text: '合成问答问题', offset: 0, complete: true }, { eventId: 'reply38', role: 'assistant', text: '合成问答回复', offset: 0, complete: true }], nextCursor: null, hasMore: false, remainingBytes: 5000, budgetExhausted: false })); return }
      if (request.operation !== 'status') {
        const { input } = request
        if (dropNextMutation) { dropNextMutation = false; res.destroy(); return }
        if (input.expectedRevision !== doc.revision) { res.writeHead(409); res.end(JSON.stringify({ error: '引用状态已改变，请刷新' })); return }
        if (request.operation === 'window-set') doc.sources[0].window = input.ranges
        if (request.operation === 'source-set') doc.sources[0].enabled = input.enabled
        if (request.operation === 'pin') doc.materials[0].pinnedByUser = input.pinned
        if (request.operation === 'release') doc.materials[0].state = 'release-pending'
        doc.revision++
        doc.operations.push({ operationId: input.operationId, digest: 'digest', action: request.operation, actor: 'user', executionId: 'ui', state: request.operation === 'release' ? 'pending-next-step' : 'applied', materialIds: ['material'], reason: '', createdAt: '2026-09-15' })
      }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(doc)); return
    }
    res.setHeader('content-type', 'text/html'); res.end(`<html><head><meta charset="utf-8"><style>${readFileSync(resolve('src/maintenance/managed.css'), 'utf8')}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`)
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const browser = await chromium.launch({ executablePath: browserPath, headless: true })
  const page = await browser.newPage({ viewport: { width: 1050, height: 900 } })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  t.after(async () => { await browser.close(); server.close(); await once(server, 'close'); assert.deepEqual(errors, []) })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  return { page, calls, doc, dropMutation() { dropNextMutation = true } }
}

test('native source UI manages bounded disjoint windows, user pins, real release receipts and pause separately', { skip: !existsSync(browserPath) }, async t => {
  const { page, calls, doc } = await fixture(t)
  await page.getByRole('heading', { name: '固定授权上限', exact: false }).waitFor()
  assert.equal(calls.filter(call => call.operation === 'requests').length, 0)
  await page.getByText('按用户请求选择问答范围', { exact: true }).click()
  assert.equal(calls.filter(call => call.operation === 'user-read').length, 0)
  await page.getByRole('button', { name: '查看这一问答', exact: true }).first().click()
  await page.getByText('合成问答回复', { exact: true }).waitFor()
  assert.deepEqual(calls.find(call => call.operation === 'user-read').input, { referenceId: 'ref', userRequestId: 'request38' })
  assert.equal(doc.materials.length, 1)
  await page.getByRole('button', { name: '收起问答预览', exact: true }).click()
  assert.equal(await page.getByText('合成问答回复', { exact: true }).count(), 0)
  await page.getByRole('button', { name: '加入计划窗口', exact: true }).first().click()
  await page.getByRole('button', { name: '加入计划窗口', exact: true }).first().click()
  await page.getByRole('button', { name: '保存窗口', exact: true }).click()
  await page.getByText('当前披露窗口', { exact: true }).waitFor()
  assert.deepEqual(doc.sources[0].window, [{ startEventId: 'request38', endEventId: 'reply38' }, { startEventId: 'request40', endEventId: 'reply40' }])
  assert.equal(doc.sources[0].cutoffEventId, 'reply40')
  await page.getByRole('button', { name: '用户固定保留', exact: true }).click()
  await page.getByRole('button', { name: '取消用户固定', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '释放材料', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '取消用户固定', exact: true }).click()
  await page.getByRole('button', { name: '释放材料', exact: true }).click()
  await page.getByText('等待释放', { exact: true }).waitFor()
  assert.equal(doc.materials[0].state, 'release-pending')
  assert.equal(await page.getByText('已释放', { exact: true }).count(), 0)
  assert.match(await page.locator('[role="status"]').innerText(), /等待下一次原生模型请求/)
  await page.getByRole('button', { name: '暂停来源', exact: true }).click()
  await page.getByRole('button', { name: '恢复来源', exact: true }).waitFor()
  assert.equal(calls.findLast(call => call.operation === 'source-set').input.release, false)
  assert.equal(doc.sources[0].enabled, false)
  assert.equal(calls.every(call => call.nativeSessionId === 'current-native' && !('actor' in call.input)), true)
})

test('background status preserves planned ranges and an uncertain write retries the identical operation', { skip: !existsSync(browserPath) }, async t => {
  const { page, calls, doc } = await fixture(t)
  await page.getByRole('button', { name: '清空计划窗口', exact: true }).click()
  doc.sources[0].window = [{ startEventId: 'request20', endEventId: 'reply40' }]; doc.sources[0].title = '模型更新后的来源'; doc.revision++
  await page.getByRole('button', { name: '刷新状态', exact: true }).click()
  await page.getByText('模型更新后的来源', { exact: true }).waitFor()
  await page.getByText('空窗口：不新增来源正文。', { exact: true }).waitFor()
  let interrupted
  await page.route('**/native-context', async route => {
    const body = route.request().postDataJSON()
    if (body.operation === 'window-set' && !interrupted) { interrupted = body; await route.abort('failed') }
    else await route.continue()
  })
  await page.getByRole('button', { name: '保存窗口', exact: true }).click()
  await page.getByRole('button', { name: '核对并重试原操作', exact: true }).click()
  await page.getByText('当前披露窗口', { exact: true }).waitFor()
  const writes = calls.filter(call => call.operation === 'window-set')
  assert.equal(writes.length, 1); assert.deepEqual(interrupted, writes[0]); assert.deepEqual(doc.sources[0].window, [])
})

test('missing host capability offers a disabled control without issuing native context calls', { skip: !existsSync(browserPath) }, async t => {
  const { page, calls } = await fixture(t, false)
  const button = page.getByRole('button', { name: '管理原生上下文', exact: true })
  await button.waitFor(); assert.equal(await button.isDisabled(), true); assert.equal(calls.length, 0)
})

test('source release explicitly selects its holder instead of silently releasing all shared holders', { skip: !existsSync(browserPath) }, async t => {
  const { page, calls, doc } = await fixture(t)
  doc.materials[0].referenceIds.push('other-independent-reference')
  await page.getByRole('button', { name: '刷新状态', exact: true }).click()
  await page.getByRole('button', { name: '释放整份共享材料（2 条引用）', exact: true }).waitFor()
  await page.getByRole('button', { name: '释放此来源材料', exact: true }).click()
  await page.getByText('等待释放', { exact: true }).waitFor()
  const operation = calls.findLast(call => call.operation === 'release')
  assert.equal(operation.input.referenceId, 'ref'); assert.equal('materialIds' in operation.input, false)
})
