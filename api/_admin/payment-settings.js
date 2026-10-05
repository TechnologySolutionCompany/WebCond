// POST /api/admin/payment-settings (v1.09A5): o sindico define como o condominio recebe.
// Chave Pix e banco (vao no QR Code da fatura) e o provedor: Pix direto ou InfinitePay.
import { ensureServiceRoleConfig, json, parseJsonBody, rejectForeignOrigin, requireCondominiumAdmin, supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { infiniteTagValida, normalizarInfiniteTag, PROVEDORES_RECEBIMENTO } from '../../src/lib/recebimento.js'
import { normalizarChavePix } from '../../src/lib/pix.js'
import { condominiumHasResource } from '../../src/lib/condominiumPlan.js'

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireCondominiumAdmin(req)
  if (auth.error) return auth.error

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) return json({ error: serviceRoleError }, 503)

  const body = await parseJsonBody(req)
  if (!body) return json({ error: 'Corpo da requisicao invalido.' }, 400)

  const pixKey = String(body.pixKey || '').trim().slice(0, 120)
  const bankDestination = String(body.bankDestination || '').trim().slice(0, 80)
  const provedor = PROVEDORES_RECEBIMENTO[body.provedor] ? body.provedor : 'pix_direto'
  const infinitepayTag = normalizarInfiniteTag(body.infinitepayTag)
  const instrucoes = String(body.instrucoes || '').trim().slice(0, 240)

  if (pixKey && !normalizarChavePix(pixKey)) {
    return json({ error: 'Chave Pix invalida. Use e-mail, celular com DDD, CPF, CNPJ ou chave aleatoria.' }, 400)
  }
  if (provedor === 'infinitepay' && !infiniteTagValida(infinitepayTag)) {
    return json({ error: 'Informe a InfiniteTag da conta InfinitePay do condominio (o nome depois do $).' }, 400)
  }

  const condominiumId = auth.profile.condominium_id
  const { data: condominio, error: loadError } = await supabaseAdmin
    .from('condominiums')
    .select('id, status, metadata, created_at, updated_at')
    .eq('id', condominiumId)
    .maybeSingle()
  if (loadError || !condominio) return json({ error: 'Condominio nao encontrado.' }, 404)
  if (provedor === 'infinitepay' && !condominiumHasResource(condominio, 'baixaAutomatica')) {
    return json({ error: 'O vinculo com o banco e a baixa automatica fazem parte do Plano PRO.', code: 'PLANO' }, 403)
  }

  const metadata = condominio.metadata && typeof condominio.metadata === 'object' ? condominio.metadata : {}
  const { error } = await supabaseAdmin
    .from('condominiums')
    .update({
      pix_key: pixKey,
      chave_pix: pixKey,
      bank_details: bankDestination,
      metadata: {
        ...metadata,
        recebimento: {
          provedor,
          infinitepay_tag: provedor === 'infinitepay' ? infinitepayTag : String(metadata.recebimento?.infinitepay_tag || ''),
          mostrar_unidades_abertas: body.mostrarUnidadesAbertas !== false,
          instrucoes,
          atualizado_em: new Date().toISOString(),
          atualizado_por: auth.profile.id,
        },
      },
    })
    .eq('id', condominiumId)

  if (error) return json({ error: 'Nao foi possivel salvar as formas de recebimento.' }, 500)
  return json({ success: true })
}
