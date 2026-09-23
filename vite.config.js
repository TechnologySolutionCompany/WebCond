import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const apiModules = {
  '/api/health': new URL('./api/health.js', import.meta.url),
  '/api/auth/login-cpf': new URL('./api/_auth/login-cpf.js', import.meta.url),
  '/api/auth/login-cnpj': new URL('./api/_auth/login-cnpj.js', import.meta.url),
  '/api/auth/cadastro-info': new URL('./api/_auth/cadastro-info.js', import.meta.url),
  '/api/auth/cadastro-enviar': new URL('./api/_auth/cadastro-enviar.js', import.meta.url),
  '/api/admin/billing/render-pdf': new URL('./api/admin/billing/render-pdf.js', import.meta.url),
  '/api/admin/residents-create': new URL('./api/_admin/residents/create.js', import.meta.url),
  '/api/admin/residents-delete': new URL('./api/_admin/residents/delete.js', import.meta.url),
  '/api/admin/units-save': new URL('./api/_admin/units/save.js', import.meta.url),
  '/api/admin/units-delete': new URL('./api/_admin/units/delete.js', import.meta.url),
  '/api/admin/units-import-analyze': new URL('./api/_admin/units/import-analyze.js', import.meta.url),
  '/api/admin/units-import-confirm': new URL('./api/_admin/units/import-confirm.js', import.meta.url),
  '/api/admin/signup-link': new URL('./api/_admin/signup/link.js', import.meta.url),
  '/api/admin/signup-review': new URL('./api/_admin/signup/review.js', import.meta.url),
  '/api/admin/profile-update': new URL('./api/_admin/profile/update.js', import.meta.url),
  '/api/admin/profile-password': new URL('./api/_admin/profile/password.js', import.meta.url),
  '/api/admin/notify': new URL('./api/_admin/notify/send.js', import.meta.url),
  '/api/platform/condominiums-list': new URL('./api/_platform/condominiums/list.js', import.meta.url),
  '/api/platform/status': new URL('./api/_platform/status.js', import.meta.url),
  '/api/platform/condominiums-export': new URL('./api/_platform/condominiums/export.js', import.meta.url),
  '/api/platform/condominiums-import': new URL('./api/_platform/condominiums/import.js', import.meta.url),
  '/api/platform/condominiums-register': new URL('./api/_platform/condominiums/register.js', import.meta.url),
  '/api/platform/condominiums-update': new URL('./api/_platform/condominiums/update.js', import.meta.url),
  '/api/platform/condominiums-syndic-password': new URL('./api/_platform/condominiums/update-syndic-password.js', import.meta.url),
  '/api/platform/condominiums-delete': new URL('./api/_platform/condominiums/delete.js', import.meta.url),
  '/api/platform/support-tickets': new URL('./api/_platform/support/tickets.js', import.meta.url),
  '/api/platform/support-attachment': new URL('./api/_platform/support/attachment.js', import.meta.url),
  '/api/platform/support-messages': new URL('./api/_platform/support/messages.js', import.meta.url),
  '/api/platform/condominiums-logo': new URL('./api/_platform/condominiums/logo.js', import.meta.url),
  '/api/platform/team': new URL('./api/_platform/team.js', import.meta.url),
  '/api/tenant/charge-summary': new URL('./api/_tenant/charge-summary.js', import.meta.url),
  '/api/tenant/push-subscribe': new URL('./api/_tenant/push/subscribe.js', import.meta.url),
  '/api/tenant/push-unsubscribe': new URL('./api/_tenant/push/unsubscribe.js', import.meta.url),
}

function devApiPlugin() {
  return {
    name: 'webcond-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost')
        const moduleUrl = apiModules[url.pathname]

        if (!moduleUrl) {
          next()
          return
        }

        try {
          const method = req.method || 'GET'
          const routeModule = await import(`${moduleUrl.href}?t=${Date.now()}`)
          const handler = routeModule[method]

          if (typeof handler !== 'function') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: 'Método não permitido.' }))
            return
          }

          const body = await readRequestBody(req)
          const request = new Request(url.toString(), {
            method,
            headers: new Headers(convertHeaders(req.headers)),
            body: method === 'GET' || method === 'HEAD' ? undefined : body,
          })

          const response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((value, key) => {
            res.setHeader(key, value)
          })

          const buffer = Buffer.from(await response.arrayBuffer())
          res.end(buffer)
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({
            error: error?.message || 'Erro interno ao processar a API local.',
          }))
        }
      })
    },
  }
}

function convertHeaders(headers) {
  return Object.entries(headers)
    .filter(([, value]) => value != null)
    .map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value)])
}

async function readRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined
  }

  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) {
    return undefined
  }

  return Buffer.concat(chunks)
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  Object.entries(env).forEach(([key, value]) => {
    if (process.env[key] == null) {
      process.env[key] = value
    }
  })

  if (!process.env.SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
  }

  if (!process.env.SUPABASE_ANON_KEY && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY) {
    process.env.SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  }

  return {
    plugins: [react(), devApiPlugin()],
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  }
})
