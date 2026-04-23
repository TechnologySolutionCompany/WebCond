import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    if (import.meta.env.PROD) {
      try {
        await navigator.serviceWorker.register('/sw.js')
      } catch (error) {
        console.error('Falha ao registrar o service worker:', error)
      }

      return
    }

    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))

    if ('caches' in window) {
      const cacheKeys = await caches.keys()
      await Promise.all(
        cacheKeys
          .filter((key) => key.startsWith('webcond-'))
          .map((key) => caches.delete(key)),
      )
    }
  })
}
