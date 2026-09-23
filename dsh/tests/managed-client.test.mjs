import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const tick = async () => { for (let step = 0; step < 5; step++) await new Promise(resolve => setImmediate(resolve)) }
function fixture(prepare = async () => ({ preparedCount: 1 }), options = {}) {
  const events = new Map(), messages = [], calls = []
  const waits = [], timers = new Map()
  let workspaces = options.workspaces
  let core = options.core ?? { features: ['graph-reference-actions-v1', 'session-main-graph-v2'], prepareGraphReferences: async (id, refs) => { calls.push(['prepare', id, [...refs]]); return prepare(id, refs) } }
  let coreCallback, coreDisposers = []
  const releaseCore = () => { for (const dispose of coreDisposers.splice(0)) dispose?.() }
  const addEventListener = (type, callback) => { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(callback) }
  const removeEventListener = (type, callback) => events.get(type)?.delete(callback)
  const dispatch = (type, event = {}) => { for (const fn of events.get(type) ?? []) fn(event) }
  const element = () => ({ style: {}, remove() {}, append() {}, addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], children: [] })
  const frameWindow = { postMessage: message => messages.push(message) }, frame = { ...element(), contentWindow: frameWindow }
  const overlay = element(), canvasSwitch = element()
  const host = { ...element(), querySelector: selector => selector === 'iframe' ? frame : selector === '.dsh-td-overlay' ? overlay : canvasSwitch }
  const document = { body: element(), head: element(), createElement: tag => tag === 'div' ? host : element(), querySelectorAll: () => [], querySelector: () => null }
  const origin = 'http://127.0.0.1:9000'
  let module, onSessionChange, dispose
  const window = { addEventListener, removeEventListener, setTimeout: fn => { const id = {}; timers.set(id, fn); return id }, clearTimeout: id => timers.delete(id), matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), __ModuleLoader__: { load: input => { module = input.factory(() => ({})) } } }
  runInNewContext(source, { window, document, location: { origin }, console, ResizeObserver: class { disconnect() {} observe() {} }, AbortController, AbortSignal, Error, URLSearchParams, fetch: options.fetch ?? (async url => ({ ok: true, json: async () => url.endsWith('/version') ? { version: 'fixture' } : { nativeSessionId: 'native-target', logicalSessionId: 'logical-target' } })) })
  const ctx = {
    sessions: { list: { getSnapshot: () => ({ current: 'native-target', byId: { 'native-target': { displayTitle: 'Target' } } }), subscribe: fn => { onSessionChange = fn; return () => calls.push(['unsubscribe']) } }, refresh: async () => { calls.push(['refresh']); await options.refresh?.() }, open: async id => calls.push(['open', id]) },
    // Cordis may return a different service proxy for each access.
    get: name => name === 'workspaces' ? workspaces : core && Object.create(core),
    inject: (names, callback) => {
      if (names.includes('annotationCore')) {
        coreCallback = () => callback({ get: ctx.get, effect: fn => { coreDisposers.push(fn()) } })
        if (core) coreCallback()
        return { dispose: releaseCore }
      }
      if (!names.includes('workspaces')) return { dispose() {} }
      const wait = { callback, disposed: false, dispose() { this.disposed = true } }
      waits.push(wait)
      options.injectReady?.(() => { workspaces = options.injectReadyValue; callback(ctx) })
      return wait
    },
    slots: { inject() {} }, effect: fn => { dispose = fn() },
  }
  module.apply(ctx)
  const request = async (input, operation = 'open-session') => {
    dispatch('message', { origin, source: frameWindow, data: { source: 'dsh-thoughtdag', type: 'td:managed-request', requestId: 'fixture-request', operation, input } })
    await tick()
    return messages.findLast(message => message.type === 'td:managed-result')
  }
  return { calls, messages, waits, timers, dispatch, sessionChange: () => onSessionChange(), dispose: () => dispose(), request,
    replaceCore(value) { releaseCore(); core = value; if (core) coreCallback() },
    publishWorkspaces(value) { workspaces = value; for (const wait of waits) if (!wait.disposed) wait.callback(ctx) } }
}

test('reference deletion and session archive invalidations reach the graph, and subscriptions are disposed', () => {
  const f = fixture()
  f.dispatch('dsh-session-references-changed', { detail: { sessionId: 'source-session' } })
  f.sessionChange()
  assert.deepEqual(f.messages.map(message => message.type), ['td:graph-changed', 'td:current-session', 'td:graph-changed'])
  f.dispose()
  f.dispatch('dsh-session-references-changed')
  assert.equal(f.messages.length, 3)
  assert.deepEqual(f.calls, [['unsubscribe']])
})

test('start prepares exact fixed reference identities before native open without sending or editing text', async () => {
  const f = fixture()
  const result = await f.request({ nativeSessionId: 'native-target', referenceIds: ['ref-b', 'ref-a', 'ref-b'] })
  assert.equal(result.ok, true)
  assert.deepEqual(f.calls, [['prepare', 'native-target', ['ref-a', 'ref-b']], ['refresh'], ['open', 'native-target']])
  f.dispose()
})

test('failed sent-reference admission reports the source error and never proceeds to open', async () => {
  const f = fixture(async () => { throw new Error('引用已发送，但当前实例缺少对应提交记录；请先恢复会话引用数据') })
  const result = await f.request({ nativeSessionId: 'native-target', referenceIds: ['ref-a'] })
  assert.equal(result.ok, false)
  assert.match(result.error, /缺少对应提交记录/)
  assert.deepEqual(f.calls, [['prepare', 'native-target', ['ref-a']]])
  f.dispose()
})

const workspaceService = { list: { getSnapshot: () => ({ items: [{ workspaceId: 'workspace', sessionIds: ['native-target'] }] }) } }

test('available workspaces need no injection and delayed readiness releases its one-shot fiber', async () => {
  const ready = fixture(undefined, { workspaces: workspaceService })
  assert.equal((await ready.request({}, 'current-workspace')).result.workspaceId, 'workspace')
  assert.equal(ready.waits.length, 0)
  ready.dispose()
  const delayed = fixture()
  assert.equal(await delayed.request({}, 'current-workspace'), undefined)
  assert.equal(delayed.waits.length, 1)
  delayed.publishWorkspaces(workspaceService)
  await tick()
  assert.equal(delayed.messages.at(-1).result.workspaceId, 'workspace')
  assert.equal(delayed.waits[0].disposed, true)
  assert.equal(delayed.timers.size, 0)
  delayed.dispose()
})

test('synchronous injection readiness still releases the returned fiber', async () => {
  const f = fixture(undefined, { injectReady: callback => callback(), injectReadyValue: workspaceService })
  assert.equal((await f.request({}, 'current-workspace')).result.workspaceId, 'workspace')
  assert.equal(f.waits[0].disposed, true)
  assert.equal(f.timers.size, 0)
  f.dispose()
})

test('workspace waits settle on timeout or unload and leave no retained fiber or timer', async () => {
  const timeout = fixture()
  await timeout.request({}, 'current-workspace')
  for (const callback of timeout.timers.values()) callback()
  await tick()
  assert.equal(timeout.messages.at(-1).ok, false)
  assert.match(timeout.messages.at(-1).error, /工作区/)
  assert.equal(timeout.waits[0].disposed, true)
  assert.equal(timeout.timers.size, 0)
  timeout.dispose()
  const unloaded = fixture()
  await unloaded.request({}, 'current-workspace')
  unloaded.dispose()
  await tick()
  assert.equal(unloaded.waits[0].disposed, true)
  assert.equal(unloaded.timers.size, 0)
  assert.equal(unloaded.messages.length, 0)
})

test('unloading aborts graph requests and ignores a late response even when transport ignores cancellation', async () => {
  let finish, signal
  const f = fixture(undefined, { fetch: async (url, options) => {
    if (url.endsWith('/version')) return { ok: true, json: async () => ({ version: 'fixture' }) }
    signal = options.signal
    return new Promise(resolve => { finish = () => resolve({ ok: true, json: async () => ({ nativeSessionId: 'native-target' }) }) })
  } })
  await f.request({ nativeSessionId: 'native-target' })
  f.dispose()
  assert.equal(signal.aborted, true)
  finish()
  await tick()
  assert.deepEqual(f.calls, [['unsubscribe']])
  assert.equal(f.messages.length, 0)
})

test('unloading during reference preparation or session refresh prevents subsequent native open', async () => {
  let prepared
  const f = fixture(() => new Promise(resolve => { prepared = resolve }))
  await f.request({ nativeSessionId: 'native-target', referenceIds: ['ref-a'] })
  f.dispose(); prepared(); await tick()
  assert.deepEqual(f.calls, [['prepare', 'native-target', ['ref-a']], ['unsubscribe']])
  assert.equal(f.messages.length, 0)
  let refreshed
  const g = fixture(undefined, { refresh: () => new Promise(resolve => { refreshed = resolve }) })
  await g.request({ nativeSessionId: 'native-target' })
  g.dispose(); refreshed(); await tick()
  assert.deepEqual(g.calls, [['refresh'], ['unsubscribe']])
  assert.equal(g.messages.length, 0)
})

test('Core replacement during graph resolution rejects stale staging and a retry uses the new provider', async () => {
  let finish, pending = true
  const invoked = []
  const provider = name => ({ features: ['graph-reference-actions-v1'], addCrossSessionReference: async () => { invoked.push(name); return { added: true } } })
  const f = fixture(undefined, { core: provider('old'), fetch: async url => {
    if (url.endsWith('/version')) return { ok: true, json: async () => ({ version: 'fixture' }) }
    if (!pending) return { ok: true, json: async () => ({ nativeSessionId: 'native-target' }) }
    return new Promise(resolve => { finish = () => { pending = false; resolve({ ok: true, json: async () => ({ nativeSessionId: 'native-target' }) }) } })
  } })
  await f.request({ targetSessionId: 'native-target', capture: {} }, 'stage-reference')
  f.replaceCore(provider('new')); finish(); await tick()
  assert.equal(f.messages.at(-1).ok, false)
  assert.match(f.messages.at(-1).error, /重新加载/)
  assert.deepEqual(invoked, [])
  assert.equal((await f.request({ targetSessionId: 'native-target', capture: {} }, 'stage-reference')).ok, true)
  assert.deepEqual(invoked, ['new'])
  f.dispose()
})

test('Core removal during reference lookup prevents deletion through the old provider', async () => {
  let resolved, deletes = 0
  const f = fixture(undefined, { core: {
    features: ['graph-reference-actions-v1'],
    resolveReferenceLink: () => new Promise(resolve => { resolved = resolve }),
    deleteReferenceLink: () => { deletes++ },
  } })
  await f.request({ nativeSessionId: 'native-target', referenceId: 'ref-a' }, 'delete-reference')
  f.replaceCore(undefined)
  resolved({ state: 'sent', setId: 'set-a', referenceId: 'ref-a' })
  await tick()
  assert.equal(f.messages.at(-1).ok, false)
  assert.match(f.messages.at(-1).error, /重新加载/)
  assert.equal(deletes, 0)
  f.dispose()
})
