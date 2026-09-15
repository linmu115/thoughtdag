import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
function fixture(prepare = async () => ({ preparedCount: 1 })) {
  const events = new Map(), messages = [], calls = []
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
  const window = { addEventListener, removeEventListener, setTimeout, clearTimeout, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), __ModuleLoader__: { load: input => { module = input.factory(() => ({})) } } }
  runInNewContext(source, { window, document, location: { origin }, ResizeObserver: class { disconnect() {} observe() {} }, AbortSignal, Error, URLSearchParams, fetch: async url => ({ ok: true, json: async () => url.endsWith('/version') ? { version: 'fixture' } : { nativeSessionId: 'native-target', logicalSessionId: 'logical-target' } }) })
  const ctx = {
    sessions: { list: { getSnapshot: () => ({ current: 'native-target', byId: { 'native-target': { displayTitle: 'Target' } } }), subscribe: fn => { onSessionChange = fn; return () => calls.push(['unsubscribe']) } }, refresh: async () => calls.push(['refresh']), open: async id => calls.push(['open', id]) },
    get: () => ({ features: ['graph-reference-actions-v1', 'session-main-graph-v2'], prepareGraphReferences: async (id, refs) => { calls.push(['prepare', id, [...refs]]); return prepare(id, refs) } }),
    slots: { inject() {} }, effect: fn => { dispose = fn() },
  }
  module.apply(ctx)
  const request = async input => {
    dispatch('message', { origin, source: frameWindow, data: { source: 'dsh-thoughtdag', type: 'td:managed-request', requestId: 'fixture-request', operation: 'open-session', input } })
    for (let step = 0; step < 5; step++) await new Promise(resolve => setImmediate(resolve))
    return messages.findLast(message => message.type === 'td:managed-result')
  }
  return { calls, messages, dispatch, sessionChange: () => onSessionChange(), dispose: () => dispose(), request }
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
