import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { SourceMarkerOverlay } from './source-marker-overlay'
import type { Context } from './geometry-contract'
import { sourceMarkerStyle } from './style'
function Markers({ ctx }: { ctx: Context }) {
  const sessions = useSyncExternalStore(useCallback((notify: () => void) => ctx.sessions.list.subscribe(notify), [ctx]), () => ctx.sessions.list.getSnapshot())
  const sessionId = sessions.current ?? ''
  const chat = useMemo(() => sessionId ? ctx.uiConversation.binding(sessionId).target('chat') : undefined, [ctx, sessionId])
  const snapshot = useSyncExternalStore(useCallback((notify: () => void) => chat?.subscribe(notify) ?? (() => {}), [chat]), () => chat?.getSnapshot())
  return <><style>{sourceMarkerStyle}</style>{sessionId && <SourceMarkerOverlay key={sessionId} ctx={ctx} sessionId={sessionId} snapshot={snapshot} />}</>
}
export function mountSourceMarkers(ctx: Context): { dispose(): void; setVisible(visible: boolean): void } {
  const host = document.createElement('div'); host.dataset.dshThoughtdagSources = ''; document.body.appendChild(host)
  const root = createRoot(host); root.render(<Markers ctx={ctx} />)
  return { dispose() { root.unmount(); host.remove() }, setVisible(visible) { host.hidden = !visible; host.inert = !visible } }
}
