import test from 'node:test'
import assert from 'node:assert/strict'
import { captureFromPreview, managedApi, parentRequest } from './client.ts'

function fakeWindow() {
  const listeners = new Set()
  const requests = []
  const parent = { postMessage: (message, origin) => requests.push({ message, origin }) }
  const value = { location: { origin: 'http://127.0.0.1:9000' }, parent, setTimeout, clearTimeout, addEventListener: (_name, listener) => listeners.add(listener), removeEventListener: (_name, listener) => listeners.delete(listener) }
  return { value, requests, listeners, deliver: (event) => { for (const listener of [...listeners]) listener(event) } }
}

test('parent actions reject forged origins, frames and request identifiers', async () => {
  const previous = globalThis.window
  const fake = fakeWindow()
  globalThis.window = fake.value
  try {
    const promise = parentRequest('open-session', { nativeSessionId: 'target' })
    const { message, origin } = fake.requests[0]
    assert.equal(origin, fake.value.location.origin)
    const response = { source: 'dsh-thoughtdag', type: 'td:managed-result', requestId: message.requestId, ok: true, result: { opened: true } }
    fake.deliver({ origin: 'https://unrelated.invalid', source: fake.value.parent, data: response })
    fake.deliver({ origin, source: {}, data: response })
    fake.deliver({ origin, source: fake.value.parent, data: { ...response, requestId: 'other' } })
    assert.equal(fake.listeners.size, 1)
    fake.deliver({ origin, source: fake.value.parent, data: response })
    assert.deepEqual(await promise, { opened: true })
    assert.equal(fake.listeners.size, 0)
  } finally { globalThis.window = previous }
})

test('failed native actions do not look like successfully created references', async () => {
  const previous = globalThis.window
  const fake = fakeWindow()
  globalThis.window = fake.value
  try {
    const promise = parentRequest('add-reference', { targetSessionId: 'target' })
    fake.deliver({ origin: fake.value.location.origin, source: fake.value.parent, data: { source: 'dsh-thoughtdag', type: 'td:managed-result', requestId: fake.requests[0].message.requestId, ok: false, error: '引用能力未配置' } })
    await assert.rejects(promise, /未配置/)
    assert.equal(fake.listeners.size, 0)
  } finally { globalThis.window = previous }
})

test('material preview preserves fixed version and anchor over HTTP', async () => {
  const previousWindow = globalThis.window
  const previousFetch = globalThis.fetch
  globalThis.window = fakeWindow().value
  let seen
  globalThis.fetch = async (url, options) => { seen = { url, options }; return new Response(JSON.stringify({ items: [] }), { status: 200 }) }
  try {
    await managedApi.preview('logical-source', undefined, 'fixed-version', 'completed-anchor')
    assert.equal(seen.url.origin, 'http://127.0.0.1:9000')
    assert.equal(seen.url.searchParams.get('sourceVersionId'), 'fixed-version')
    assert.equal(seen.url.searchParams.get('sourceAnchorId'), 'completed-anchor')
    assert.equal(seen.options.credentials, 'same-origin')
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch }
})

test('CAS conflict is returned to preserve local edits rather than thrown away', async () => {
  const previousWindow = globalThis.window
  const previousFetch = globalThis.fetch
  globalThis.window = fakeWindow().value
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 'conflict', conflict: { current: { revision: 3 } } }), { status: 409 })
  try {
    await assert.rejects(managedApi.save({ objectId: 'canvas', expectedRevision: 2, graph: { managedSchema: 2, ownerSessionId: null, nodes: [], edges: [] } }), error => error.status === 409)
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch }
})

test('subsequent material pages use the immutable cursor without a second selection', async () => {
  const previousWindow = globalThis.window
  const previousFetch = globalThis.fetch
  globalThis.window = fakeWindow().value
  let seen
  globalThis.fetch = async (url) => { seen = url; return new Response(JSON.stringify({ items: [] }), { status: 200 }) }
  try {
    await managedApi.preview('logical-source', 'fixed-page-cursor', 'fixed-version', 'completed-anchor')
    assert.equal(seen.searchParams.get('cursor'), 'fixed-page-cursor')
    assert.equal(seen.searchParams.has('sourceVersionId'), false)
    assert.equal(seen.searchParams.has('sourceAnchorId'), false)
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch }
})

test('selection capture binds the version that the user actually previewed', () => {
  const capture = captureFromPreview({ sourceVersionId: 'version-seen', capture: { sourceSessionId: 'source', anchorId: 'reply-end', selectedText: 'whole answer', role: 'assistant', occurrence: 0 } }, 'selected focus')
  assert.equal(capture.expectedSourceVersionId, 'version-seen')
  assert.equal(capture.selectedText, 'selected focus')
  assert.equal(capture.anchorId, 'reply-end')
})

test('context requests send current native identity through same-origin bridge and support cancellation', async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch
  globalThis.window = fakeWindow().value
  const controller = new AbortController()
  let seen
  globalThis.fetch = async (url, options) => { seen = { url, options }; return new Response(JSON.stringify({ revision: 2 })) }
  try {
    await managedApi.nativeContext('current-native', 'requests', { referenceId: 'fixed-reference' }, controller.signal)
    assert.equal(seen.url.pathname, '/thoughtdag/api/managed/native-context')
    assert.equal(seen.options.credentials, 'same-origin')
    assert.deepEqual(JSON.parse(seen.options.body), { nativeSessionId: 'current-native', operation: 'requests', input: { referenceId: 'fixed-reference' } })
    controller.abort()
    assert.equal(seen.options.signal.aborted, true)
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch }
})

test('request timeout reports uncertain outcome with a recoverable sync instruction', async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch
  globalThis.window = fakeWindow().value
  globalThis.fetch = async () => { throw new DOMException('timed out', 'TimeoutError') }
  try { await assert.rejects(managedApi.canvas('main'), error => error.status === 0 && /超时/.test(error.message) && /同步主干后重试/.test(error.message)) }
  finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch }
})

test('network failure preserves a readable recovery instruction', async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch
  globalThis.window = fakeWindow().value
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  try { await assert.rejects(managedApi.canvas('main'), error => error.status === 0 && /无法连接/.test(error.message) && /本地布局仍保留/.test(error.message)) }
  finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch }
})
