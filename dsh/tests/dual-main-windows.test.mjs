import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile, mkdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'

async function fixture(stall = false) {
 const main = await build({stdin:{contents:`import {mountMainWindows} from '${process.env.MAIN_WINDOWS_SOURCE ?? '../dsh-better-sidebar/src/client/main-windows.ts'}'; window.mountMainWindows=mountMainWindows; import React from 'react'; import {createRoot} from 'react-dom/client'; window.React=React;window.createRoot=createRoot;`,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,format:'iife'})
 const graph = await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import App from './src/maintenance/ManagedGraphApp.tsx';createRoot(document.getElementById('root')).render(<App/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,outfile:'graph.js',format:'iife',jsx:'automatic'})
 const hostScript = await readFile('dsh/lib/client.js','utf8')
 const documents = new Map()
 const boot = `const byId={a:{id:'a',title:'合成会话 A'},b:{id:'b',title:'合成会话 B'},c:{id:'c',title:'合成会话 C'}};let current=window.parent===window?'a':undefined;let phase=window.parent===window?'ready':'pending';const listeners=new Set();const drafts={};const input=document.querySelector('textarea');input.addEventListener('input',()=>drafts[current]=input.value);const sessions={list:{getSnapshot:()=>({current,byId:phase==='ready'?byId:{},phase}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}},open:id=>{if(phase!=='ready'||!byId[id])throw Error('sessions.select: unknown session '+id);current=id;document.querySelector('[data-title]').textContent=byId[id]?.title;input.value=drafts[id]||'';for(const fn of listeners)fn()},refresh:async()=>{}};window.fixtureSessions=sessions;window.fixtureReady=()=>{phase='ready';for(const fn of listeners)fn()};if(phase==='pending'&&!${stall})setTimeout(window.fixtureReady,900);document.querySelectorAll('[data-session]').forEach(el=>el.onclick=()=>sessions.open(el.dataset.session));document.querySelector('[data-right-toggle]').onclick=()=>{document.querySelector('.fixture-frame').style.gridTemplateColumns='170px minmax(0,1fr) 200px'};const ctx={sessions,get:()=>undefined,effect:fn=>fn(),inject:()=>({dispose(){}}),slots:{inject:(name,fn)=>fn(),register:(opts,Component)=>{const el=document.createElement('div');document.querySelector('.wSkVaW_headerActions').append(el);createRoot(el).render(React.createElement(Component));return()=>el.remove()}}};if(current)document.querySelector('[data-title]').textContent=byId[current].title;mountMainWindows(sessions);window.__ModuleLoader__={load:module=>module.factory(name=>React).apply(ctx)};`
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
  res.setHeader('content-type','text/html');res.end(`<html><head><meta charset="utf-8"><style>body{margin:0;--dsw-alias-bg-base:#fff;--dsw-alias-label-primary:#111;--dsw-alias-border-l2:#ddd;font:14px system-ui}#root{height:100vh}.fixture-frame{display:grid;grid-template-columns:170px minmax(0,1fr) 46px;height:100%}.fixture-column{min-width:0}[data-slot]{display:contents}.wSkVaW_root{position:relative;height:100%}.wSkVaW_headerActions{display:flex;position:static}header{position:static;height:56px;display:flex;align-items:center;padding:0 12px;border-bottom:1px solid #ddd}aside{background:#f5f5f5;padding:10px;display:flex;flex-direction:column;gap:10px}textarea{box-sizing:border-box;margin:20px;width:calc(100% - 40px);height:130px}button{cursor:pointer}</style></head><body><div id="root"><div class="fixture-frame"><aside aria-label="左侧会话栏"><button data-session=a>合成会话 A</button><button data-session=b>合成会话 B</button><button data-session=c>合成会话 C</button></aside><main class="fixture-column"><div data-slot="main"><div data-slot="main.conversation"><div class="wSkVaW_root"><header class="wSkVaW_header"><span data-title>等待会话目录</span><div class="wSkVaW_headerActions"></div></header><textarea aria-label="合成输入框" placeholder="输入留在此窗口"></textarea></div></div></div></main><aside aria-label="右侧栏"><button data-right-toggle>展开</button></aside></div></div><script src="/main.js"></script><script>${boot}</script><script src="/host.js"></script></body></html>`)
 })
 server.listen(0,'127.0.0.1');await once(server,'listening');return {server,url:`http://127.0.0.1:${server.address().port}`}
}
if(process.argv.includes('--serve')){const {url}=await fixture();console.log('SYNTHETIC_PREVIEW '+url)}
else test('two real browser clients isolate drafts and modes, route navigation and preserve the sidebars',async t=>{
 const {server,url}=await fixture();const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{await browser.close();server.close();await once(server,'close')});await page.goto(url)
 const left=page.frameLocator('iframe[title="左主窗口"]');await left.locator('[data-title]').filter({hasText:'合成会话 A'}).waitFor();assert.equal(await left.locator('body').evaluate(()=>window.fixtureSessions.list.getSnapshot().current),'a');await left.getByRole('textbox',{name:'合成输入框'}).fill('left draft')
 const switchBox=await left.locator('.dsh-td-header-switch').boundingBox();const headerBox=await left.locator('header').boundingBox();assert.ok(switchBox.y>=headerBox.y&&switchBox.y+switchBox.height<=headerBox.y+headerBox.height,JSON.stringify({switchBox,headerBox}));
 assert.equal(await left.getByRole('complementary',{name:'左侧会话栏'}).isVisible(),false);assert.equal(await left.getByRole('complementary',{name:'右侧栏'}).isVisible(),false);
 const childWidth=await left.locator('.fixture-column').evaluate(el=>({width:el.getBoundingClientRect().width,viewport:innerWidth}));assert.ok(Math.abs(childWidth.width-childWidth.viewport)<2,JSON.stringify(childWidth));
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
 await page.evaluate(()=>document.querySelector('.fixture-column').innerHTML='<h1>合成设置页</h1>');await page.locator('.dsh-main-windows').waitFor({state:'hidden'});assert.equal(await page.locator('.fixture-column').evaluate(el=>el.inert),false);assert.deepEqual(errors,[])
})

if (!process.argv.includes('--serve')) test('unconfirmed child leaves native conversation usable and retries after delayed catalog recovery', async t => {
 const {server,url}=await fixture(true);const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});t.after(async()=>{await browser.close();server.close();await once(server,'close')});
 await page.clock.install();await page.goto(url);await page.frameLocator('iframe[title="左主窗口"]').locator('header').waitFor({state:'attached'});await page.waitForTimeout(100);
 assert.equal(await page.locator('.dsh-main-windows').isVisible(),false);assert.equal(await page.locator('.fixture-column').evaluate(el=>Boolean(el.inert)),false);
 await page.getByRole('textbox',{name:'合成输入框',exact:true}).fill('native remains usable');
 await page.clock.fastForward(16000);await page.getByRole('status').filter({hasText:'双窗未能打开目标会话'}).waitFor();
 await page.getByRole('button',{name:'重试双窗'}).click();
 await page.frameLocator('iframe[title="左主窗口"]').locator('body').evaluate(()=>window.fixtureReady());
 await page.locator('.dsh-main-windows').waitFor({state:'visible'});
 assert.equal(await page.frameLocator('iframe[title="左主窗口"]').locator('body').evaluate(()=>window.fixtureSessions.list.getSnapshot().current),'a');
 // A reloaded child must handshake again rather than inherit a stale parent ready flag.
 const frame=page.frames().find(frame=>frame.url().includes('dsh-main-pane=left'));await frame.goto(frame.url());
 assert.equal(await page.locator('.fixture-column').evaluate(el=>Boolean(el.inert)),false);
 await page.frameLocator('iframe[title="左主窗口"]').locator('body').evaluate(()=>window.fixtureReady());
 await page.locator('.dsh-main-windows').waitFor({state:'visible'});
 assert.equal(await page.frameLocator('iframe[title="左主窗口"]').locator('body').evaluate(()=>window.fixtureSessions.list.getSnapshot().current),'a');
})
