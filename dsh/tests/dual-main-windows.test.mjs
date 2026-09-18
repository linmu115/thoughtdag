import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile, mkdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'

async function fixture() {
 const main = await build({stdin:{contents:`import {mountMainWindows} from '../dsh-better-sidebar/src/client/main-windows.ts'; window.mountMainWindows=mountMainWindows; import React from 'react'; import {createRoot} from 'react-dom/client'; window.React=React;window.createRoot=createRoot;`,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,format:'iife'})
 const graph = await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import App from './src/maintenance/ManagedGraphApp.tsx';createRoot(document.getElementById('root')).render(<App/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,outfile:'graph.js',format:'iife',jsx:'automatic'})
 const hostScript = await readFile('dsh/lib/client.js','utf8')
 const documents = new Map()
 const boot = `const byId={a:{id:'a',title:'合成会话 A'},b:{id:'b',title:'合成会话 B'},c:{id:'c',title:'合成会话 C'}};let current='a';const listeners=new Set();const drafts={};const input=document.querySelector('textarea');input.addEventListener('input',()=>drafts[current]=input.value);const sessions={list:{getSnapshot:()=>({current,byId}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}},open:async id=>{current=id;document.querySelector('[data-title]').textContent=byId[id]?.title;input.value=drafts[id]||'';for(const fn of listeners)fn()},refresh:async()=>{}};window.fixtureSessions=sessions;document.querySelectorAll('[data-session]').forEach(el=>el.onclick=()=>sessions.open(el.dataset.session));document.querySelector('[data-right-toggle]').onclick=()=>{document.querySelector('[data-dsh-frame]').style.gridTemplateColumns='170px minmax(0,1fr) 200px'};const ctx={sessions,get:()=>undefined,effect:fn=>fn(),inject:()=>({dispose(){}}),slots:{inject:(name,fn)=>fn(),register:(opts,Component)=>{const el=document.createElement('div');document.querySelector('header').append(el);createRoot(el).render(React.createElement(Component));return()=>el.remove()}}};mountMainWindows(sessions);window.__ModuleLoader__={load:module=>module.factory(name=>React).apply(ctx)};`
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://fixture')
  if(url.pathname==='/main.js'){res.setHeader('content-type','text/javascript');res.end(main.outputFiles[0].text);return}
  if(url.pathname==='/host.js'){res.setHeader('content-type','text/javascript');res.end(hostScript);return}
  if(url.pathname==='/graph.js'||url.pathname==='/graph.css'){res.setHeader('content-type',url.pathname.endsWith('css')?'text/css':'text/javascript');res.end(graph.outputFiles.find(f=>f.path.endsWith(url.pathname.slice(1))).text);return}
  if(url.pathname==='/thoughtdag/api/version'){res.setHeader('content-type','application/json');res.end(JSON.stringify({version:'synthetic'}));return}
  if(url.pathname.startsWith('/thoughtdag/api/managed/')){
   let body='';for await(const chunk of req)body+=chunk;const input=body?JSON.parse(body):{};const op=url.pathname.split('/').at(-1);let result
   if(op==='status')result={protocolVersion:2,capabilities:{storage:true,sessions:true,mainGraph:true,references:true}}
   else if(op==='resolve'){const id=url.searchParams.get('nativeSessionId')||url.searchParams.get('logicalSessionId');result={logicalSessionId:id,nativeSessionId:id,title:'合成会话 '+id.toUpperCase()}}
   else if(op==='ensure'){const id=input.logicalSessionId;if(!documents.has(id))documents.set(id,{objectId:id,revision:1,title:'合成会话 '+id.toUpperCase(),graph:{managedSchema:2,ownerSessionId:id,nodes:[],edges:[]}});result=documents.get(id)}
   else if(op==='save'){const id=input.objectId||input.graph.ownerSessionId;const old=documents.get(id);result={objectId:id,revision:(old?.revision||0)+1,title:input.title||old?.title,graph:input.graph};documents.set(id,result)}
   else if(op==='canvas')result=documents.get(url.searchParams.get('objectId'))
   else if(op==='relations')result={items:[],nextCursor:null}
   else {res.statusCode=404;result={error:'unsupported synthetic operation'}}
   res.setHeader('content-type','application/json');res.end(JSON.stringify(result));return
  }
  if(url.pathname==='/thoughtdag/'){res.setHeader('content-type','text/html');res.end('<html><head><meta charset="utf-8"><link rel="stylesheet" href="/graph.css"></head><body style="margin:0"><div id="root"></div><script src="/graph.js"></script></body></html>');return}
  res.setHeader('content-type','text/html');res.end(`<html><head><meta charset="utf-8"><style>body{margin:0;--dsw-alias-bg-base:#fff;--dsw-alias-label-primary:#111;--dsw-alias-border-l2:#ddd;font:14px system-ui}#root{height:100vh}[data-dsh-frame]{display:grid;grid-template-columns:170px minmax(0,1fr) 46px;height:100%}[data-pane=conversation]{min-width:0}header{position:relative;height:56px;display:flex;align-items:center;padding:0 12px;border-bottom:1px solid #ddd}aside{background:#f5f5f5;padding:10px;display:flex;flex-direction:column;gap:10px}textarea{box-sizing:border-box;margin:20px;width:calc(100% - 40px);height:130px}button{cursor:pointer}</style></head><body><div id="root"><div data-dsh-frame><aside aria-label="左侧会话栏"><button data-session=a>合成会话 A</button><button data-session=b>合成会话 B</button><button data-session=c>合成会话 C</button></aside><main data-pane="conversation"><header data-slot="conversation.session.header"><span data-title>合成会话 A</span></header><textarea aria-label="合成输入框" placeholder="输入留在此窗口"></textarea></main><aside aria-label="右侧栏"><button data-right-toggle>展开</button></aside></div></div><script src="/main.js"></script><script>${boot}</script><script src="/host.js"></script></body></html>`)
 })
 server.listen(0,'127.0.0.1');await once(server,'listening');return {server,url:`http://127.0.0.1:${server.address().port}`}
}
if(process.argv.includes('--serve')){const {url}=await fixture();console.log('SYNTHETIC_PREVIEW '+url)}
else test('two real browser clients isolate drafts and modes, route navigation and preserve the sidebars',async t=>{
 const {server,url}=await fixture();const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{await browser.close();server.close();await once(server,'close')});await page.goto(url)
 const left=page.frameLocator('iframe[title="左主窗口"]');await left.getByRole('textbox',{name:'合成输入框'}).fill('left draft')
 await page.getByRole('button',{name:'并排打开',exact:true}).click();const right=page.frameLocator('iframe[title="右主窗口"]');await right.getByRole('textbox',{name:'合成输入框'}).fill('right draft')
 await page.getByRole('button',{name:'合成会话 B',exact:true}).click();await right.locator('[data-title]').filter({hasText:'合成会话 B'}).waitFor();assert.equal(await left.getByRole('textbox',{name:'合成输入框'}).inputValue(),'left draft')
 await right.getByRole('button',{name:'思维图',exact:true}).first().click();const canvas=right.frameLocator('iframe[title="ThoughtDAG"]');await canvas.getByRole('textbox',{name:'主干名称'}).waitFor();await page.waitForTimeout(200);assert.equal(await canvas.getByRole('textbox',{name:'主干名称'}).inputValue(),'合成会话 B')
 await left.getByRole('textbox',{name:'合成输入框'}).click();assert.equal(await page.evaluate(()=>window.fixtureSessions.list.getSnapshot().current),'a');
 await canvas.locator('.mg-flow').click({position:{x:80,y:80}});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.fixtureSessions.list.getSnapshot().current),'b');
 await page.getByRole('button',{name:'合成会话 C',exact:true}).click();await canvas.getByRole('textbox',{name:'主干名称'}).filter({visible:true}).waitFor();await canvas.locator('input[aria-label="主干名称"]').evaluate(async el=>{for(let i=0;i<50&&el.value!=='合成会话 C';i++)await new Promise(r=>setTimeout(r,100))});assert.equal(await canvas.getByRole('textbox',{name:'主干名称'}).inputValue(),'合成会话 C',await canvas.locator('.mg-banner').allTextContents())
 assert.equal(await canvas.getByRole('button',{name:'新建未绑定草稿',exact:true}).count(),0);assert.equal(await left.getByRole('textbox',{name:'合成输入框'}).inputValue(),'left draft')
 await page.getByRole('button',{name:'展开',exact:true}).click();const box=await page.locator('.dsh-main-windows').boundingBox();assert.ok(box.x>=169&&box.x+box.width<=1241,JSON.stringify(box))
 await page.getByRole('button',{name:'收起右窗',exact:true}).click();await page.getByRole('button',{name:'并排打开',exact:true}).click();assert.equal(await canvas.getByRole('textbox',{name:'主干名称'}).inputValue(),'合成会话 C')
 await mkdir('work',{recursive:true});await page.screenshot({path:'work/dual-main-windows.png'});
 await page.evaluate(()=>document.querySelector('[data-pane=conversation]').innerHTML='<h1>合成设置页</h1>');await page.locator('.dsh-main-windows').waitFor({state:'hidden'});assert.equal(await page.locator('[data-pane=conversation]').evaluate(el=>el.inert),false);assert.deepEqual(errors,[])
})
