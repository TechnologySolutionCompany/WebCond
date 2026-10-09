import { formatReferenceLabel } from './billingShared.js'
import { getMonthlyChargeBucket } from './chargeStatus.js'

// Resumo do condominio (v2.10A5): os mesmos numeros no painel do sindico e na tela do morador.
// O morador recebe isto pronto do servidor (/api/tenant/charge-summary), so com totais:
// sem nome, sem numero de unidade.

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function paidMonth(charge) {
  if (charge?.paid_at) {
    const date = new Date(charge.paid_at)
    if (!Number.isNaN(date.getTime())) return monthKey(date)
  }
  return String(charge?.data_pagamento || '').slice(0, 7)
}

// Unidade da cobranca, para contar unidades (e nao cobrancas).
export function chargeUnitKey(charge) {
  return charge?.unidade_id || (charge?.unidade_numero ? `n:${charge.unidade_numero}` : `c:${charge?.morador_id || charge?.id}`)
}

// Cartoes: pagos no mes (confirmados neste mes), em aberto (ate o fim do mes do vencimento) e
// inadimplentes (a partir do dia 1 do mes seguinte). Valor somado e quantas unidades.
export function buildMonthlyCards(charges = [], baseDate = new Date()) {
  const current = monthKey(baseDate)
  const total = {
    pago: { valor: 0, unidades: new Set() },
    em_aberto: { valor: 0, unidades: new Set() },
    inadimplente: { valor: 0, unidades: new Set() },
  }
  for (const charge of charges || []) {
    const bucket = getMonthlyChargeBucket(charge, baseDate)
    if (!total[bucket]) continue
    if (bucket === 'pago' && paidMonth(charge) !== current) continue
    total[bucket].valor += Number(charge.valor || 0)
    total[bucket].unidades.add(chargeUnitKey(charge))
  }
  const result = {}
  for (const [key, item] of Object.entries(total)) {
    result[key] = { valor: Math.round(item.valor * 100) / 100, unidades: item.unidades.size }
  }
  return result
}

// Situacao de cada competencia, por unidade: paga so quando todas as cobrancas dela foram
// confirmadas; inadimplente se alguma passou do mes do vencimento.
export function buildMonthlyHistory(charges = [], maxMonths = 6, baseDate = new Date()) {
  const groups = new Map()
  for (const charge of charges || []) {
    const bucket = getMonthlyChargeBucket(charge, baseDate)
    const ref = String(charge?.mes_referencia || '')
    if (!bucket || !/^\d{4}-\d{2}$/.test(ref)) continue
    if (!groups.has(ref)) groups.set(ref, { ref, lancado: 0, recebido: 0, unidades: new Map() })
    const group = groups.get(ref)
    const valor = Number(charge.valor || 0)
    group.lancado += valor
    if (bucket === 'pago') group.recebido += valor

    const key = chargeUnitKey(charge)
    const before = group.unidades.get(key)
    if (bucket === 'inadimplente' || before === 'inadimplente') group.unidades.set(key, 'inadimplente')
    else if (bucket === 'em_aberto' || before === 'em_aberto') group.unidades.set(key, 'em_aberto')
    else group.unidades.set(key, 'pago')
  }

  return Array.from(groups.values())
    .sort((a, b) => a.ref.localeCompare(b.ref))
    .slice(-maxMonths)
    .map((group) => {
      const counts = { pago: 0, em_aberto: 0, inadimplente: 0 }
      for (const status of group.unidades.values()) counts[status] += 1
      return {
        ref: group.ref,
        competencia: formatReferenceLabel(group.ref),
        lancado: Math.round(group.lancado * 100) / 100,
        recebido: Math.round(group.recebido * 100) / 100,
        unidades: group.unidades.size,
        ...counts,
      }
    })
}
