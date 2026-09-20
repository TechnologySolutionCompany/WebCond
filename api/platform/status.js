import { ensureServiceRoleConfig, json, requirePlatformAdmin, supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { getCondominiumAccessState } from '../../src/lib/condominiumPlan.js'

// Acima disso o componente aparece como "lento".
const SLOW_MS = 800
const REQUIRED_BUCKETS = ['documentos', 'cobrancas']
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']

async function timed(fn) {
  const startedAt = performance.now()
  try {
    const result = await fn()
    return { ms: Math.round(performance.now() - startedAt), result }
  } catch (error) {
    return { ms: Math.round(performance.now() - startedAt), error }
  }
}

function componentStatus({ error, ms, warn }) {
  if (error) return 'down'
  if (warn || ms >= SLOW_MS) return 'degraded'
  return 'ok'
}

async function checkDatabase() {
  // 3 leituras curtas: media e pior caso mostram instabilidade melhor que uma leitura so.
  const samples = []
  for (let i = 0; i < 3; i += 1) {
    const sample = await timed(async () => {
      const { error } = await supabaseAdmin.from('app_health').select('id', { count: 'exact', head: true })
      if (error) throw error
    })
    samples.push(sample)
    if (sample.error) break
  }
  const failure = samples.find((sample) => sample.error)
  const times = samples.map((sample) => sample.ms)
  const avg = Math.round(times.reduce((sum, ms) => sum + ms, 0) / times.length)
  return {
    key: 'database',
    label: 'Banco de dados',
    status: componentStatus({ error: failure?.error, ms: avg }),
    latencyMs: avg,
    detail: failure
      ? `Falha na consulta: ${failure.error.message || 'erro desconhecido'}`
      : `Media ${avg} ms · pior ${Math.max(...times)} ms em ${times.length} consultas.`,
  }
}

async function checkAuth() {
  const { ms, error } = await timed(async () => {
    const { error: authError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (authError) throw authError
  })
  return {
    key: 'auth',
    label: 'Autenticacao (login)',
    status: componentStatus({ error, ms }),
    latencyMs: ms,
    detail: error ? `Servico de login indisponivel: ${error.message}` : 'Servico de login respondendo.',
  }
}

async function checkStorage() {
  const { ms, error, result } = await timed(async () => {
    const { data, error: storageError } = await supabaseAdmin.storage.listBuckets()
    if (storageError) throw storageError
    return data || []
  })
  const missing = error ? [] : REQUIRED_BUCKETS.filter((name) => !result.some((bucket) => bucket.name === name))
  return {
    key: 'storage',
    label: 'Arquivos (boletos e documentos)',
    status: componentStatus({ error, ms, warn: missing.length > 0 }),
    latencyMs: ms,
    detail: error
      ? `Storage indisponivel: ${error.message}`
      : missing.length ? `Bucket ausente: ${missing.join(', ')}.` : 'Buckets documentos e cobrancas disponiveis.',
  }
}

async function countRows(table, apply = (query) => query) {
  const { count, error } = await apply(supabaseAdmin.from(table).select('id', { count: 'exact', head: true }))
  return error ? null : count || 0
}

async function loadMetrics() {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const noticeLimit = new Date(Date.now() - 30 * 86400000).toISOString()

  const [condominiumsRes, users, activeUsers, units, chargesMonth, documents, notices, staleNotices] = await Promise.all([
    supabaseAdmin.from('condominiums').select('status, metadata, created_at, updated_at'),
    countRows('profiles'),
    countRows('profiles', (query) => query.eq('ativo', true)),
    countRows('unidades'),
    countRows('cobrancas', (query) => query.gte('created_at', monthStart.toISOString())),
    countRows('documentos'),
    countRows('avisos'),
    countRows('avisos', (query) => query.lt('created_at', noticeLimit)),
  ])

  const condominiums = { total: 0, active: 0, pending: 0, blocked: 0, rejected: 0, trial: 0, paid: 0, partnership: 0, locked: 0, expiringSoon: 0 }
  for (const condominium of condominiumsRes.data || []) {
    const state = getCondominiumAccessState(condominium)
    condominiums.total += 1
    if (condominiums[state.rawStatus] !== undefined) condominiums[state.rawStatus] += 1
    if (state.rawStatus !== 'active') continue
    if (state.planLocked) condominiums.locked += 1
    if (state.planExpiringSoon) condominiums.expiringSoon += 1
    if (state.subscriptionStatus !== 'active') condominiums.trial += 1
    else if (state.planName === 'PARCERIA') condominiums.partnership += 1
    else condominiums.paid += 1
  }

  return { condominiums, users, activeUsers, units, chargesMonth, documents, notices, staleNotices }
}

function runtimeInfo() {
  const memory = process.memoryUsage()
  return {
    environment: process.env.VERCEL_ENV || 'local',
    region: process.env.VERCEL_REGION || 'local',
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'local',
    node: process.version,
    instanceUptimeSec: Math.round(process.uptime()),
    memoryMb: Math.round(memory.rss / 1048576),
  }
}

export async function GET(req) {
  const startedAt = performance.now()
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name] && !process.env[`VITE_${name}`])
  const serviceRoleError = ensureServiceRoleConfig()

  const [database, authCheck, storage, metricsResult] = await Promise.all([
    checkDatabase(),
    checkAuth(),
    checkStorage(),
    timed(loadMetrics),
  ])

  const metrics = metricsResult.result || null
  const routines = {
    key: 'routines',
    label: 'Rotinas automaticas',
    status: metricsResult.error ? 'degraded' : metrics.staleNotices > 0 ? 'degraded' : 'ok',
    latencyMs: null,
    detail: metricsResult.error
      ? 'Nao foi possivel ler os indicadores.'
      : metrics.staleNotices > 0
        ? `${metrics.staleNotices} aviso(s) com mais de 30 dias aguardando limpeza (confira o SQL 2026-09-22).`
        : 'Limpeza de avisos com mais de 30 dias em dia.',
  }
  const config = {
    key: 'config',
    label: 'Configuracao do servidor',
    status: missingEnv.length || serviceRoleError ? 'down' : 'ok',
    latencyMs: null,
    detail: missingEnv.length ? `Variaveis ausentes: ${missingEnv.join(', ')}.` : 'Variaveis de ambiente carregadas.',
  }

  const components = [database, authCheck, storage, config, routines]
  const overall = components.some((item) => item.status === 'down')
    ? 'down'
    : components.some((item) => item.status === 'degraded') ? 'degraded' : 'ok'

  return json({
    overall,
    components,
    metrics,
    runtime: runtimeInfo(),
    serverMs: Math.round(performance.now() - startedAt),
    timestamp: new Date().toISOString(),
  })
}
