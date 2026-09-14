import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import './index.css'

// Keep the managed canvas out of the standalone hydration, backup and model paths.
if (import.meta.env.VITE_DSH_BRIDGE) {
  void Promise.all([import('./maintenance/ManagedGraphApp'), import('./lib/appearance')])
    .then(([{ default: ManagedGraphApp }, { initAppearance }]) => {
      initAppearance()
      createRoot(document.getElementById('root')!).render(<StrictMode><ManagedGraphApp /></StrictMode>)
    })
    .catch(error => {
      const root = document.getElementById('root')!
      root.textContent = error instanceof Error ? error.message : 'Canvas could not load'
    })
} else {
  void import('./standalone-main')
}
