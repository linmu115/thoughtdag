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
      const lifetime = new AbortController()
      const assertActive = () => lifetime.signal.throwIfAborted()
      let coreEpoch = 0
      const assertCoreEpoch = epoch => {
        assertActive()
        if (epoch !== coreEpoch) throw new Error('引用服务已重新加载，请重试操作')
      }
      const currentSession = () => {
        const snapshot = ctx.sessions.list.getSnapshot()
        const id = snapshot.current
        if (id === undefined) return null
        const session = snapshot.byId[id]
        const readable = value => typeof value === 'string' && value.trim() && value.trim() !== id ? value.trim() : null
        return session === undefined ? null : { id, title: readable(session.title) ?? readable(session.displayTitle), cwd: session.cwd ?? null }
      }

      const style = document.createElement('style')
      style.textContent = `
        .dsh-td-switch{position:relative;isolation:isolate;display:inline-grid;grid-template-columns:repeat(2,1fr);gap:2px;flex-shrink:0;border:1px solid var(--dsw-alias-border-l2,#0000001a);border-radius:999px;corner-shape:round;background:var(--dsw-alias-bg-base,#fff);padding:3px}
        .dsh-td-switch::before{content:"";position:absolute;z-index:-1;inset:3px auto 3px 3px;width:calc((100% - 8px)/2);border-radius:999px;corner-shape:round;background:var(--dsw-alias-label-primary,#0f1115);transform:translateX(0);transition:transform 320ms cubic-bezier(.22,.8,.25,1);pointer-events:none}
        .dsh-td-switch[data-view="map"]::before{transform:translateX(calc(100% + 2px))}
        .dsh-td-switch button{position:relative;height:26px;border:0;border-radius:999px;corner-shape:round;background:transparent;padding:0 11px;color:var(--dsw-alias-label-secondary,#61666b);font:600 12px var(--dsw-font-family,system-ui,sans-serif);cursor:pointer;white-space:nowrap;transition:color 160ms ease}
        .dsh-td-switch button:hover{color:var(--dsw-alias-label-primary,#0f1115)}
        .dsh-td-switch button.active{color:var(--dsw-alias-label-primary-inverted,#fff)}
        .dsh-td-switch button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color,#4176e6);outline-offset:2px}
        header:has(.dsh-td-header-switch){position:relative}
        .dsh-td-header-switch{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2}
        .dsh-td-canvas-switch{position:fixed;z-index:130;box-sizing:border-box}
        .dsh-td-overlay{position:fixed;z-index:100;background:var(--dsw-alias-bg-base,#fff);opacity:0;pointer-events:none;transition:opacity 180ms cubic-bezier(.2,.65,.3,1)}
        .dsh-td-overlay.is-open{opacity:1;pointer-events:auto}
        .dsh-td-overlay[data-transitioning]{will-change:opacity}
        .dsh-td-overlay[hidden]{display:none}
        .dsh-td-overlay iframe{display:block;width:100%;height:100%;border:0}
        @media(prefers-reduced-motion:reduce){.dsh-td-overlay,.dsh-td-switch::before,.dsh-td-switch button{transition:none}}
      `
      document.head.append(style)

      const overlayHost = document.createElement('div')
      overlayHost.innerHTML = '<section class="dsh-td-overlay" hidden><div class="dsh-td-switch dsh-td-canvas-switch" data-view="dialog" role="group" aria-label="view switch"><button type="button" data-view="dialog" class="active" aria-pressed="true">对话</button><button type="button" data-view="map" aria-pressed="false">思维图</button></div><iframe title="ThoughtDAG" data-src="/thoughtdag/"></iframe></section>'
      document.body.append(overlayHost)
      const overlay = overlayHost.querySelector('.dsh-td-overlay')
      const frame = overlayHost.querySelector('iframe')
      const canvasSwitch = overlayHost.querySelector('.dsh-td-canvas-switch')
      const canvasButtons = overlayHost.querySelectorAll('.dsh-td-canvas-switch button')

      // the plugin's version, for the canvas's update dialog and release history
      let pluginVersion = null
      fetch('/thoughtdag/api/version', { signal: lifetime.signal }).then(r => (r.ok ? r.json() : null)).then(j => { if (!lifetime.signal.aborted && j && typeof j.version === 'string') pluginVersion = j.version }).catch(() => {})

      // store 由本文件自行维护：setMap 是唯一写入口，既切 overlay（命令式
      // DOM），也通知 Switch 组件重渲染 active 态。不走 slots 的 store/inject
      // 契约——session 作用域槽位的 inject 首参是 sessionKey，签名因槽位而异。
      let mapState = false
      const mapSubscribers = new Set()
      const conversationColumn = element => {
        const host = element?.closest('[data-slot="main.conversation"], [data-slot="conversation"]')
        if (!host) return element?.closest('[data-pane="conversation"]')
        let column = host.parentElement
        while (column && getComputedStyle(column).display === 'contents') column = column.parentElement
        return column
      }
      let headerSwitch = null
      let positionFrame = null
      const positionCanvasSwitch = () => {
        if (!headerSwitch?.isConnected) {
          headerSwitch = [...document.querySelectorAll('.dsh-td-header-switch')].find(element => element.getBoundingClientRect().width > 0)
          positionObserver.disconnect()
          for (let element = headerSwitch; element && element !== document.body; element = element.parentElement) positionObserver.observe(element)
        }
        if (!headerSwitch?.isConnected) return
        const { left, top, width, height } = headerSwitch.getBoundingClientRect()
        if (!width || !height) return
        // The injected switch is inside the native semantic header. Measure its
        // actual borders, rather than depending on generated CSS module names.
        const header = headerSwitch.closest('header')
        const box = header?.getBoundingClientRect()
        const center = conversationColumn(headerSwitch)
        const bounds = center?.getBoundingClientRect() ?? box
        if (bounds) Object.assign(overlay.style, { left: bounds.left + 'px', top: bounds.top + 'px', width: bounds.width + 'px', height: bounds.height + 'px' })
        const rail = box?.width > 0 ? Math.max(0, box.left) : 0
        const bottom = box?.height > 0 ? box.bottom : Math.max(76, top + height + 28)
        const title = header?.querySelector('nav button:disabled') ?? header?.querySelector('nav')
        const titleBox = title?.getBoundingClientRect()
        const titleStyle = title ? getComputedStyle(title) : null
        const titleLeft = titleBox ? titleBox.left + (parseFloat(titleStyle?.paddingLeft) || 0) : (box?.left ?? 0) + 28
        const titleTop = titleBox ? titleBox.top + (parseFloat(titleStyle?.paddingTop) || 0) : (box?.top ?? 0) + 14
        const values = {
          left: (bounds ? bounds.left + (bounds.width-width)/2 : left) + 'px', top: top + 'px', width: width + 'px', height: height + 'px',
          '--dsh-left-rail': rail + 'px', '--dsh-chrome-height': bottom + 'px',
          '--dsh-chrome-top': Math.max(0, box?.top ?? 0) + 'px',
          '--dsh-title-room': Math.max(0, left - rail - 32) + 'px',
          '--dsh-canvas-header-height': Math.max(48, bottom - (bounds?.top ?? 0)) + 'px',
          '--dsh-canvas-title-left': Math.max(0, titleLeft - (bounds?.left ?? 0)) + 'px',
          '--dsh-canvas-title-top': Math.max(0, titleTop - (bounds?.top ?? 0)) + 'px',
          '--dsh-canvas-title-size': (parseFloat(titleStyle?.fontSize) || 14) + 'px',
          '--dsh-canvas-title-line': (parseFloat(titleStyle?.lineHeight) || 20) + 'px',
          '--dsh-canvas-title-weight': titleStyle?.fontWeight || '500',
        }
        for (const [name, value] of Object.entries(values)) {
          if (canvasSwitch.style.getPropertyValue(name) !== value) canvasSwitch.style.setProperty(name, value)
        }
      }
      const updateCanvasPosition = () => {
        if (!mapState || positionFrame !== null) return
        positionFrame = window.requestAnimationFrame(() => { positionFrame = null; if (mapState) positionCanvasSwitch() })
      }
      // Keep the covered header as the layout anchor, including sidebar/viewport changes.
      const positionObserver = new ResizeObserver(updateCanvasPosition)
      window.addEventListener('resize', updateCanvasPosition)
      window.addEventListener('scroll', updateCanvasPosition, true)

      const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
      let transitionTimer = null
      const blockedRoots = new Map()
      const blockConversation = block => {
        if (block) {
          const child = conversationColumn(headerSwitch)
          if (child && !blockedRoots.has(child)) { blockedRoots.set(child, child.inert); child.inert = true }
        } else {
          for (const [element, inert] of blockedRoots) element.inert = inert
          blockedRoots.clear()
        }
      }
      const settleTransition = () => {
        if (transitionTimer !== null) window.clearTimeout(transitionTimer)
        transitionTimer = null
        overlay.removeAttribute('data-transitioning')
        if (!mapState) overlay.hidden = true
      }
      const transitionEnded = event => { if (event.target === overlay && event.propertyName === 'opacity') settleTransition() }
      overlay.addEventListener('transitionend', transitionEnded)
      const motionChanged = () => { if (motion.matches) settleTransition() }
      motion.addEventListener('change', motionChanged)

      const send = (type, payload) => { if (!lifetime.signal.aborted) frame.contentWindow?.postMessage({ source: 'dsh-thoughtdag', type, ...payload }, location.origin) }
      const graphJson = async path => {
        assertActive()
        const response = await fetch('/thoughtdag/api/managed/' + path, { credentials: 'same-origin', signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(25_000)]) })
        const value = await response.json()
        assertActive()
        if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : value.error?.message || '会话图暂不可用')
        return value
      }
      const annotation = () => {
        let core
        try { core = ctx.get('annotationCore') } catch { /* optional plugin */ }
        if (!core?.features?.includes('graph-reference-actions-v1')) throw new Error('当前注释插件尚未接入会话图，请安装匹配版本')
        return core
      }
      // 「当前会话在哪个工作区」由宿主自己的工作区投影回答：工作区行的 sessionIds
      // 就是归属关系，不需要用户再选一次，也不需要自己比对路径。
      // 宿主加载顺序可能让 workspaces 尚未就绪，所以这里等它就绪再解析。
      const currentWorkspace = session => new Promise((resolve, reject) => {
        let settled = false, fiber, timer
        const cleanup = () => {
          window.clearTimeout(timer)
          lifetime.signal.removeEventListener('abort', cancelled)
          // An already available dependency may invoke the callback before
          // inject returns its fiber; release it after that assignment.
          Promise.resolve().then(() => fiber?.dispose()).catch(error => console.warn('[thoughtdag] workspace wait cleanup failed', error))
        }
        const finish = (error, result) => {
          if (settled) return
          settled = true
          cleanup()
          if (error) reject(error)
          else resolve(result)
        }
        const cancelled = () => finish(lifetime.signal.reason)
        const read = () => {
          const id = session?.id ?? ctx.sessions.list.getSnapshot().current
          if (id === undefined) throw new Error('尚未选择会话，无法确定工作区')
          let items = []
          try { items = ctx.get('workspaces')?.list?.getSnapshot()?.items ?? [] } catch { items = [] }
          const owned = items.find(row => Array.isArray(row.sessionIds) && row.sessionIds.includes(id))
          if (owned?.workspaceId) return { workspaceId: owned.workspaceId, sessionId: id }
          // 没有登记的工作区时退回会话自己的目录：cwd 让宿主把会话建在同一目录。
          if (typeof session?.cwd === 'string' && session.cwd.trim()) return { workspaceId: null, cwd: session.cwd, sessionId: id }
          throw new Error('当前会话尚未归属任何工作区，无法确定新会话的位置')
        }
        const settle = () => {
          try { assertActive(); finish(undefined, read()) } catch (error) { finish(error) }
        }
        if (lifetime.signal.aborted) { cancelled(); return }
        lifetime.signal.addEventListener('abort', cancelled, { once: true })
        let available
        try { available = ctx.get?.('workspaces') } catch { /* wait for optional service */ }
        if (available !== undefined || typeof ctx.inject !== 'function') { settle(); return }
        timer = window.setTimeout(settle, 25_000)
        try {
          fiber = ctx.inject(['workspaces'], () => { settle() })
          if (!fiber) settle()
        } catch (error) { finish(error) }
      })
      const managedAction = async (operation, input) => {
        assertActive()
        const operationCoreEpoch = coreEpoch
        if (!input || typeof input !== 'object') throw new Error('操作内容无效')
        if (operation === 'current-workspace') return currentWorkspace(currentSession())
        if (operation === 'open-session') {
          if (typeof input.nativeSessionId !== 'string' || !input.nativeSessionId.trim() || input.nativeSessionId.length > 256 || input.logicalSessionId !== undefined)
            throw new Error('打开会话需要已解析的原生会话身份，请重新选择目标')
          const target = await graphJson('resolve?nativeSessionId=' + encodeURIComponent(input.nativeSessionId))
          assertActive()
          const referenceIds = input.referenceIds ?? []
          if (!Array.isArray(referenceIds) || referenceIds.length > 50 || referenceIds.some(id => typeof id !== 'string' || !id || id.length > 256)) throw new Error('入向引用身份无效或超过单次额度')
          const uniqueReferences = [...new Set(referenceIds)].sort()
          if (uniqueReferences.length) {
            assertCoreEpoch(operationCoreEpoch)
            const core = annotation()
            if (!core.features.includes('session-main-graph-v2') || typeof core.prepareGraphReferences !== 'function') throw new Error('请更新注释插件以准备主干入向引用')
            await core.prepareGraphReferences(target.nativeSessionId, uniqueReferences)
            assertCoreEpoch(operationCoreEpoch)
          }
          assertActive()
          await ctx.sessions.refresh()
          assertActive()
          if (uniqueReferences.length) assertCoreEpoch(operationCoreEpoch)
          await ctx.sessions.open(target.nativeSessionId)
          assertActive()
          setMap(false); syncCurrent()
          return target
        }
        if (operation === 'add-reference' || operation === 'stage-reference') {
          const target = await graphJson('resolve?nativeSessionId=' + encodeURIComponent(input.targetSessionId))
          assertCoreEpoch(operationCoreEpoch)
          const core = annotation()
          if (operation === 'add-reference') setMap(false)
          return core.addCrossSessionReference(target.nativeSessionId, input.capture, { operationId: input.operationId })
        }
        if (operation === 'delete-reference') {
          const target = await graphJson('resolve?nativeSessionId=' + encodeURIComponent(input.nativeSessionId))
          assertCoreEpoch(operationCoreEpoch)
          const core = annotation()
          const link = await core.resolveReferenceLink(target.nativeSessionId, input.referenceId)
          assertCoreEpoch(operationCoreEpoch)
          if (!link) return { deleted: true }
          if (link.state === 'deleted') return { deleted: true }
          return core.deleteReferenceLink(target.nativeSessionId, link.setId, link.referenceId)
        }
        if (operation === 'open-object') {
          if (!['annotation', 'obsidian-links'].includes(input.namespace)) throw new Error('未接入这个对象类型')
          const detail = await graphJson('object?' + new URLSearchParams({ namespace: input.namespace, objectId: input.objectId }))
          assertActive()
          if (detail.object.deleted) throw new Error('该对象已删除')
          const body = detail.object.content.body
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
          assertCoreEpoch(operationCoreEpoch)
          const core = annotation()
          setMap(false)
          const opened = await core.openAnnotationInSession(target.nativeSessionId, body.setId)
          assertActive()
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
      const sessionsChanged = () => { syncCurrent(); referencesChanged(); updateCanvasPosition() }
      window.addEventListener('dsh-session-references-changed', referencesChanged)
      window.addEventListener('focus', referencesChanged)
      const stopSessionChanges = ctx.sessions.list.subscribe?.(sessionsChanged)

      const setMap = map => {
        if (!map) selectionIntent = null
        if (map === mapState) return
        positionObserver.disconnect()
        if (map) {
          headerSwitch = [...document.querySelectorAll('.dsh-td-header-switch')].find(element => element.getBoundingClientRect().width > 0)
          if (!headerSwitch) return
          positionCanvasSwitch()
          for (let element = headerSwitch; element && element !== document.body; element = element.parentElement) positionObserver.observe(element)
        }
        mapState = map
        if (transitionTimer !== null) window.clearTimeout(transitionTimer)
        if (map) {
          overlay.hidden = false
          overlay.inert = false
          // Commit the starting opacity once. CSS reverses an in-flight fade
          // from its current value; no frame loop or queued animations needed.
          void window.getComputedStyle(overlay).opacity
          void window.getComputedStyle(canvasSwitch, '::before').transform
        }
        // Both copies share one target, so swapping surfaces does not restart
        // the thumb. CSS reverses interrupted motion from its current position.
        for (const selector of [headerSwitch, canvasSwitch]) {
          if (!selector) continue
          selector.dataset.view = map ? 'map' : 'dialog'
          for (const button of selector.querySelectorAll('button')) {
            const active = (button.dataset.view === 'map') === map
            button.classList.toggle('active', active)
            button.setAttribute('aria-pressed', String(active))
          }
        }
        overlay.classList.toggle('is-open', map)
        overlay.inert = !map
        blockConversation(map)
        if (motion.matches) settleTransition()
        else {
          overlay.setAttribute('data-transitioning', '')
          transitionTimer = window.setTimeout(settleTransition, 220)
        }
        for (const notify of mapSubscribers) notify(map)
        if (!map) {
          send('td:view', { shown: false })
          headerSwitch?.querySelector('[data-view="dialog"]')?.focus({ preventScroll: true })
          return
        }
        canvasSwitch.querySelector('[data-view="map"]')?.focus({ preventScroll: true })
        // the SPA boots on first open, never while hidden: a canvas that
        // measures itself inside a display:none frame fits its view to a 0×0
        // box and shows nothing when revealed
        if (!frame.src) frame.src = frame.dataset.src + (pluginVersion ? (frame.dataset.src.includes('?') ? '&' : '?') + 'dv=' + encodeURIComponent(pluginVersion) : '')
        syncCurrent()
        send('td:view', { shown: true })
        // The child's ready handshake below replays the latest state after
        // first boot. A delayed unconditional "shown" could reopen a closed view.
      }

      let selectionIntent = null
      const openSelection = async (kind, capture) => {
        assertActive()
        const operationCoreEpoch = coreEpoch
        let fixed = capture
        if (capture) {
          if (capture.role !== 'assistant') throw new Error('请选择已完成的 AI 回复')
          let anchorId = capture.messageId ?? capture.anchorId
          const ui = (() => { try { return ctx.get('uiConversation') } catch { return undefined } })()
          const snapshot = ui?.binding(capture.sourceSessionId).target('chat').getSnapshot()
          const node = snapshot?.nodes.get(capture.anchorId) ?? snapshot?.order.map(key => snapshot.nodes.get(key)).find(node => node?.id === capture.anchorId)
          if (node?.kind === 'assistant-step') {
            if (node.data?.status !== 'settled' || !node.data?.finalNode?.messageId) throw new Error('请等待来源回复保存完成')
            anchorId = node.data.finalNode.messageId
          }
          if (kind === 'sticker') {
            fixed = { ...capture, anchorId }
          } else {
            const identity = await graphJson('resolve?nativeSessionId=' + encodeURIComponent(capture.sourceSessionId))
            const latest = capture.expectedSourceVersionId ? { sourceVersionId: capture.expectedSourceVersionId } : await graphJson('preview?logicalSessionId=' + encodeURIComponent(identity.logicalSessionId))
            const preview = await graphJson('preview?' + new URLSearchParams({ logicalSessionId: identity.logicalSessionId, sourceVersionId: latest.sourceVersionId, sourceAnchorId: anchorId }))
            if (!preview.capture) throw new Error('这段回复尚未提供可引用来源')
            fixed = { ...preview.capture, selectedText: capture.selectedText, occurrence: capture.occurrence, expectedSourceVersionId: preview.sourceVersionId }
          }
        }
        assertCoreEpoch(operationCoreEpoch)
        selectionIntent = { id: crypto.randomUUID(), kind, capture: fixed }
        setMap(true)
        if (!mapState) { selectionIntent = null; throw new Error('请先打开主会话，再进入思维图') }
        send('td:selection-intent', { intent: selectionIntent })
      }
      const markerFiber = typeof ctx.inject === 'function' ? ctx.inject(['uiConversation'], ready => {
        ready.effect(() => {
          let disposed = false, unmount
          import('/thoughtdag/host-markers.js?v=' + encodeURIComponent(pluginVersion || Date.now())).then(module => {
            if (!disposed) {
              const mounted = module.mountSourceMarkers({ sessions: ready.sessions, uiConversation: ready.get('uiConversation'), get: name => ready.get(name) })
              const visibility = map => mounted.setVisible(!map)
              mapSubscribers.add(visibility); visibility(mapState)
              unmount = () => { mapSubscribers.delete(visibility); mounted.dispose() }
            }
          }).catch(error => console.warn('[thoughtdag] source markers unavailable', error))
          return () => { disposed = true; unmount?.() }
        }, 'thoughtdag: source markers')
      }) : undefined
      const selectionFiber = typeof ctx.inject === 'function' ? ctx.inject(['annotationCore'], ready => {
        ++coreEpoch
        ready.effect(() => () => { ++coreEpoch }, 'thoughtdag: reference provider lifetime')
        const core = ready.get('annotationCore')
        if (!core?.features?.includes('native-selection-actions-v1') || !core.registerSelectionAction) return
        ready.effect(() => {
          const offReference = core.registerSelectionAction({ id: 'thoughtdag.reference', label: '跨会话引用', order: 30, iconPath: 'M14 3h7v7M21 3 10 14M10 3H4v17h17v-6', available: capture => capture.role === 'assistant', run: capture => openSelection('reference', capture) })
          const offSticker = core.registerSelectionAction({ id: 'thoughtdag.session-sticker', label: '会话贴纸', order: 40, iconPath: 'M4 3h16v12l-6 6H4ZM14 21v-6h6', available: capture => capture.role === 'assistant', run: capture => openSelection('sticker', capture) })
          return () => { offSticker(); offReference() }
        }, 'thoughtdag: selection actions')
      }) : undefined

      const Switch = () => {
        const [map, setMapState] = React.useState(mapState)
        React.useEffect(() => {
          const notify = m => setMapState(m)
          mapSubscribers.add(notify)
          return () => { mapSubscribers.delete(notify) }
        }, [])
        return React.createElement('div', { className: 'dsh-td-switch dsh-td-header-switch', 'data-view': map ? 'map' : 'dialog', role: 'group', 'aria-label': 'view switch', 'aria-hidden': map ? 'true' : undefined },
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
        if (event.data.type === 'td:intent-accepted' && event.data.id === selectionIntent?.id) { selectionIntent = null; return }
        if (event.data.type === 'td:stickers-changed') { window.dispatchEvent(new Event('dsh-session-references-changed')); return }
        if (event.data.type === 'td:request-current') { syncCurrent(); send('td:view', { shown: mapState }); if (selectionIntent) send('td:selection-intent', { intent: selectionIntent }); return }
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
        lifetime.abort()
        void markerFiber?.dispose()
        void selectionFiber?.dispose()
        window.removeEventListener('message', receive)
        window.removeEventListener('dsh-session-references-changed', referencesChanged)
        window.removeEventListener('focus', referencesChanged)
        if (typeof stopSessionChanges === 'function') stopSessionChanges()
        window.removeEventListener('resize', updateCanvasPosition)
        window.removeEventListener('scroll', updateCanvasPosition, true)
        positionObserver.disconnect()
        if (positionFrame !== null) window.cancelAnimationFrame(positionFrame)
        if (transitionTimer !== null) window.clearTimeout(transitionTimer)
        motion.removeEventListener('change', motionChanged)
        overlay.removeEventListener('transitionend', transitionEnded)
        blockConversation(false)
        overlayHost.remove(); style.remove(); mapSubscribers.clear()
      }, 'thoughtdag: client lifetime')
    }

    return module.exports
  },
})
