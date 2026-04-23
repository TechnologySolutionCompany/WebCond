import { ensureBackendConfig, ensureServiceRoleConfig, json, supabaseServer } from './_lib/supabaseAdmin.js'

function buildChecks({ backendConfigError, serviceRoleError, databaseError, latencyMs }) {
  return [
    {
      key: 'environment',
      label: 'Ambiente',
      status: backendConfigError ? 'error' : 'ok',
      detail: backendConfigError || 'Variáveis públicas do backend carregadas corretamente.',
    },
    {
      key: 'database',
      label: 'Banco de dados',
      status: databaseError ? 'error' : 'ok',
      detail: databaseError || `Conexão estabelecida com sucesso em ${latencyMs} ms.`,
    },
    {
      key: 'admin_auth',
      label: 'Recursos administrativos',
      status: serviceRoleError ? 'warn' : 'ok',
      detail: serviceRoleError || 'Criação de usuários, troca de senha e edição de login habilitadas.',
    },
  ]
}

export async function GET() {
  const backendConfigError = ensureBackendConfig()
  const serviceRoleError = ensureServiceRoleConfig()

  if (backendConfigError) {
    return json({
      ok: false,
      database: 'unconfigured',
      mode: 'offline',
      checks: buildChecks({
        backendConfigError,
        serviceRoleError,
        databaseError: 'Não foi possível iniciar a conexão com o banco.',
        latencyMs: null,
      }),
      timestamp: new Date().toISOString(),
    }, 503)
  }

  const startedAt = Date.now()
  const { error } = await supabaseServer
    .from('app_health')
    .select('id', { count: 'exact', head: true })

  const latencyMs = Date.now() - startedAt

  if (error) {
    return json({
      ok: false,
      database: 'offline',
      mode: serviceRoleError ? 'limited' : 'full',
      latencyMs,
      checks: buildChecks({
        backendConfigError,
        serviceRoleError,
        databaseError: 'Falha ao consultar o banco de dados pelo backend.',
        latencyMs,
      }),
      timestamp: new Date().toISOString(),
    }, 503)
  }

  return json({
    ok: true,
    database: 'online',
    mode: serviceRoleError ? 'limited' : 'full',
    latencyMs,
    checks: buildChecks({
      backendConfigError,
      serviceRoleError,
      databaseError: null,
      latencyMs,
    }),
    timestamp: new Date().toISOString(),
  })
}
