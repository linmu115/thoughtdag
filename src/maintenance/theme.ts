// The embedded canvas follows its host. Standalone ThoughtDAG preferences do
// not participate, and no theme preference is written to either application.
export function initDshAppearance(): () => void {
  let host: Window = window
  try {
    if (window.parent !== window && window.parent.location.origin === window.location.origin) host = window.parent
  } catch { /* A separately opened canvas uses its local system theme. */ }
  const embedded = host !== window
  const root = document.documentElement
  const media = host.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => {
    const body = host.document.body
    const cs = host.getComputedStyle(body)
    const hostBase = cs.getPropertyValue('--dsw-alias-bg-base').trim()
    const dark = embedded && hostBase
      ? body.hasAttribute('data-ds-dark-theme')
      : media.matches
    const read = (name: string, light: string, dim: string) => embedded
      ? cs.getPropertyValue(name).trim() || (dark ? dim : light)
      : dark ? dim : light
    const tokens: Record<string, string> = {
      '--dsh-bg': read('--dsw-alias-bg-base', '#fff', '#151517'),
      '--dsh-panel': read('--dsw-alias-bg-layer-1', '#fff', '#202022'),
      '--dsh-sidebar': read('--dsw-specific-sidebar-fill', '#f5f6f7', '#1b1b1d'),
      '--dsh-text': read('--dsw-alias-label-primary', '#0f1115', '#f9fafb'),
      '--dsh-muted': read('--dsw-alias-label-secondary', '#61666b', '#c0c4c9'),
      '--dsh-line': read('--dsw-alias-border-l2', '#0000001a', '#ffffff24'),
      '--dsh-frame-line': read('--dsw-alias-border-l3', '#0000001a', '#ffffff24'),
      '--dsh-hover': read('--dsw-alias-interactive-bg-hover', '#f5f6f7', '#2b2b2e'),
      '--dsh-accent': read('--dsw-alias-brand-primary-new-colorprimary-new-color', '#4176e6', '#6f9cff'),
      '--dsh-accent-text': '#fff',
      '--dsh-danger': read('--dsw-alias-state-error-primary', '#d03050', '#f07886'),
      '--dsh-font': embedded ? cs.fontFamily : '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    }
    const anchor = embedded ? host.document.querySelector('.dsh-td-canvas-switch') : null
    const anchorBox = anchor?.getBoundingClientRect()
    tokens['--dsh-header-inset'] = `${anchorBox && anchorBox.height > 0 ? Math.max(48, anchorBox.bottom + 12) : 48}px`
    const geometry = (name: string, fallback: number) => {
      const value = (anchor as HTMLElement | null)?.style?.getPropertyValue(name).trim()
      return value && /^\d+(?:\.\d+)?px$/.test(value) ? value : `${fallback}px`
    }
    tokens['--dsh-left-rail'] = geometry('--dsh-left-rail', window.innerWidth < 760 ? 0 : 232)
    tokens['--dsh-chrome-height'] = geometry('--dsh-chrome-height', 76)
    tokens['--dsh-chrome-top'] = geometry('--dsh-chrome-top', 0)
    tokens['--dsh-title-room'] = geometry('--dsh-title-room', 460)
    for (const [name, fallback] of Object.entries({ 'header-height': 76, 'title-left': 28, 'title-top': 14, 'title-size': 14, 'title-line': 20 })) {
      tokens[`--dsh-canvas-${name}`] = geometry(`--dsh-canvas-${name}`, fallback)
    }
    const titleWeight = (anchor as HTMLElement | null)?.style?.getPropertyValue('--dsh-canvas-title-weight').trim()
    tokens['--dsh-canvas-title-weight'] = titleWeight && /^\d{1,4}$/.test(titleWeight) ? titleWeight : '500'
    for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value)
    root.dataset.theme = dark ? 'dark' : 'light'
    root.dataset.dshManaged = 'true'
    root.dataset.dshCompact = String(parseFloat(tokens['--dsh-left-rail']) < 140)
    root.style.colorScheme = dark ? 'dark' : 'light'
    root.style.background = tokens['--dsh-bg']
    document.body.style.margin = '0'
    document.body.style.background = tokens['--dsh-bg']
    document.body.style.color = tokens['--dsh-text']
    document.body.style.fontFamily = tokens['--dsh-font']
  }
  apply()
  const observer = new MutationObserver(apply)
  if (embedded) {
    observer.observe(host.document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-ds-dark-theme'] })
    observer.observe(host.document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-ds-dark-theme'] })
    const anchor = host.document.querySelector('.dsh-td-canvas-switch')
    if (anchor) observer.observe(anchor, { attributes: true, attributeFilter: ['style'] })
  }
  const onView = (event: MessageEvent) => {
    if (event.source === host && event.origin === location.origin && event.data?.source === 'dsh-thoughtdag' && event.data.type === 'td:view') apply()
  }
  window.addEventListener('message', onView)
  media.addEventListener('change', apply)
  return () => { observer.disconnect(); media.removeEventListener('change', apply); window.removeEventListener('message', onView) }
}
