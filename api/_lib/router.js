// O plano Hobby da Vercel permite ate 12 Serverless Functions. Em vez de uma funcao por rota,
// cada area (auth, admin, platform, tenant) tem uma unica funcao que repassa para o modulo certo.
// Os enderecos das rotas continuam iguais: /api/auth/login-cpf, /api/admin/units/save, etc.
import { json } from './supabaseAdmin.js'

export function createRouter(routes) {
  const handle = async (req, method) => {
    const { pathname } = new URL(req.url, 'http://localhost')
    const route = routes[pathname.replace(/\/+$/, '')]

    if (!route) return json({ error: 'Rota nao encontrada.' }, 404)
    if (typeof route[method] !== 'function') return json({ error: 'Metodo nao permitido.' }, 405)

    return route[method](req)
  }

  return {
    GET: (req) => handle(req, 'GET'),
    POST: (req) => handle(req, 'POST'),
  }
}
