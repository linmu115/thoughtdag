// dsh-thoughtdag client half — the lightest possible browser shim.
// It renders a "对话 | 思维图" switch in the harness session header (slot
// `conversation.session.header.actions`, so it flows with the native layout
// on desktop and mobile web instead of floating over the title bar) and, on
// "思维图", shows a full-screen SAME-ORIGIN iframe at /thoughtdag/ (the SPA
// is served by the host half on the same web server — no CORS, no second
// origin) with the same view switch, since the overlay covers the header.
// All conversation smarts live inside the ThoughtDAG app; this file
// only opens the door and forwards the current session id so the canvas can
// offer to mirror it.
//
// Same pattern as dsh-synapse: window.__ModuleLoader__.load with a module
// whose inject lists the client services it reads (sessions, slots) and whose
// apply registers the switch. react is a platform seed module — the loader's
// require answers it from the module table, so the bundle stays tiny.

window.__ModuleLoader__.load({
  id: 'dsh-thoughtdag',
  factory: require => {
    const module = { exports: {} }
    const React = require('react')

    module.exports.inject = ['sessions', 'slots']
    module.exports.apply = ctx => {
      const currentSession = () => {
        const snapshot = ctx.sessions.list.getSnapshot()
        const id = snapshot.current
        if (id === undefined) return null
        const session = snapshot.byId[id]
        return session === undefined ? null : { id, title: session.displayTitle ?? null, cwd: session.cwd ?? null }
      }

      const style = document.createElement('style')
      style.textContent = '.dsh-td-switch{display:inline-flex;gap:2px;border:1px solid var(--dsw-alias-border-l2,#0000001a);border-radius:999px;background:var(--dsw-alias-bg-base,#fff);padding:3px}.dsh-td-switch button{height:26px;border:0;border-radius:999px;background:transparent;padding:0 11px;color:var(--dsw-alias-label-secondary,#61666b);font:600 12px var(--dsw-font-family,system-ui,sans-serif);cursor:pointer;white-space:nowrap}.dsh-td-switch button:hover{background:var(--dsw-alias-bg-multi-select,#f5f6f7);color:var(--dsw-alias-label-primary,#0f1115)}.dsh-td-switch button.active{background:var(--dsw-alias-label-primary,#0f1115);color:var(--dsw-alias-label-primary-inverted,#fff)}.dsh-td-switch button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color,#4176e6);outline-offset:2px}.dsh-td-canvas-switch{position:fixed;z-index:130;box-sizing:border-box}.dsh-td-overlay{position:fixed;z-index:100;inset:0;background:var(--dsw-alias-bg-base,#fff)}.dsh-td-overlay[hidden]{display:none}.dsh-td-overlay iframe{display:block;width:100%;height:100%;border:0}'
      document.head.append(style)

      const overlayHost = document.createElement('div')
      overlayHost.innerHTML = '<section class="dsh-td-overlay" hidden><div class="dsh-td-switch dsh-td-canvas-switch" role="group" aria-label="view switch"><button type="button" data-view="dialog" aria-pressed="false">对话</button><button type="button" data-view="map" class="active" aria-pressed="true">思维图</button></div><iframe title="ThoughtDAG" data-src="/thoughtdag/"></iframe></section>'
      document.body.append(overlayHost)
      const overlay = overlayHost.querySelector('.dsh-td-overlay')
      const frame = overlayHost.querySelector('iframe')
      const canvasSwitch = overlayHost.querySelector('.dsh-td-canvas-switch')
      const canvasButtons = overlayHost.querySelectorAll('.dsh-td-canvas-switch button')

      // the plugin's version, for the canvas's update dialog and release history
      let pluginVersion = null
      fetch('/thoughtdag/api/version').then(r => (r.ok ? r.json() : null)).then(j => { if (j && typeof j.version === 'string') pluginVersion = j.version }).catch(() => {})

      // store 由本文件自行维护：setMap 是唯一写入口，既切 overlay（命令式
      // DOM），也通知 Switch 组件重渲染 active 态。不走 slots 的 store/inject
      // 契约——session 作用域槽位的 inject 首参是 sessionKey，签名因槽位而异。
      let mapState = false
      const mapSubscribers = new Set()
      let headerSwitch = null
      const positionCanvasSwitch = () => {
        if (!headerSwitch?.isConnected) return
        const { left, top, width, height } = headerSwitch.getBoundingClientRect()
        if (!width || !height) return
        Object.assign(canvasSwitch.style, { left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px' })
      }
      const updateCanvasPosition = () => { if (mapState) positionCanvasSwitch() }
      // Keep the covered header as the layout anchor, including sidebar/viewport changes.
      const positionObserver = new ResizeObserver(updateCanvasPosition)
      window.addEventListener('resize', updateCanvasPosition)
      window.addEventListener('scroll', updateCanvasPosition, true)

      const send = (type, payload) => frame.contentWindow?.postMessage({ source: 'dsh-thoughtdag', type, ...payload }, location.origin)
      const graphJson = async path => {
        const response = await fetch('/thoughtdag/api/managed/' + path, { credentials: 'same-origin', signal: AbortSignal.timeout(25_000) })
        const value = await response.json()
        if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : value.error?.message || '会话图暂不可用')
        return value
      }
      const annotation = () => {
        let core
        try { core = ctx.get('annotationCore') } catch { /* optional plugin */ }
        if (!core?.features?.includes('graph-reference-actions-v1')) throw new Error('当前注释插件尚未接入会话图，请安装匹配版本')
        return core
      }
      const managedAction = async (operation, input) => {
        if (!input || typeof input !== 'object') throw new Error('操作内容无效')
        if (operation === 'session-sticker') {
          if (!document.querySelector('[data-dsh-knowledge="1"]')) throw new Error('请启用匹配的会话贴纸插件')
          setMap(false)
          window.dispatchEvent(new CustomEvent('dsh-session-sticker-open', { detail: input.capture ? { sessionId: input.capture.sourceSessionId, anchorId: input.capture.anchorId, selectedText: input.capture.selectedText } : undefined }))
          return { opened: true }
        }
        if (operation === 'open-session') {
          if (typeof input.nativeSessionId !== 'string' || !input.nativeSessionId.trim() || input.nativeSessionId.length > 256 || input.logicalSessionId !== undefined)
            throw new Error('打开会话需要已解析的原生会话身份，请重新选择目标')
          const target = await graphJson('resolve?nativeSessionId=' + encodeURIComponent(input.nativeSessionId))
          const referenceIds = input.referenceIds ?? []
          if (!Array.isArray(referenceIds) || referenceIds.length > 50 || referenceIds.some(id => typeof id !== 'string' || !id || id.length > 256)) throw new Error('入向引用身份无效或超过单次额度')
          const uniqueReferences = [...new Set(referenceIds)].sort()
          if (uniqueReferences.length) {
            const core = annotation()
            if (!core.features.includes('session-main-graph-v2') || typeof core.prepareGraphReferences !== 'function') throw new Error('请更新注释插件以准备主干入向引用')
            await core.prepareGraphReferences(target.nativeSessionId, uniqueReferences)
          }
          await ctx.sessions.refresh()
          await ctx.sessions.open(target.nativeSessionId)
          setMap(false); syncCurrent()
          return target
        }
        if (operation === 'add-reference') {
          const core = annotation()
          const target = await graphJson('resolve?nativeSessionId=' + encodeURIComponent(input.targetSessionId))
          setMap(false)
          return core.addCrossSessionReference(target.nativeSessionId, input.capture, { operationId: input.operationId })
        }
        if (operation === 'delete-reference') {
          const core = annotation()
          const target = await graphJson('resolve?nativeSessionId=' + encodeURIComponent(input.nativeSessionId))
          const link = await core.resolveReferenceLink(target.nativeSessionId, input.referenceId)
          if (!link) return { deleted: true }
          if (link.state === 'deleted') return { deleted: true }
          return core.deleteReferenceLink(target.nativeSessionId, link.setId, link.referenceId)
        }
        if (operation === 'open-object') {
          if (!['annotation', 'obsidian-links', 'stickers'].includes(input.namespace)) throw new Error('未接入这个对象类型')
          const detail = await graphJson('object?' + new URLSearchParams({ namespace: input.namespace, objectId: input.objectId }))
          if (detail.object.deleted) throw new Error('该对象已删除')
          const body = detail.object.content.body
          if (input.namespace === 'stickers') {
            const target = await graphJson('resolve?logicalSessionId=' + encodeURIComponent(body.logicalSessionId))
            await ctx.sessions.refresh(); await ctx.sessions.open(target.nativeSessionId); setMap(false); syncCurrent()
            return { opened: true }
          }
          if (input.namespace === 'obsidian-links') {
            if (body.kind === 'note-link' && body.note?.noteId) {
              location.href = 'obsidian://deepharness-note?' + new URLSearchParams({ vault: body.note.vaultId, note: body.note.noteId, ...(body.note.blockId ? { block: body.note.blockId } : {}) })
              return { opened: true }
            }
            if (typeof body.vaultId !== 'string' || typeof body.notePath !== 'string') throw new Error('笔记位置不可用')
            const file = body.notePath + (typeof body.blockId === 'string' ? '#^' + body.blockId : '')
            location.href = 'obsidian://open?' + new URLSearchParams({ vault: body.vaultId, file })
            return { opened: true }
          }
          const logical = detail.object.content.references?.[0]?.logicalSessionId
          const query = logical ? { logicalSessionId: logical } : { nativeSessionId: body.sessionId }
          const target = await graphJson('resolve?' + new URLSearchParams(query))
          const core = annotation()
          setMap(false)
          const opened = await core.openAnnotationInSession(target.nativeSessionId, body.setId)
          if (!opened) throw new Error('来源注释暂不可用')
          return { opened: true }
        }
        throw new Error('不支持这个画布操作')
      }

      const syncCurrent = () => {
        const session = currentSession()
        send('td:current-session', { session })
      }
      const referencesChanged = () => send('td:graph-changed', {})
      const sessionsChanged = () => { syncCurrent(); referencesChanged() }
      window.addEventListener('dsh-session-references-changed', referencesChanged)
      window.addEventListener('focus', referencesChanged)
      const stopSessionChanges = ctx.sessions.list.subscribe?.(sessionsChanged)

      const setMap = map => {
        if (map === mapState) return
        positionObserver.disconnect()
        if (map) {
          headerSwitch = [...document.querySelectorAll('.dsh-td-header-switch')].find(element => element.getBoundingClientRect().width > 0)
          if (!headerSwitch) return
          positionCanvasSwitch()
          for (let element = headerSwitch; element && element !== document.body; element = element.parentElement) positionObserver.observe(element)
        }
        mapState = map
        overlay.hidden = !map
        for (const button of canvasButtons) {
          const active = (button.dataset.view === 'map') === map
          button.classList.toggle('active', active)
          button.setAttribute('aria-pressed', String(active))
        }
        for (const notify of mapSubscribers) notify(map)
        if (!map) { send('td:view', { shown: false }); return }
        // the SPA boots on first open, never while hidden: a canvas that
        // measures itself inside a display:none frame fits its view to a 0×0
        // box and shows nothing when revealed
        if (!frame.src) frame.src = frame.dataset.src + (pluginVersion ? (frame.dataset.src.includes('?') ? '&' : '?') + 'dv=' + encodeURIComponent(pluginVersion) : '')
        syncCurrent()
        send('td:view', { shown: true })
        // let the SPA boot, then re-sync so its listener is ready
        window.setTimeout(() => { syncCurrent(); send('td:view', { shown: true }) }, 400)
      }

      const Switch = () => {
        const [map, setMapState] = React.useState(mapState)
        React.useEffect(() => {
          const notify = m => setMapState(m)
          mapSubscribers.add(notify)
          return () => { mapSubscribers.delete(notify) }
        }, [])
        return React.createElement('div', { className: 'dsh-td-switch dsh-td-header-switch', role: 'group', 'aria-label': 'view switch', 'aria-hidden': map ? 'true' : undefined },
          React.createElement('button', {
            type: 'button', 'data-view': 'dialog', className: map ? '' : 'active', 'aria-pressed': String(!map),
            onClick: () => setMap(false),
          }, '对话'),
          React.createElement('button', {
            type: 'button', 'data-view': 'map', className: map ? 'active' : '', 'aria-pressed': String(map),
            onClick: () => setMap(true),
          }, '思维图'),
        )
      }

      ctx.slots.inject('conversation.session.header.actions', () =>
        ctx.slots.register({
          name: 'conversation.session.header.actions',
          id: 'thoughtdag-view-switch',
          order: 90,
        }, Switch),
      )

      for (const button of canvasButtons) button.addEventListener('click', () => setMap(button.dataset.view === 'map'))

      const receive = event => {
        if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'dsh-thoughtdag') return
        if (event.data.type === 'td:managed-request') {
          const { requestId, operation, input } = event.data
          if (typeof requestId !== 'string' || !requestId || requestId.length > 256) return
          void managedAction(operation, input).then(
            result => send('td:managed-result', { requestId, ok: true, result }),
            error => send('td:managed-result', { requestId, ok: false, error: error instanceof Error ? error.message : '操作失败' }),
          )
          return
        }
        if (event.data.type === 'td:close') return setMap(false)
        if (event.data.type === 'td:request-current') return syncCurrent()
        // the canvas forked or continued a session: stage it and go back to the
        // chat, which now shows exactly the context the canvas produced
        if (event.data.type === 'td:select-session' && typeof event.data.session === 'string') {
          // 0.1.2 renamed the selector: the ISessions contract exposes open(id);
          // older runtimes (0.1.1) still call it select
          const select = ctx.sessions.open ?? ctx.sessions.select
          select.call(ctx.sessions, event.data.session)
          if (event.data.close !== false) setMap(false)
          syncCurrent()
        }
      }
      window.addEventListener('message', receive)
      ctx.effect(() => () => {
        window.removeEventListener('message', receive)
        window.removeEventListener('dsh-session-references-changed', referencesChanged)
        window.removeEventListener('focus', referencesChanged)
        if (typeof stopSessionChanges === 'function') stopSessionChanges()
        window.removeEventListener('resize', updateCanvasPosition)
        window.removeEventListener('scroll', updateCanvasPosition, true)
        positionObserver.disconnect()
        overlayHost.remove(); style.remove(); mapSubscribers.clear()
      }, 'thoughtdag: client lifetime')
    }

    return module.exports
  },
})
