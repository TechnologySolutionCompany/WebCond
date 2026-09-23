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

    // Em desenvolvimento o service worker nao faz cache (ver public/sw.js). So e mantido quando
    // ha notificacoes ligadas neste navegador, para dar para testar o push em localhost.
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map(async (registration) => {
      const subscription = await registration.pushManager?.getSubscription().catch(() => null)
      if (subscription) {
        await registration.update().catch(() => {})
        return
      }
      await registration.unregister()
    }))

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
