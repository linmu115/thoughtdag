import test from 'node:test'
import assert from 'node:assert/strict'
import { initDshAppearance } from './theme.ts'

function appearanceFixture(mode = 'same-origin') {
  const origin = 'http://127.0.0.1:9000'
  const callbacks = new Map()
  const mediaCallbacks = new Set()
  const observers = []
  const preferences = { reads: 0, writes: 0 }
  const makeStyle = () => ({ setProperty(name, value) { this[name] = value } })
  const element = () => ({ style: makeStyle(), dataset: {}, attributes: new Set(), hasAttribute(name) { return this.attributes.has(name) } })
  const localRoot = element(), localBody = element(), hostRoot = element(), hostBody = element()
  const hostTokens = { '--dsw-alias-bg-base': '#fafafa', '--dsw-alias-label-primary': '#16171a', '--dsw-alias-brand-primary-new-colorprimary-new-color': '#437def' }
  const localTokens = { '--dsw-alias-bg-base': '#d00', '--dsw-alias-label-primary': '#0d0' }
  const anchor = { bottom: 42, getBoundingClientRect() { return { bottom: this.bottom, height: 30 } } }
  const media = { matches: false, addEventListener(name, callback) { assert.equal(name, 'change'); mediaCallbacks.add(callback) }, removeEventListener(name, callback) { assert.equal(name, 'change'); mediaCallbacks.delete(callback) } }
  const localDocument = { documentElement: localRoot, body: localBody, querySelector: () => null }
  const parent = { location: { origin }, document: { documentElement: hostRoot, body: hostBody, querySelector: selector => selector === '.dsh-td-canvas-switch' ? anchor : null }, matchMedia: () => media,
    getComputedStyle: body => { assert.equal(body, hostBody); return { fontFamily: 'Host Interface Font', getPropertyValue: name => hostTokens[name] ?? '' } } }
  const value = { location: { origin }, document: localDocument, parent, matchMedia: () => media,
    getComputedStyle: body => { assert.equal(body, localBody); return { fontFamily: 'Standalone Font', getPropertyValue: name => localTokens[name] ?? '' } },
    addEventListener(name, callback) { if (!callbacks.has(name)) callbacks.set(name, new Set()); callbacks.get(name).add(callback) },
    removeEventListener(name, callback) { callbacks.get(name)?.delete(callback) } }
  Object.defineProperty(value, 'localStorage', { get() { preferences.reads++; throw new Error('Managed appearance must not read standalone preferences') }, set() { preferences.writes++; throw new Error('Managed appearance must not write standalone preferences') } })
  Object.defineProperty(parent, 'localStorage', { get() { preferences.reads++; throw new Error('Host preferences are not an appearance API') } })
  if (mode === 'no-parent') value.parent = value
  if (mode === 'cross-origin') value.parent = { get location() { throw new DOMException('Blocked cross-origin parent', 'SecurityError') }, get document() { throw new Error('Cross-origin document must never be read') } }
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = new Map(); this.disconnected = false; observers.push(this) }
    observe(target, options) { this.targets.set(target, options) }
    disconnect() { this.disconnected = true; this.targets.clear() }
  }
  const saved = new Map(['window', 'document', 'location', 'MutationObserver'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.assign(globalThis, { window: value, document: localDocument, location: value.location, MutationObserver: Observer })
  return { value, parent, media, observers, callbacks, mediaCallbacks, preferences, localRoot, localBody, hostRoot, hostBody, hostTokens, anchor,
    mutation(target) { for (const observer of observers) if (observer.targets.has(target)) observer.callback([{ target }]) },
    systemChange(dark) { media.matches = dark; for (const callback of [...mediaCallbacks]) callback({ matches: dark }) },
    message(event) { for (const callback of [...(callbacks.get('message') ?? [])]) callback(event) },
    restore() { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] } } }
}

test('direct and cross-origin canvases follow the system without borrowing standalone appearance preferences', () => {
  for (const mode of ['no-parent', 'cross-origin']) {
    const fixture = appearanceFixture(mode)
    let dispose
    try {
      fixture.media.matches = true
      dispose = initDshAppearance()
      assert.equal(fixture.localRoot.dataset.theme, 'dark')
      assert.equal(fixture.localRoot.style['--dsh-bg'], '#151517')
      assert.notEqual(fixture.localBody.style.fontFamily, 'Standalone Font')
      assert.equal(fixture.observers[0].targets.size, 0)
      fixture.systemChange(false)
      assert.equal(fixture.localRoot.style.colorScheme, 'light')
      assert.equal(fixture.localBody.style.background, '#fff')
      assert.deepEqual(fixture.preferences, { reads: 0, writes: 0 })
    } finally { dispose?.(); fixture.restore() }
  }
})

test('embedded canvas tracks DSH body and root theme changes while host choice overrides the system', () => {
  const fixture = appearanceFixture()
  let dispose
  try {
    fixture.media.matches = true
    dispose = initDshAppearance()
    assert.equal(fixture.localRoot.dataset.theme, 'light')
    assert.equal(fixture.localRoot.style['--dsh-bg'], '#fafafa')
    assert.equal(fixture.localBody.style.fontFamily, 'Host Interface Font')
    assert.equal(fixture.observers[0].targets.has(fixture.hostRoot), true)
    assert.equal(fixture.observers[0].targets.has(fixture.hostBody), true)
    fixture.hostBody.attributes.add('data-ds-dark-theme')
    fixture.hostTokens['--dsw-alias-bg-base'] = '#19191c'
    fixture.hostTokens['--dsw-alias-label-primary'] = '#f4f5f6'
    fixture.mutation(fixture.hostBody)
    assert.equal(fixture.localRoot.dataset.theme, 'dark')
    assert.equal(fixture.localBody.style.background, '#19191c')
    assert.equal(fixture.localBody.style.color, '#f4f5f6')
    fixture.systemChange(false)
    assert.equal(fixture.localRoot.style.colorScheme, 'dark')
    fixture.hostTokens['--dsw-alias-brand-primary-new-colorprimary-new-color'] = '#83adff'
    fixture.mutation(fixture.hostRoot)
    assert.equal(fixture.localRoot.style['--dsh-accent'], '#83adff')
    assert.deepEqual(fixture.preferences, { reads: 0, writes: 0 })
  } finally { dispose?.(); fixture.restore() }
})

test('view refresh is restricted to the actual same-origin host and disposal releases every observer and listener', () => {
  const fixture = appearanceFixture()
  let dispose
  try {
    dispose = initDshAppearance()
    assert.equal(fixture.localRoot.style['--dsh-header-inset'], '54px')
    const view = { source: 'dsh-thoughtdag', type: 'td:view', shown: true }
    fixture.anchor.bottom = 90
    fixture.message({ source: {}, origin: fixture.value.location.origin, data: view })
    fixture.message({ source: fixture.parent, origin: 'https://unrelated.invalid', data: view })
    assert.equal(fixture.localRoot.style['--dsh-header-inset'], '54px')
    fixture.message({ source: fixture.parent, origin: fixture.value.location.origin, data: view })
    assert.equal(fixture.localRoot.style['--dsh-header-inset'], '102px')
    dispose()
    assert.equal(fixture.observers[0].disconnected, true)
    assert.equal(fixture.observers[0].targets.size, 0)
    assert.equal(fixture.mediaCallbacks.size, 0)
    assert.equal(fixture.callbacks.get('message')?.size, 0)
    fixture.anchor.bottom = 200
    fixture.hostTokens['--dsw-alias-bg-base'] = '#123456'
    fixture.mutation(fixture.hostBody)
    fixture.systemChange(true)
    fixture.message({ source: fixture.parent, origin: fixture.value.location.origin, data: view })
    assert.equal(fixture.localRoot.style['--dsh-header-inset'], '102px')
    assert.equal(fixture.localRoot.style['--dsh-bg'], '#fafafa')
  } finally { dispose?.(); fixture.restore() }
})
