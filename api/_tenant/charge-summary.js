import { json, requireAuthenticatedProfile, supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { getChargePaymentStatus, OVERDUE_GRACE_DAYS } from '../../src/lib/chargeStatus.js'
import { buildMonthlyCards, buildMonthlyHistory } from '../../src/lib/condominioResumo.js'
import { ACTIVE_UNIT_STATUSES } from '../../src/lib/units.js'

// Hora de Brasilia (UTC-3) nos campos "locais" da data, como no navegador do morador. Sem isto,
// o servidor (UTC) viraria o mes as 21h do dia 31.
function brazilNow() {
  const now = new Date()
  return new Date(now.getTime() + (now.getTimezoneOffset() - 180) * 60000)
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// Competencia exibida: a mais recente ate o mes atual; se so houver futuras, a mais proxima.
function pickReference(references, current) {
  const sorted = [...references].filter(Boolean).sort()
  if (!sorted.length) return ''
  const pastOrCurrent = sorted.filter((reference) => reference <= current)
  return pastOrCurrent.length ? pastOrCurrent[pastOrCurrent.length - 1] : sorted[0]
}

// Resumo do condominio para o morador (v2.10A5: com valores). So totais: nenhum nome, nenhum
// numero de unidade, nenhuma cobranca individual sai daqui.
export async function GET(req) {
  const auth = await requireAuthenticatedProfile(req)
  if (auth.error) return auth.error

  const condominiumId = auth.profile?.condominium_id
  if (!condominiumId) {
    return json({ error: 'Condominio nao encontrado para o usuario autenticado.' }, 403)
  }

  const [{ data: units, error: unitsError }, { data: charges, error: chargesError }] = await Promise.all([
    supabaseAdmin.from('unidades').select('id, situacao').eq('condominium_id', condominiumId),
    supabaseAdmin
      .from('cobrancas')
      .select('unidade_id, unidade_numero, morador_id, valor, pago, payment_status, vencimento, mes_referencia, data_pagamento, paid_at')
      .or(`condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`),
  ])

  if (unitsError || chargesError) {
    return json({ error: 'Nao foi possivel montar o resumo do condominio.' }, 500)
  }

  const now = brazilNow()
  const activeCharges = (charges || []).filter((charge) => getChargePaymentStatus(charge, now) !== 'CANCELLED')
  const reference = pickReference(new Set(activeCharges.map((charge) => charge.mes_referencia)), monthKey(now))
  const historico = buildMonthlyHistory(activeCharges, 6, now)
  const atual = historico.find((item) => item.ref === reference) || null

  let nextDueDate = ''
  for (const charge of activeCharges) {
    if (charge.mes_referencia !== reference) continue
    if (getChargePaymentStatus(charge, now) !== 'PAID' && charge.vencimento && (!nextDueDate || charge.vencimento < nextDueDate)) {
      nextDueDate = charge.vencimento
    }
  }

  return json({
    total_unidades: (units || []).length,
    unidades_ativas: (units || []).filter((unit) => ACTIVE_UNIT_STATUSES.includes(unit.situacao)).length,
    competencia: reference,
    unidades_cobradas: atual?.unidades || 0,
    proximo_vencimento: nextDueDate,
    carencia_horas: OVERDUE_GRACE_DAYS * 24,
    pago: atual?.pago || 0,
    em_aberto: atual?.em_aberto || 0,
    inadimplente: atual?.inadimplente || 0,
    arrecadacao: atual ? { lancado: atual.lancado, recebido: atual.recebido } : { lancado: 0, recebido: 0 },
    cartoes: buildMonthlyCards(activeCharges, now),
    historico,
    atualizado_em: new Date().toISOString(),
  })
}
