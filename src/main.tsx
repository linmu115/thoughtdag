import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initDshAppearance } from './maintenance/theme'

// Keep the managed canvas out of the standalone hydration, backup and model paths.
if (import.meta.env.VITE_DSH_BRIDGE) {
  const disposeAppearance = initDshAppearance()
  window.addEventListener('pagehide', disposeAppearance, { once: true })
  import.meta.hot?.dispose(disposeAppearance)
  void import('./maintenance/ManagedGraphApp')
    .then(({ default: ManagedGraphApp }) => {
      createRoot(document.getElementById('root')!).render(<StrictMode><ManagedGraphApp /></StrictMode>)
    })
    .catch(error => {
      const root = document.getElementById('root')!
      root.textContent = error instanceof Error ? error.message : 'Canvas could not load'
    })
} else {
  void import('./standalone-main')
}
