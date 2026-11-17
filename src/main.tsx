import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'))
}

// Pick up new versions: when the app comes back to the foreground, check whether
// a newer build is published and reload into it (only when no form is open).
async function checkForUpdate() {
  if (!import.meta.env.PROD || !navigator.onLine) return
  try {
    const html = await fetch('/', { cache: 'no-store' }).then((r) => r.text())
    const current = [...document.scripts].map((s) => s.getAttribute('src')).find((s) => s?.includes('/assets/index-'))
    if (current && !html.includes(current) && !document.querySelector('.sheet')) location.reload()
  } catch {
    /* offline */
  }
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void checkForUpdate())
setInterval(() => void checkForUpdate(), 15 * 60_000)
