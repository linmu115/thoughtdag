import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'

const browserPath = process.env.THOUGHTDAG_TEST_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
async function fixture(t, { failOpen = false, failStage = false } = {}) {
  const calls = []
  const output = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {SessionStickerPanel} from './src/maintenance/SessionStickerPanel.tsx';createRoot(document.getElementById('root')).render(<SessionStickerPanel capture={{sourceSessionId:'source-native',anchorId:'message',messageId:'message',role:'assistant',selectedText:'selected source',occurrence:2}} onClose={()=>window.closedPanel=true}/>);`, loader:'tsx', resolveDir:process.cwd() }, outfile:'app.js', bundle:true, write:false, format:'iife', jsx:'automatic', define:{'process.env.NODE_ENV':'"production"'} })
  const server = createServer(async (req,res) => {
    if (req.url === '/app.js' || req.url === '/app.css') { res.setHeader('content-type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(output.outputFiles.find(file=>basename(file.path)===req.url.slice(1)).text);return }
    if (req.url.startsWith('/maintenance-knowledge/api/')) {
      const op=req.url.split('/').at(-1),chunks=[];for await(const chunk of req)chunks.push(chunk)
      const input=JSON.parse(Buffer.concat(chunks).toString());calls.push({op,input})
      let value
      if(op==='create-workspaces')value={items:[{id:'workspace',title:'测试工作区'}],nextCursor:null}
      else if(op==='resolve')value={logicalSessionId:'source-logical',nativeSessionId:'source-native'}
      else if(op==='preview')value={sourceVersionId:'fixed-version',capture:{sourceSessionId:'source-native',messageId:'message',anchorId:'message',role:'assistant'}}
      else if(op==='create-session')value={logicalSessionId:'new-logical',nativeSessionId:'new-native',title:'新会话'}
      else if(op==='write')value={status:'written'}
      else {res.writeHead(500);res.end(JSON.stringify({error:{message:'Unexpected '+op}}));return}
      res.setHeader('content-type','application/json');res.end(JSON.stringify(value));return
    }
    res.setHeader('content-type','text/html');
    if(req.url==='/') {res.end(`<html><body><iframe src="/frame" style="width:100%;height:95vh;border:0"></iframe><script>
      window.actions=[];window.openFailures=${Number(failOpen)};window.stageFailures=${Number(failStage)};
      window.addEventListener('message',event=>{const m=event.data;if(m.type!=='td:managed-request')return;window.actions.push(m);const fails=m.operation==='open-session'?window.openFailures-- >0:m.operation==='stage-reference'?window.stageFailures-- >0:false;event.source.postMessage({source:'dsh-thoughtdag',type:'td:managed-result',requestId:m.requestId,ok:!fails,error:'合成失败，可重试',result:m.operation==='stage-reference'?{referenceId:'fixed-reference'}:{opened:true}},location.origin)});
      </script></body></html>`);return}
    res.end(`<html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script>window.actions=window.parent.actions;</script><script src="/app.js"></script></body></html>`)

  })
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const browser=await chromium.launch({executablePath:browserPath,headless:true}),hostPage=await browser.newPage()
  const errors=[];hostPage.on('pageerror',e=>errors.push(e.message))
  t.after(async()=>{await browser.close();server.close();await once(server,'close');assert.deepEqual(errors,[])})
  await hostPage.goto(`http://127.0.0.1:${server.address().port}`)
  const page=hostPage.frames().find(frame=>frame.url().endsWith('/frame'));assert.ok(page)
  await page.getByRole('button',{name:'测试工作区',exact:true}).waitFor()
  return {page,calls,create:async()=>{await page.getByRole('button',{name:'测试工作区',exact:true}).click();await page.getByRole('button',{name:'在所选工作区新建会话',exact:true}).click()}}
}

test('creation loads only workspaces, stages fixed upstream into a new downstream, then opens without sending', {skip:!existsSync(browserPath)}, async t=>{
  const {page,calls,create}=await fixture(t)
  assert.deepEqual(calls.map(c=>c.op),['create-workspaces'])
  assert.equal(await page.getByText('选择已有会话',{exact:true}).count(),0)
  await create();await page.waitForFunction(()=>window.closedPanel)
  const actions=await page.evaluate(()=>window.actions)
  assert.deepEqual(actions.map(a=>a.operation),['stage-reference','open-session'])
  assert.equal(actions[0].input.targetSessionId,'new-native')
  assert.equal(actions[0].input.capture.sourceSessionId,'source-native')
  assert.equal(actions[0].input.capture.expectedSourceVersionId,'fixed-version')
  assert.equal(actions[0].input.capture.occurrence,2)
  const write=calls.find(c=>c.op==='write').input
  assert.equal(write.body.logicalSessionId,'new-logical')
  assert.equal(write.body.source.logicalSessionId,'source-logical')
  assert.equal(write.body.source.referenceId,'fixed-reference')
  assert.equal(calls.filter(c=>c.op==='create-session').length,1)
  assert.equal(calls.some(c=>['list','directory'].includes(c.op)),false)
})

for(const failure of ['failOpen','failStage'])test(`retry after ${failure} reuses the new session and never silently succeeds`,{skip:!existsSync(browserPath)},async t=>{
  const {page,calls,create}=await fixture(t,{[failure]:true})
  await create();await page.getByRole('alert').waitFor()
  assert.equal(await page.evaluate(()=>Boolean(window.closedPanel)),false)
  if(failure==='failStage')assert.equal(calls.some(c=>c.op==='write'),false)
  await page.getByRole('button',{name:'在所选工作区新建会话',exact:true}).click()
  await page.waitForFunction(()=>window.closedPanel)
  assert.equal(calls.filter(c=>c.op==='create-session').length,1)
  assert.equal(calls.filter(c=>c.op==='write').length,1)
  const stages=await page.evaluate(()=>window.actions.filter(a=>a.operation==='stage-reference'))
  assert.equal(new Set(stages.map(a=>a.input.operationId)).size,1)
})
