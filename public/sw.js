// v4 descarta o cache anterior: e o que faz a marca nova chegar em quem ja tinha o app aberto.
const CACHE_NAME = 'webcond-v4'
// Em localhost (npm run dev) o service worker so cuida das notificacoes: nada de cache.
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(self.location.hostname)
const STATIC_ASSETS = ['/', '/manifest.json', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      )),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (IS_LOCAL || event.request.method !== 'GET') return

  const requestUrl = new URL(event.request.url)
  if (requestUrl.origin !== self.location.origin) return
  // Respostas da API sao por usuario e mudam sempre: nunca passam pelo cache.
  if (requestUrl.pathname.startsWith('/api/')) return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clonedResponse = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('/', clonedResponse))
          return response
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME)
          return cache.match('/')
        }),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse
        }

        const clonedResponse = networkResponse.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clonedResponse))
        return networkResponse
      })
    }),
  )
})

// Notificacoes (avisos, cobrancas e chamados). O servidor manda { title, body, url, tag }.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'WebCond', {
      body: data.body || 'Voce tem uma nova notificacao.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/' },
    }),
  )
})

// Toque na notificacao: foca o WebCond aberto (e leva para a pagina certa) ou abre um novo.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin)
  if (target.origin !== self.location.origin) return

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (open) {
        open.postMessage({ type: 'webcond:navigate', url: target.pathname + target.search })
        return open.focus()
      }
      return self.clients.openWindow(target.pathname + target.search)
    }),
  )
})
