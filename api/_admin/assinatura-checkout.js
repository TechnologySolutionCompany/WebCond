// POST /api/admin/assinatura-checkout (v2.10A1): o sindico escolhe o plano e recebe o link de
// pagamento do Asaas (Pix, boleto ou cartao). A ativacao do plano NAO acontece aqui: so quando o
// Asaas confirma o pagamento (api/_platform/assinatura-webhook.js).
// Aberta tambem com o plano vencido: e justamente quem precisa pagar.
import { checkRateLimit, ensureServiceRoleConfig, json, parseJsonBody, rejectForeignOrigin, requireAdmin, supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { asaasConfigurado, cobrancaEmAbertoAsaas, criarAssinaturaAsaas, criarClienteAsaas, removerAssinaturaAsaas } from '../_lib/assinatura/asaas.js'
import { buildAssinaturaMetadata, readAssinatura } from '../../src/lib/assinatura.js'
import { PLANS } from '../../src/lib/condominiumPlan.js'

function hojeNoBrasil(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireAdmin(req, { allowPlatformAdmin: false, allowAccountant: false, allowLockedPlan: true })
  if (auth.error) return auth.error

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) return json({ error: serviceRoleError }, 503)
  if (!asaasConfigurado()) {
    return json({ error: 'A contratacao pelo sistema ainda nao esta ligada. Fale com a TSCBr pelo WhatsApp.', code: 'SEM_PROVEDOR' }, 503)
  }

  const rateLimitError = checkRateLimit(`assinatura-checkout:${auth.profile.id}`, { limit: 6, windowMs: 60 * 60 * 1000 })
  if (rateLimitError) return rateLimitError

  const body = await parseJsonBody(req)
  const plano = String(body?.plano || '').trim().toUpperCase()
  const dadosDoPlano = PLANS[plano]
  if (!dadosDoPlano?.publicPlan || !dadosDoPlano.available || dadosDoPlano.priceCents <= 0) {
    return json({ error: 'Este plano ainda nao pode ser contratado pelo sistema.' }, 400)
  }

  const condominiumId = auth.profile.condominium_id
  const [{ data: condominio }, { data: sindico }] = await Promise.all([
    supabaseAdmin.from('condominiums').select('id, name, nome, cnpj, whatsapp, metadata').eq('id', condominiumId).maybeSingle(),
    supabaseAdmin.from('profiles').select('nome, email').eq('id', auth.profile.id).maybeSingle(),
  ])
  if (!condominio) return json({ error: 'Condominio nao encontrado.' }, 404)

  const metadata = condominio.metadata && typeof condominio.metadata === 'object' ? condominio.metadata : {}
  const atual = readAssinatura(metadata)
  const nome = condominio.name || condominio.nome || 'Condominio'

  try {
    // Mesmo plano ja pedido: devolve a cobranca em aberto em vez de criar outra assinatura.
    if (atual.provedor === 'asaas' && atual.assinaturaExternaId && atual.plano === plano && atual.status !== 'cancelada') {
      const aberta = await cobrancaEmAbertoAsaas(atual.assinaturaExternaId)
      if (aberta?.url) return json({ url: aberta.url, reaproveitada: true })
      if (atual.status === 'active') return json({ error: `O plano ${dadosDoPlano.label} ja esta ativo e sem cobranca em aberto.`, code: 'JA_ATIVO' }, 409)
    }

    const cliente = atual.clienteExternoId || await criarClienteAsaas({
      nome,
      cpfCnpj: condominio.cnpj,
      email: sindico?.email && !String(sindico.email).endsWith('@login.webcond.local') ? sindico.email : '',
      telefone: condominio.whatsapp,
      referencia: condominio.id,
    })

    const assinatura = await criarAssinaturaAsaas({
      cliente,
      valorCentavos: dadosDoPlano.priceCents,
      descricao: `WebCond - Plano ${dadosDoPlano.label} - ${nome}`,
      referencia: `${condominio.id}:${plano}`,
      primeiroVencimento: hojeNoBrasil(),
    })

    // Troca de plano: a assinatura antiga para de cobrar. O plano atual segue valendo ate o vencimento.
    if (atual.provedor === 'asaas' && atual.assinaturaExternaId && atual.assinaturaExternaId !== assinatura.id) {
      await removerAssinaturaAsaas(atual.assinaturaExternaId).catch(() => {})
    }

    const { error: saveError } = await supabaseAdmin
      .from('condominiums')
      .update({
        metadata: buildAssinaturaMetadata(metadata, {
          provedor: 'asaas',
          assinaturaExternaId: assinatura.id,
          clienteExternoId: cliente,
          plano,
          status: 'pendente',
        }),
      })
      .eq('id', condominio.id)
    if (saveError) {
      // Sem o vinculo gravado, o webhook nao acharia o condominio: desfaz no Asaas.
      await removerAssinaturaAsaas(assinatura.id).catch(() => {})
      return json({ error: 'Nao foi possivel registrar a assinatura. Tente de novo.' }, 500)
    }

    const aberta = await cobrancaEmAbertoAsaas(assinatura.id)
    if (!aberta?.url) return json({ error: 'A assinatura foi criada, mas o link de pagamento ainda nao saiu. Tente de novo em instantes.' }, 502)
    return json({ url: aberta.url })
  } catch (error) {
    return json({ error: error.status && error.status < 500 ? `Asaas: ${error.message}` : 'Nao foi possivel falar com o Asaas agora.' }, 502)
  }
}
