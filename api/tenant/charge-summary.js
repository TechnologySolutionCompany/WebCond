import { json, requireAuthenticatedProfile, supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { getChargePaymentStatus, OVERDUE_GRACE_DAYS } from '../../src/lib/chargeStatus.js'

function currentReference() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Competencia exibida: a mais recente ate o mes atual; se so houver futuras, a mais proxima.
function pickReference(references) {
  const sorted = [...references].filter(Boolean).sort()
  if (!sorted.length) return ''
  const current = currentReference()
  const pastOrCurrent = sorted.filter((reference) => reference <= current)
  return pastOrCurrent.length ? pastOrCurrent[pastOrCurrent.length - 1] : sorted[0]
}

// Resumo anonimizado do condominio (sem nomes nem valores): situacao de cada unidade na competencia.
export async function GET(req) {
  const auth = await requireAuthenticatedProfile(req)
  if (auth.error) return auth.error

  const condominiumId = auth.profile?.condominium_id
  if (!condominiumId) {
    return json({ error: 'Condominio nao encontrado para o usuario autenticado.' }, 403)
  }

  const [{ data: units, error: unitsError }, { data: charges, error: chargesError }] = await Promise.all([
    supabaseAdmin.from('unidades').select('id').eq('condominium_id', condominiumId),
    supabaseAdmin
      .from('cobrancas')
      .select('unidade_id, unidade_numero, morador_id, pago, payment_status, vencimento, mes_referencia')
      .or(`condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`),
  ])

  if (unitsError || chargesError) {
    return json({ error: 'Nao foi possivel montar o resumo do condominio.' }, 500)
  }

  const activeCharges = (charges || []).filter((charge) => getChargePaymentStatus(charge) !== 'CANCELLED')
  const reference = pickReference(new Set(activeCharges.map((charge) => charge.mes_referencia)))
  const statusByUnit = new Map()
  let nextDueDate = ''

  for (const charge of activeCharges) {
    if (charge.mes_referencia !== reference) continue

    const unitKey = charge.unidade_id || (charge.unidade_numero ? `n:${charge.unidade_numero}` : `m:${charge.morador_id}`)
    const status = getChargePaymentStatus(charge)
    const current = statusByUnit.get(unitKey)

    // Unidade paga so quando todas as cobrancas da competencia foram confirmadas.
    if (status === 'OVERDUE' || current === 'inadimplente') statusByUnit.set(unitKey, 'inadimplente')
    else if (status !== 'PAID' || current === 'em_aberto') statusByUnit.set(unitKey, 'em_aberto')
    else statusByUnit.set(unitKey, 'pago')

    if (status !== 'PAID' && charge.vencimento && (!nextDueDate || charge.vencimento < nextDueDate)) {
      nextDueDate = charge.vencimento
    }
  }

  const summary = { pago: 0, em_aberto: 0, inadimplente: 0 }
  for (const status of statusByUnit.values()) summary[status] += 1

  return json({
    total_unidades: (units || []).length,
    competencia: reference,
    unidades_cobradas: statusByUnit.size,
    proximo_vencimento: nextDueDate,
    carencia_horas: OVERDUE_GRACE_DAYS * 24,
    ...summary,
  })
}
